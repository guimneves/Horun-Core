from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from app.api import routes_auth, routes_modules, routes_proxy
from app.core.security import hash_password
from app.db.models import User
from app.db.session import create_db_and_tables, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    _bootstrap_super_admin_if_configured()
    yield


app = FastAPI(title="Horun Core", version="0.1.0", lifespan=lifespan)

# Desenvolvimento: frontend roda em outra porta no mesmo localhost (Vite
# dev server) — CORS liberado só para localhost, mesmo padrão do RE7S. Em
# produção o front é servido pelo mesmo Caddy/origem do Core, sem CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_auth.router)
app.include_router(routes_modules.router)
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
