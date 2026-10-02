"""Banco do módulo — SQLite em desenvolvimento, PostgreSQL em produção (a URL
vem de MODULE_DATABASE_URL, ver core/config.py).

REGRA (já derrubou módulos em produção mais de uma vez): `create_all()` só
cria tabela que não existe — NUNCA adiciona coluna a uma tabela existente.
Todo campo novo num modelo que já tem tabela em produção ganha uma linha de
`_ensure_column` em `_run_migrations`, NO MESMO COMMIT. A migração roda na
subida do backend, em qualquer banco (SQLite e Postgres).
"""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import inspect
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)

# Tipos/defaults escritos no estilo SQLite traduzidos para o Postgres.
_PG_TYPES = {"DATETIME": "TIMESTAMP"}
_PG_BOOL_DEFAULTS = {"0": "FALSE", "1": "TRUE"}


def add_column_ddl(dialect, table: str, column: str, ddl_type: str, default_sql: str | None = None) -> str:
    """`ALTER TABLE ... ADD COLUMN` para o banco em uso. Nomes entre aspas pelo
    próprio dialeto — `user`, por exemplo, é palavra reservada no Postgres."""
    quote = dialect.identifier_preparer.quote
    if dialect.name == "postgresql":
        if ddl_type.upper() == "BOOLEAN" and default_sql is not None:
            default_sql = _PG_BOOL_DEFAULTS.get(default_sql.strip(), default_sql)
        ddl_type = _PG_TYPES.get(ddl_type.upper(), ddl_type)
    stmt = f"ALTER TABLE {quote(table)} ADD COLUMN {quote(column)} {ddl_type}"
    if default_sql is not None:
        stmt += f" DEFAULT {default_sql}"
    return stmt


def _ensure_column(table: str, column: str, ddl_type: str, default_sql: str | None = None) -> None:
    inspector = inspect(engine)
    if not inspector.has_table(table):
        return  # tabela nova: o create_all já cria com todas as colunas
    if column in {c["name"] for c in inspector.get_columns(table)}:
        return
    with engine.begin() as conn:
        conn.exec_driver_sql(add_column_ddl(engine.dialect, table, column, ddl_type, default_sql))


def _run_migrations() -> None:
    # Uma linha por coluna adicionada a um modelo depois do primeiro deploy.
    # Exemplo:
    #   _ensure_column("amostra", "observacoes", "VARCHAR")
    #   _ensure_column("amostra", "conferida", "BOOLEAN", default_sql="0")
    pass


def create_db_and_tables() -> None:
    # importar os modelos aqui (ex. `from app.db import models  # noqa: F401`)
    # antes do create_all, para as tabelas estarem registradas
    SQLModel.metadata.create_all(engine)
    _run_migrations()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
