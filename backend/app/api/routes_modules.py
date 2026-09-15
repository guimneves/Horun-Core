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
from app.db.models import Module, ModuleContributor, User, UserModuleAccess

router = APIRouter(tags=["modules"])


# Codinomes internos nunca entram nas respostas da API nem em tela
# nenhuma — nem são guardados no banco (ver a regra no
# Prompt_Horun_Core.md, seção 2).
class ModuleIn(BaseModel):
    id: str
    display_name: str
    description: str = ""
    icon: str = "🧪"
    internal_base_url: str
    health_path: str = "/health"
    internal_frontend_url: str = ""


class ModuleOut(BaseModel):
    id: str
    display_name: str
    description: str
    icon: str
    internal_base_url: str
    health_path: str
    internal_frontend_url: str


class ModuleStatusOut(BaseModel):
    id: str
    display_name: str
    description: str
    icon: str
    status: str  # "online" | "offline"
    has_access: bool
    # Se True, a interface do módulo pode ser aberta dentro do Core
    # (GET /m/{id}/) — ver Prompt_Horun_Core.md, seção 8.
    embeddable: bool


def _out(m: Module) -> ModuleOut:
    # `or ...` de defesa: um módulo cadastrado numa versão antiga pode ter
    # colunas NULL (ex. internal_frontend_url veio depois) — não pode
    # derrubar GET /modules com 500. A migração já preenche; isto é cinto.
    return ModuleOut(
        id=m.id,
        display_name=m.display_name or m.id,
        description=m.description or "",
        icon=m.icon or "🧪",
        internal_base_url=m.internal_base_url or "",
        health_path=m.health_path or "/health",
        internal_frontend_url=m.internal_frontend_url or "",
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
    base = (module.internal_base_url or "").rstrip("/")
    if not base:
        return False
    url = base + (module.health_path or "/health")
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
                display_name=m.display_name or m.id,
                description=m.description or "",
                icon=m.icon or "🧪",
                status="online" if online else "offline",
                has_access=user.is_super_admin or m.id in access_ids,
                embeddable=bool(m.internal_frontend_url),
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


# --- Contribuidores (créditos por módulo, tela "Sobre") -------------------


class ContributorIn(BaseModel):
    user_id: int


class ContributorOut(BaseModel):
    user_id: int
    display_name: str
    has_photo: bool


def _contributor_out(u: User) -> ContributorOut:
    return ContributorOut(user_id=u.id, display_name=u.display_name or u.username, has_photo=u.photo is not None)


@router.get("/modules/{module_id}/contributors", response_model=list[ContributorOut])
def list_module_contributors(module_id: str, _user: CurrentUser, session: SessionDep):
    """Aberto a qualquer autenticado — é o que alimenta a tela "Sobre",
    que mostra os créditos de todo módulo pra todo mundo."""
    if session.get(Module, module_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Módulo não encontrado")
    rows = session.exec(select(ModuleContributor).where(ModuleContributor.module_id == module_id)).all()
    out = []
    for r in rows:
        u = session.get(User, r.user_id)
        if u is not None:
            out.append(_contributor_out(u))
    return out


@router.post("/modules/{module_id}/contributors", response_model=ContributorOut)
def add_module_contributor(module_id: str, payload: ContributorIn, _admin: SuperAdminUser, session: SessionDep):
    module = session.get(Module, module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Módulo não encontrado")
    target = session.get(User, payload.user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuário não encontrado")

    existing = session.exec(
        select(ModuleContributor)
        .where(ModuleContributor.module_id == module_id)
        .where(ModuleContributor.user_id == payload.user_id)
    ).first()
    if existing is not None:
        return _contributor_out(target)

    session.add(ModuleContributor(module_id=module_id, user_id=payload.user_id))
    session.commit()
    return _contributor_out(target)


@router.delete("/modules/{module_id}/contributors/{user_id}")
def remove_module_contributor(module_id: str, user_id: int, _admin: SuperAdminUser, session: SessionDep):
    row = session.exec(
        select(ModuleContributor)
        .where(ModuleContributor.module_id == module_id)
        .where(ModuleContributor.user_id == user_id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contribuidor não encontrado")
    session.delete(row)
    session.commit()
    return {"ok": True}
