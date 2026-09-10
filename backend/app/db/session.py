"""Engine/sessão do banco — SQLite em desenvolvimento, PostgreSQL em
produção (mudança de configuração via CORE_DATABASE_URL, não de código —
mesmo padrão do RE7S, ver Rock Eval Horun Dev/backend/app/db/session.py).

`create_all()` só cria tabelas que ainda não existem — nunca altera uma
tabela que já existe, mesmo que o modelo Python tenha ganhado uma coluna
nova (mesma pegadinha documentada no RE7S). Como o Core já está em
produção com dados reais (usuários cadastrados), `_run_migrations()`
cobre isso pra colunas adicionadas depois do primeiro deploy — em SQLite
(dev, banco sempre recriado do zero nos testes) isso é essencialmente
inofensivo/não roda; em Postgres (produção) é o que evita "column does
not exist" ao reiniciar o backend depois de um `git pull`.
"""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import inspect
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)


def _ensure_column(table: str, column: str, ddl_type: str) -> None:
    existing = {c["name"] for c in inspect(engine).get_columns(table)}
    if column in existing:
        return
    with engine.begin() as conn:
        conn.exec_driver_sql(f'ALTER TABLE "{table}" ADD COLUMN {column} {ddl_type}')


_USER_TEXT_COLUMNS = ("full_name", "email", "phone", "position", "qualification", "display_name")


def _backfill_null_text(table: str, columns: tuple[str, ...]) -> None:
    """Contas criadas antes destas colunas existirem ficam com NULL; o
    modelo e as respostas da API (`UserOut`, etc.) esperam string, e um
    NULL derruba o login inteiro com 500. Idempotente — o WHERE faz virar
    no-op assim que não há mais nada pra consertar."""
    existing = {c["name"] for c in inspect(engine).get_columns(table)}
    cols = [c for c in columns if c in existing]
    if not cols:
        return
    set_clause = ", ".join(f"{c} = COALESCE({c}, '')" for c in cols)
    where_clause = " OR ".join(f"{c} IS NULL" for c in cols)
    with engine.begin() as conn:
        conn.exec_driver_sql(f'UPDATE "{table}" SET {set_clause} WHERE {where_clause}')


def _run_migrations() -> None:
    _ensure_column("user", "full_name", "VARCHAR")
    _ensure_column("user", "email", "VARCHAR")
    _ensure_column("user", "phone", "VARCHAR")
    _ensure_column("user", "position", "VARCHAR")
    _ensure_column("user", "qualification", "VARCHAR")
    _ensure_column("user", "photo", "BYTEA" if engine.dialect.name == "postgresql" else "BLOB")
    _ensure_column("user", "photo_content_type", "VARCHAR")
    _ensure_column("user", "setup_code", "VARCHAR")
    _backfill_null_text("user", _USER_TEXT_COLUMNS)
    # DEFAULT TRUE: as contas que já existiam quando a coluna foi criada
    # não passam pelo onboarding (só as criadas depois, que nascem False
    # pelo default do modelo Python).
    _ensure_column("user", "onboarded", "BOOLEAN DEFAULT TRUE")

    # password_hash era obrigatório (NOT NULL) — agora uma conta pode
    # nascer sem senha (seção "Criação sem senha"). SQLite não suporta
    # soltar NOT NULL via ALTER TABLE simples, mas não precisa: um banco
    # SQLite novo já nasce certo a partir do modelo atual (create_all),
    # dev sempre recria o arquivo do zero. Só Postgres, com dado real já
    # gravado antes dessa mudança, precisa do ALTER de verdade.
    _blob = "BYTEA" if engine.dialect.name == "postgresql" else "BLOB"
    _ensure_column("post", "attachment", _blob)
    _ensure_column("post", "attachment_content_type", "VARCHAR")
    _ensure_column("post", "attachment_filename", "VARCHAR")

    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.exec_driver_sql('ALTER TABLE "user" ALTER COLUMN password_hash DROP NOT NULL')
            # `module.codename` saiu do modelo (codinomes nunca aparecem —
            # Prompt_Horun_Core.md §2). Numa instalação que já rodou antes
            # disso, a coluna ficou NOT NULL e quebra o INSERT de módulo
            # novo com "null value violates not-null constraint".
            conn.exec_driver_sql('ALTER TABLE "module" DROP COLUMN IF EXISTS codename')


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    _run_migrations()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
