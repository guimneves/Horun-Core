from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session

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


def require_super_admin(user: CurrentUser) -> User:
    """Dependência para rotas restritas ao administrador máximo (seção 6
    do Prompt_Horun_Core.md) — cadastro de módulos e permissões."""
    if not user.is_super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ação restrita ao administrador máximo")
    return user


SuperAdminUser = Annotated[User, Depends(require_super_admin)]
