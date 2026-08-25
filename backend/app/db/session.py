"""Engine/sessão do banco — SQLite em desenvolvimento, PostgreSQL em
produção (mudança de configuração via CORE_DATABASE_URL, não de código —
mesmo padrão do RE7S, ver Rock Eval Horun Dev/backend/app/db/session.py).
"""

from __future__ import annotations

from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
