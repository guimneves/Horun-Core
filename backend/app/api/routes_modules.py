"""Cadastro de módulos, permissões e dashboard de status (Prompt_Horun_Core.md,
seções 5 e 6). O dashboard é visível a todo usuário autenticado,
independente de ter permissão — só o botão de abrir/usar é que respeita a
permissão (seção 5: "todo usuário vê quais módulos estão operacionais")."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, SuperAdminUser
from app.core.config import settings
from app.db.models import Module, User, UserModuleAccess

router = APIRouter(tags=["modules"])


class ModuleIn(BaseModel):
    id: str
    display_name: str
    codename: str = ""
    description: str = ""
    icon: str = "🧪"
    internal_base_url: str
    health_path: str = "/health"


class ModuleOut(BaseModel):
    id: str
    display_name: str
    codename: str
    description: str
    icon: str
    internal_base_url: str
    health_path: str


class ModuleStatusOut(BaseModel):
    id: str
    display_name: str
    codename: str
    description: str
    icon: str
    status: str  # "online" | "offline"
    has_access: bool


def _out(m: Module) -> ModuleOut:
    return ModuleOut(
        id=m.id,
        display_name=m.display_name,
        codename=m.codename,
        description=m.description,
        icon=m.icon,
        internal_base_url=m.internal_base_url,
        health_path=m.health_path,
    )


@router.post("/modules", response_model=ModuleOut)
def create_module(payload: ModuleIn, _admin: SuperAdminUser, session: SessionDep):
    existing = session.get(Module, payload.id)
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe um módulo com esse id")
    module = Module(**payload.model_dump())
    session.add(module)
    session.commit()
    session.refresh(module)
    return _out(module)


@router.get("/modules", response_model=list[ModuleOut])
def list_modules(_admin: SuperAdminUser, session: SessionDep):
    modules = session.exec(select(Module)).all()
    return [_out(m) for m in modules]


@router.patch("/modules/{module_id}", response_model=ModuleOut)
def update_module(module_id: str, payload: ModuleIn, _admin: SuperAdminUser, session: SessionDep):
    module = session.get(Module, module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Módulo não encontrado")
    for field, value in payload.model_dump().items():
        if field == "id":
            continue
        setattr(module, field, value)
    session.add(module)
    session.commit()
    session.refresh(module)
    return _out(module)


@router.delete("/modules/{module_id}")
def delete_module(module_id: str, _admin: SuperAdminUser, session: SessionDep):
    module = session.get(Module, module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Módulo não encontrado")
    session.delete(module)
    session.commit()
    return {"ok": True}


async def _check_module_online(module: Module) -> bool:
    url = module.internal_base_url.rstrip("/") + module.health_path
    try:
        async with httpx.AsyncClient(timeout=settings.module_health_timeout_seconds) as http_client:
            resp = await http_client.get(url)
        return resp.status_code == 200
    except httpx.HTTPError:
        return False


@router.get("/dashboard/modules", response_model=list[ModuleStatusOut])
async def dashboard_modules(user: CurrentUser, session: SessionDep):
    """Todo usuário autenticado vê todo módulo cadastrado e seu status —
    a permissão só decide `has_access` (Prompt_Horun_Core.md, seção 5)."""
    modules = session.exec(select(Module)).all()

    access_ids: set[str] = set()
    if not user.is_super_admin:
        grants = session.exec(
            select(UserModuleAccess).where(UserModuleAccess.user_id == user.id)
        ).all()
        access_ids = {g.module_id for g in grants}

    out: list[ModuleStatusOut] = []
    for m in modules:
        online = await _check_module_online(m)
        out.append(
            ModuleStatusOut(
                id=m.id,
                display_name=m.display_name,
                codename=m.codename,
                description=m.description,
                icon=m.icon,
                status="online" if online else "offline",
                has_access=user.is_super_admin or m.id in access_ids,
            )
        )
    return out


class AccessGrantRequest(BaseModel):
    user_id: int


class AccessOut(BaseModel):
    user_id: int
    username: str


@router.get("/modules/{module_id}/access", response_model=list[AccessOut])
def list_module_access(module_id: str, _admin: SuperAdminUser, session: SessionDep):
    module = session.get(Module, module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Módulo não encontrado")
    grants = session.exec(select(UserModuleAccess).where(UserModuleAccess.module_id == module_id)).all()
    out = []
    for g in grants:
        u = session.get(User, g.user_id)
        if u is not None:
            out.append(AccessOut(user_id=u.id, username=u.username))
    return out


@router.post("/modules/{module_id}/access")
def grant_module_access(
    module_id: str, payload: AccessGrantRequest, admin: SuperAdminUser, session: SessionDep
):
    module = session.get(Module, module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Módulo não encontrado")
    target_user = session.get(User, payload.user_id)
    if target_user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuário não encontrado")

    existing = session.exec(
        select(UserModuleAccess)
        .where(UserModuleAccess.module_id == module_id)
        .where(UserModuleAccess.user_id == payload.user_id)
    ).first()
    if existing is not None:
        return {"ok": True}

    grant = UserModuleAccess(user_id=payload.user_id, module_id=module_id, granted_by_id=admin.id)
    session.add(grant)
    session.commit()
    return {"ok": True}


@router.delete("/modules/{module_id}/access/{user_id}")
def revoke_module_access(module_id: str, user_id: int, _admin: SuperAdminUser, session: SessionDep):
    grant = session.exec(
        select(UserModuleAccess)
        .where(UserModuleAccess.module_id == module_id)
        .where(UserModuleAccess.user_id == user_id)
    ).first()
    if grant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Permissão não encontrada")
    session.delete(grant)
    session.commit()
    return {"ok": True}
