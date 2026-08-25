from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, SuperAdminUser
from app.core.security import (
    SESSION_COOKIE_NAME,
    create_session_token,
    hash_password,
    verify_password,
)
from app.db.models import User

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    is_super_admin: bool
    is_protected: bool


class CreateUserRequest(BaseModel):
    username: str
    password: str
    display_name: str = ""
    is_super_admin: bool = False


class UpdateUserRequest(BaseModel):
    display_name: str | None = None
    password: str | None = None
    is_super_admin: bool | None = None


def _out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        is_super_admin=user.is_super_admin,
        is_protected=user.is_protected,
    )


@router.post("/auth/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response, session: SessionDep):
    user = session.exec(select(User).where(User.username == payload.username)).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuário ou senha inválidos")

    token = create_session_token(user.id)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 12,
    )
    return _out(user)


@router.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE_NAME)
    return {"ok": True}


@router.get("/auth/me", response_model=UserOut)
def me(user: CurrentUser):
    return _out(user)


@router.post("/users", response_model=UserOut)
def create_user(payload: CreateUserRequest, _admin: SuperAdminUser, session: SessionDep):
    """Só o administrador máximo cria usuários locais — importação
    automática do AD (Prompt_Horun_Core.md, seção 4) ainda não
    implementada."""
    existing = session.exec(select(User).where(User.username == payload.username)).first()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nome de usuário já existe")

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name or payload.username,
        is_super_admin=payload.is_super_admin,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _out(user)


@router.get("/users", response_model=list[UserOut])
def list_users(_admin: SuperAdminUser, session: SessionDep):
    users = session.exec(select(User)).all()
    return [_out(u) for u in users]


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UpdateUserRequest, _admin: SuperAdminUser, session: SessionDep):
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuário não encontrado")
    if user.is_protected:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Esta é a conta protegida do Core — não pode ser alterada, para sempre haver um acesso de backup.",
        )

    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
    if payload.is_super_admin is not None:
        user.is_super_admin = payload.is_super_admin
    session.add(user)
    session.commit()
    session.refresh(user)
    return _out(user)


@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: SuperAdminUser, session: SessionDep):
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuário não encontrado")
    if user.is_protected:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Esta é a conta protegida do Core — não pode ser excluída, para sempre haver um acesso de backup.",
        )
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Você não pode excluir a própria conta")
    session.delete(user)
    session.commit()
    return {"ok": True}
