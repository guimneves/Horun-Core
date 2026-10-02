from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import routes_example
from app.db.session import create_db_and_tables


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # cria tabelas novas e roda as migrações defensivas (app/db/session.py)
    create_db_and_tables()
    yield


app = FastAPI(title="Horun · __MODULE_NAME__", version="0.1.0", lifespan=lifespan)

app.include_router(routes_example.router)


@app.get("/health")
def health():
    # Sem autenticação — usado pelo Horun Core para o dashboard de status
    # (Prompt_Horun_Core.md, seção 5). Não expor aqui nada além do status.
    return {"status": "ok", "module": "__MODULE_ID__"}
