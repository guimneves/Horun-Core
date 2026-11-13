"""O padrão de migração do módulo funciona no SQLite e gera SQL certo para o
Postgres (produção) — ver app/db/session.py."""

from sqlalchemy import create_engine, inspect
from sqlalchemy.dialects import postgresql

import app.db.session as session_module


def test_postgres_ddl_quotes_reserved_names_and_translates_types():
    pg = postgresql.dialect()
    assert session_module.add_column_ddl(pg, "user", "apelido", "VARCHAR") == 'ALTER TABLE "user" ADD COLUMN apelido VARCHAR'
    assert session_module.add_column_ddl(pg, "x", "quando", "DATETIME") == "ALTER TABLE x ADD COLUMN quando TIMESTAMP"
    assert session_module.add_column_ddl(pg, "x", "ok", "BOOLEAN", default_sql="0") == (
        "ALTER TABLE x ADD COLUMN ok BOOLEAN DEFAULT FALSE"
    )


def test_ensure_column_adds_to_an_existing_table(tmp_path):
    legacy = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with legacy.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE amostra (id INTEGER PRIMARY KEY)")
    original = session_module.engine
    session_module.engine = legacy
    try:
        session_module._ensure_column("amostra", "observacoes", "VARCHAR")
        session_module._ensure_column("amostra", "observacoes", "VARCHAR")  # idempotente
        session_module._ensure_column("tabela_nova", "x", "VARCHAR")  # tabela ausente: não quebra
        assert "observacoes" in {c["name"] for c in inspect(legacy).get_columns("amostra")}
    finally:
        session_module.engine = original
