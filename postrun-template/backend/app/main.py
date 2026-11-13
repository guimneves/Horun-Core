from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import settings
from app.core.identity import get_identity
from app.db.session import create_db_and_tables, engine, get_session
from app.equipment import EQUIPMENT
from app.postrun_core.publish import DisabledPublisher, HttpPublisher, start_outbox_worker
from app.postrun_core.routes import PostrunConfig, build_router
from app.postrun_core.sources import AgentSource, LocalFolderSource

source = AgentSource(EQUIPMENT.agent_root) if settings.agent_mode else LocalFolderSource(settings.data_dir)
publisher = (
    HttpPublisher(settings.resultados_url, settings.resultados_token)
    if settings.resultados_url and settings.resultados_token
    else DisabledPublisher()
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # cria tabelas novas e roda as migrações defensivas (app/db/session.py)
    create_db_and_tables()
    # reenvia ao Resultados o que ficou pendente (Resultados fora do ar etc.)
    stop = start_outbox_worker(engine, publisher, interval_seconds=settings.outbox_retry_seconds)
    yield
    stop.set()


app = FastAPI(title="Horun · __MODULE_NAME__", version="0.1.0", lifespan=lifespan)

app.include_router(
    build_router(
        get_session=get_session,
        get_identity=get_identity,
        plugin=EQUIPMENT,
        source=source,
        publisher=publisher,
        config=PostrunConfig(
            module_id="__MODULE_ID__",
            validate_max_level=settings.validate_max_level,
            unpublish_max_level=settings.unpublish_max_level,
            # pelo Agente, a varredura para antes do tempo limite do Core (30 s)
            scan_budget_seconds=20.0 if settings.agent_mode else None,
        ),
    ),
    prefix="/api",
)

try:  # servidor do Agente (copiado por Agent-Horun/scripts/vendor_server.py)
    from app.api.routes_agent import router as agent_router
except ImportError:  # sem a cópia: só funciona com POSTRUN_DATA_DIR (desenvolvimento)
    agent_router = None
if agent_router is not None:
    app.include_router(agent_router, prefix="/api")


@app.get("/health")
def health():
    # Sem autenticação — usado pelo Horun Core para o dashboard de status
    # (Prompt_Horun_Core.md, seção 5). Não expor aqui nada além do status.
    return {"status": "ok", "module": "__MODULE_ID__"}
