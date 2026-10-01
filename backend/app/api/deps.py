from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session

from app.core.permissions import can_manage_equipment, can_manage_modules, can_moderate, is_coordinator_or_above
from app.core.security import SESSION_COOKIE_NAME, read_session_token
from app.db.models import User
from app.db.session import get_session

SessionDep = Annotated[Session, Depends(get_session)]


def get_current_user(request: Request, session: SessionDep) -> User:
    token = request.cookies.get(SESSION_COOKIE_NAME, "")
    user_id = read_session_token(token)
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Não autenticado")
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuário não encontrado")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


# Níveis de permissão: regra em app/core/permissions.py (seção 6 do
# Prompt_Horun_Core.md). Cada dependência abaixo corresponde a uma
# capacidade, não a um nível — a rota diz O QUE exige, não QUEM.


def require_coordinator(user: CurrentUser) -> User:
    """Administração geral (usuários, permissões de módulo, grupos) — nível
    2 (Coordenador) ou 1."""
    if not is_coordinator_or_above(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ação restrita a coordenadores")
    return user


CoordinatorUser = Annotated[User, Depends(require_coordinator)]


def require_module_admin(user: CurrentUser) -> User:
    """Cadastro e integração de módulos — só o nível 1."""
    if not can_manage_modules(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ação restrita ao administrador máximo")
    return user


ModuleAdminUser = Annotated[User, Depends(require_module_admin)]


def require_equipment_manager(user: CurrentUser) -> User:
    """Equipamentos, áreas e tipos — níveis 1, 2 e 4 (Técnico)."""
    if not can_manage_equipment(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ação restrita a coordenadores e técnicos")
    return user


EquipmentManagerUser = Annotated[User, Depends(require_equipment_manager)]


def require_moderator(user: CurrentUser) -> User:
    """Mexer no que é de outras pessoas (moderação) — níveis 1 a 4."""
    if not can_moderate(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ação restrita a pesquisadores, técnicos e coordenadores")
    return user


ModeratorUser = Annotated[User, Depends(require_moderator)]


def require_protected(user: CurrentUser) -> User:
    """Dependência para rotas restritas ao administrador *original* — a
    conta protegida de bootstrap (`User.is_protected`), não qualquer
    administrador máximo promovido depois. Hoje só a caixa de sugestões
    usa isto (pedido explícito do usuário)."""
    if not user.is_protected:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ação restrita ao administrador original")
    return user


ProtectedUser = Annotated[User, Depends(require_protected)]
