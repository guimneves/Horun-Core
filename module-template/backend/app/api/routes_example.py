"""Rota de exemplo — apagar/substituir pela lógica de negócio real do
módulo. Mostra o padrão de uso da identidade injetada pelo Core."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.identity import HorunIdentity, get_identity

router = APIRouter(prefix="/example", tags=["example"])


@router.get("/whoami")
def whoami(identity: HorunIdentity = Depends(get_identity)):
    return {"user_id": identity.user_id, "username": identity.username, "role": identity.role}
