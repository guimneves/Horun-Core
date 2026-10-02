from __future__ import annotations

import os
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from app.api import (
    routes_admin,
    routes_auth,
    routes_equipment,
    routes_events,
    routes_groups,
    routes_modules,
    routes_notifications,
    routes_posts,
    routes_proxy,
    routes_reservations,
    routes_search,
    routes_suggestions,
)
from app.core.config import check_production_settings
from app.core.scheduler import shutdown_scheduler, start_scheduler
from app.core.security import hash_password
from app.db.models import User
from app.db.session import create_db_and_tables, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    check_production_settings()
    create_db_and_tables()
    _bootstrap_super_admin_if_configured()
    start_scheduler()
    yield
    shutdown_scheduler()


app = FastAPI(title="Horun Core", version="0.1.0", lifespan=lifespan)

# Desenvolvimento: frontend roda em outra porta no mesmo localhost (Vite
# dev server) — CORS liberado só para localhost, mesmo padrão do RE7S. Em
# produção o front é servido pelo mesmo Caddy/origem do Core, sem CORS.
DEV_ORIGINS = ["http://localhost:5174", "http://127.0.0.1:5174"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def reject_cross_site_writes(request: Request, call_next):
    """Defesa contra CSRF: um pedido que ALTERA dados e vem com `Origin` de
    outro site é recusado. O cookie já é SameSite=Lax (o navegador não o
    manda num POST de outro site), isto é a segunda camada — cobre também o
    POST multipart do Mural, que passa como "pedido simples" sem preflight.
    Sem `Origin` (curl, agentes, testes) segue normal: o que protege nesses
    casos é o próprio cookie de sessão, que só o navegador tem."""
    origin = request.headers.get("origin")
    if request.method in _UNSAFE_METHODS and origin and origin not in DEV_ORIGINS:
        host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
        if urlsplit(origin).netloc != host:
            return JSONResponse({"detail": "Origem não permitida"}, status_code=403)
    return await call_next(request)

app.include_router(routes_auth.router)
app.include_router(routes_modules.router)
app.include_router(routes_posts.router)
app.include_router(routes_notifications.router)
app.include_router(routes_equipment.router)
app.include_router(routes_reservations.router)
app.include_router(routes_events.router)
app.include_router(routes_groups.router)
app.include_router(routes_search.router)
app.include_router(routes_suggestions.router)
app.include_router(routes_admin.router)
app.include_router(routes_proxy.router)


def _bootstrap_super_admin_if_configured() -> None:
    """Mesmo padrão do RE7S: se não existe nenhum usuário ainda, cria o
    primeiro administrador máximo a partir de variáveis de ambiente."""
    username = os.environ.get("CORE_BOOTSTRAP_ADMIN_USERNAME")
    password = os.environ.get("CORE_BOOTSTRAP_ADMIN_PASSWORD")
    if not username or not password:
        return

    with Session(engine) as session:
        if session.exec(select(User)).first() is not None:
            return
        session.add(
            User(
                username=username,
                password_hash=hash_password(password),
                display_name=username,
                is_super_admin=True,
                is_protected=True,
            )
        )
        session.commit()


@app.get("/health")
def health():
    return {"status": "ok", "project": "Horun Core"}
