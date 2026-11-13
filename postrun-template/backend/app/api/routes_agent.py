"""Rotas /agent/* do Agente Horun (o programa no PC do equipamento que dá
acesso aos arquivos brutos). Vêm do pacote único do servidor do Agente,
copiado em `app/agent_server/` por `Agent-Horun/scripts/vendor_server.py` —
sem essa cópia, este import falha e o módulo roda só com POSTRUN_DATA_DIR.

Administração (códigos de enrolamento, instalações): coordenação (níveis 1–2).
As rotas do próprio agente chegam por uma porta estreita (ver
Prompt_Horun_Modulo.md, seção 10), nunca pelo gateway do Core.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status

from app.agent_server.routes import build_router
from app.core.identity import HorunIdentity, get_identity
from app.db.session import get_session


def require_coordination(identity: HorunIdentity = Depends(get_identity)) -> HorunIdentity:
    if identity.level > 2:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só a coordenação administra o Agente.")
    return identity


def _actor(identity: HorunIdentity) -> tuple[int | None, str | None]:
    return (int(identity.user_id) if str(identity.user_id).isdigit() else None, identity.username)


router = build_router(get_session=get_session, admin_dependency=require_coordination, actor_of=_actor)
