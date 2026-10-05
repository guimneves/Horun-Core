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
    is_pg = engine.dialect.name == "postgresql"
    blob = "BYTEA" if is_pg else "BLOB"

    # --- user: colunas de perfil/foto/primeiro-acesso adicionadas depois ---
    _ensure_column("user", "full_name", "VARCHAR")
    _ensure_column("user", "email", "VARCHAR")
    _ensure_column("user", "phone", "VARCHAR")
    _ensure_column("user", "position", "VARCHAR")
    _ensure_column("user", "qualification", "VARCHAR")
    _ensure_column("user", "photo", blob)
    _ensure_column("user", "photo_content_type", "VARCHAR")
    _ensure_column("user", "setup_code", "VARCHAR")
    _ensure_column("user", "session_version", "INTEGER DEFAULT 0")
    _ensure_column("user", "setup_code_expires_at", "TIMESTAMP")
    _ensure_column("user", "birth_day", "INTEGER")
    _ensure_column("user", "birth_month", "INTEGER")
    _ensure_column("user", "birth_year", "INTEGER")
    _ensure_column("user", "email_notifications", "BOOLEAN DEFAULT TRUE")
    _backfill_null_text("user", _USER_TEXT_COLUMNS)
    # DEFAULT TRUE: as contas que já existiam quando a coluna foi criada
    # não passam pelo onboarding (só as criadas depois, que nascem False
    # pelo default do modelo Python).
    _ensure_column("user", "onboarded", "BOOLEAN DEFAULT TRUE")

    # --- module: colunas que entraram depois do primeiro deploy (ex.
    # internal_frontend_url veio junto com o encaixe de interface) — numa
    # instalação antiga elas não existem e o GET /modules quebra com
    # "column does not exist". O DEFAULT já preenche as linhas existentes.
    _ensure_column("module", "description", "VARCHAR DEFAULT ''")
    _ensure_column("module", "icon", "VARCHAR DEFAULT '🧪'")
    _ensure_column("module", "health_path", "VARCHAR DEFAULT '/health'")
    _ensure_column("module", "internal_frontend_url", "VARCHAR DEFAULT ''")
    _backfill_null_text("module", ("description", "internal_frontend_url", "display_name"))
    _ensure_column("module", "public", "BOOLEAN DEFAULT FALSE")
    _ensure_column("module", "unlisted", "BOOLEAN DEFAULT FALSE")

    # --- post: anexos + escopo de grupo (Fase 2) ---
    _ensure_column("post", "attachment", blob)
    _ensure_column("post", "attachment_content_type", "VARCHAR")
    _ensure_column("post", "attachment_filename", "VARCHAR")
    _ensure_column("post", "group_id", "INTEGER")

    # --- event: escopo de grupo (Fase 2) ---
    _ensure_column("event", "group_id", "INTEGER")

    # --- equipment: perfil rico (área, descrição, foto, AnyDesk, POPs,
    # módulo vinculado) — Fase A da página Equipamentos ---
    _ensure_column("equipment", "description", "VARCHAR DEFAULT ''")
    _ensure_column("equipment", "area_id", "INTEGER")
    _ensure_column("equipment", "module_id", "VARCHAR")
    _ensure_column("equipment", "anydesk_id", "VARCHAR DEFAULT ''")
    _ensure_column("equipment", "pop_folder_path", "VARCHAR DEFAULT ''")
    _ensure_column("equipment", "photo", blob)
    _ensure_column("equipment", "photo_content_type", "VARCHAR")
    _backfill_null_text("equipment", ("description", "anydesk_id", "pop_folder_path"))

    # --- equipment: identidade (cabeçalho da ficha RUE de papel) ---
    _ensure_column("equipment", "manufacturer", "VARCHAR DEFAULT ''")
    _ensure_column("equipment", "model_name", "VARCHAR DEFAULT ''")
    _ensure_column("equipment", "serial_number", "VARCHAR DEFAULT ''")
    _ensure_column("equipment", "asset_tag", "VARCHAR DEFAULT ''")
    _backfill_null_text("equipment", ("manufacturer", "model_name", "serial_number", "asset_tag"))
    _ensure_column("equipment", "type_id", "INTEGER")
    _ensure_column("equipment", "voltage", "VARCHAR DEFAULT ''")
    _backfill_null_text("equipment", ("voltage",))

    # --- equipmentlog: ficha de utilização (RUE) — campos da ficha de
    # papel do laboratório, além dos que já existiam (Fase B) ---
    _ensure_column("equipmentlog", "purpose", "VARCHAR DEFAULT 'AN'")
    _ensure_column("equipmentlog", "experiment_code", "VARCHAR DEFAULT ''")
    _ensure_column("equipmentlog", "ended_at", "TIMESTAMP")
    _ensure_column("equipmentlog", "verified_by_id", "INTEGER")
    _ensure_column("equipmentlog", "verified_at", "TIMESTAMP")
    _backfill_null_text("equipmentlog", ("purpose", "experiment_code"))

    # --- notificações pedidas por módulos (routes_module_notify.py) ---
    _ensure_column("module", "notify_token_hash", "VARCHAR DEFAULT ''")
    _backfill_null_text("module", ("notify_token_hash",))
    _ensure_column("notification", "module_id", "VARCHAR")

    # --- lembretes da Agenda (services/calendar_notify.py) ---
    _ensure_column("event", "reminder_sent_at", "TIMESTAMP")
    _ensure_column("reservation", "reminder_sent_at", "TIMESTAMP")

    if is_pg:
        # SQLite não suporta esses ALTER, mas também não precisa: dev sempre
        # recria o arquivo do zero a partir do modelo atual.
        with engine.begin() as conn:
            conn.exec_driver_sql('ALTER TABLE "user" ALTER COLUMN password_hash DROP NOT NULL')
            # `module.codename` saiu do modelo (codinomes nunca aparecem —
            # Prompt_Horun_Core.md §2). Numa instalação que já rodou antes
            # disso, a coluna ficou NOT NULL e quebra o INSERT de módulo
            # novo com "null value violates not-null constraint".
            conn.exec_driver_sql('ALTER TABLE "module" DROP COLUMN IF EXISTS codename')


def migrate_promoted_admins_to_coordinators(bind=None) -> int:
    """Níveis de permissão (core/permissions.py) passaram a vir da POSIÇÃO.
    Quem tinha sido promovido a "administrador máximo" (is_super_admin, sem
    ser a conta original) vira Coordenador(a) — o nível que manteve quase
    todos os poderes (decisão do usuário, 2026-10-01) — e a flag é zerada.

    Zerar a flag é o que torna isto idempotente e seguro: sem isso, a
    próxima subida forçaria a posição de volta para Coordenador(a) mesmo
    depois de alguém mudá-la. A conta original (is_protected) mantém a
    flag e é nível 1 de qualquer jeito. Devolve quantas contas mudaram."""
    from sqlmodel import select

    from app.db.models import User

    with Session(bind or engine) as session:
        promoted = session.exec(
            select(User).where(User.is_super_admin == True, User.is_protected == False)  # noqa: E712
        ).all()
        for user in promoted:
            user.position = "Coordenador(a)"
            user.is_super_admin = False
            session.add(user)
        session.commit()
        return len(promoted)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    _run_migrations()
    migrate_promoted_admins_to_coordinators()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
