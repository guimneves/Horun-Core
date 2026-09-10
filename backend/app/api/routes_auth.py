from __future__ import annotations

import calendar
import re
from datetime import date

from fastapi import APIRouter, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel, field_validator
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, SuperAdminUser
from app.core.security import (
    SESSION_COOKIE_NAME,
    create_session_token,
    generate_setup_code,
    hash_password,
    verify_password,
)
from app.db.models import POSITIONS, QUALIFICATIONS, User

router = APIRouter(tags=["auth"])

_MAX_PHOTO_BYTES = 2 * 1024 * 1024  # 2 MB — retrato simples, não precisa de mais
_ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _validate_choice(value: str, allowed: list[str], field_name: str) -> str:
    if value and value not in allowed:
        raise ValueError(f"{field_name} inválido — use um dos valores permitidos ou deixe em branco.")
    return value


_USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{2,}$")


def _validate_username(value: str) -> str:
    """Nome de usuário tem que ser um "slug": sem espaço, sem acento. Isso
    é o que quebra a menção — `@Lucas Pereira` corta no espaço e o
    `@usuario` deixa de ser reconhecido (o Lucas não é notificado)."""
    value = value.strip()
    if not _USERNAME_RE.fullmatch(value):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Nome de usuário só pode ter letras sem acento, números, ponto, hífen e sublinhado — "
            "sem espaços (ex.: lucas.pereira).",
        )
    return value


def _validate_birth(day: int | None, month: int | None, year: int | None) -> None:
    """Dia e mês andam juntos (ou os dois em branco). Ano é opcional. 29/02
    é aceito (o modelo guarda a data "de nascimento", não uma data real de
    um ano específico)."""
    if (day is None) != (month is None):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Informe dia e mês juntos (ou deixe os dois em branco).")
    if month is not None:
        if not 1 <= month <= 12:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mês inválido.")
        max_day = 29 if month == 2 else calendar.monthrange(2000, month)[1]
        if not 1 <= day <= max_day:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Dia inválido para o mês escolhido.")
    if year is not None and not 1900 <= year <= date.today().year:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ano de nascimento inválido.")


class LoginRequest(BaseModel):
    username: str
    password: str


class SetPasswordRequest(BaseModel):
    username: str
    setup_code: str
    new_password: str


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    full_name: str
    email: str
    phone: str
    position: str
    qualification: str
    birth_day: int | None
    birth_month: int | None
    birth_year: int | None
    has_photo: bool
    is_super_admin: bool
    is_protected: bool
    onboarded: bool
    # Só tem valor de verdade logo após a criação (ou depois de
    # regenerado) — None assim que a pessoa define a própria senha.
    setup_code: str | None


class CreateUserRequest(BaseModel):
    username: str
    # Opcional agora: se omitida, a conta nasce sem senha, com um código
    # de primeiro acesso (ver POST /auth/set-password).
    password: str | None = None
    display_name: str = ""
    full_name: str = ""
    email: str = ""
    phone: str = ""
    position: str = ""
    qualification: str = ""
    is_super_admin: bool = False

    _validate_position = field_validator("position")(lambda v: _validate_choice(v, POSITIONS, "Posição"))
    _validate_qualification = field_validator("qualification")(
        lambda v: _validate_choice(v, QUALIFICATIONS, "Qualificação")
    )


class UpdateUserRequest(BaseModel):
    """Edição por um administrador máximo — inclui campos que a própria
    pessoa não deveria mudar sozinha (papel, posição/qualificação
    institucional)."""

    username: str | None = None
    display_name: str | None = None
    password: str | None = None
    is_super_admin: bool | None = None
    position: str | None = None
    qualification: str | None = None

    _validate_position = field_validator("position")(
        lambda v: _validate_choice(v, POSITIONS, "Posição") if v is not None else v
    )
    _validate_qualification = field_validator("qualification")(
        lambda v: _validate_choice(v, QUALIFICATIONS, "Qualificação") if v is not None else v
    )


class UpdateProfileRequest(BaseModel):
    """Edição pela própria pessoa — só dados pessoais (seção "Perfil"),
    nunca papel/posição/qualificação."""

    display_name: str | None = None
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    onboarded: bool | None = None
    # Trio de nascimento: quando `birth_set` vem True, os três valores
    # abaixo (day/month obrigatórios, year opcional) substituem o que
    # havia; quando vem False, limpa. Quando vem None (default), não mexe.
    birth_set: bool | None = None
    birth_day: int | None = None
    birth_month: int | None = None
    birth_year: int | None = None


def _out(user: User) -> UserOut:
    # `or ""` de defesa: uma conta antiga cuja coluna de texto ficou NULL
    # (criada antes da coluna existir) não pode derrubar o login inteiro
    # com 500 — a migração já faz o backfill, isto é só o cinto de
    # segurança da rota mais crítica.
    return UserOut(
        id=user.id,
        username=user.username,
        display_name=user.display_name or "",
        full_name=user.full_name or "",
        email=user.email or "",
        phone=user.phone or "",
        position=user.position or "",
        qualification=user.qualification or "",
        birth_day=user.birth_day,
        birth_month=user.birth_month,
        birth_year=user.birth_year,
        has_photo=user.photo is not None,
        is_super_admin=user.is_super_admin,
        is_protected=user.is_protected,
        onboarded=bool(user.onboarded),
        setup_code=user.setup_code,
    )


@router.post("/auth/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response, session: SessionDep):
    user = session.exec(select(User).where(User.username == payload.username)).first()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuário ou senha inválidos")
    if user.password_hash is None:
        raise HTTPException(
            status.HTTP_428_PRECONDITION_REQUIRED,
            "Esta conta ainda não tem senha definida — use 'Primeiro acesso' com o código que o administrador te passou.",
        )
    if not verify_password(payload.password, user.password_hash):
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


@router.post("/auth/set-password", response_model=UserOut)
def set_password(payload: SetPasswordRequest, response: Response, session: SessionDep):
    """Primeiro acesso: troca o código de configuração (dado pelo
    administrador máximo na criação) pela senha definitiva escolhida pela
    própria pessoa, e já efetua o login."""
    user = session.exec(select(User).where(User.username == payload.username)).first()
    if user is None or user.password_hash is not None or user.setup_code != payload.setup_code.upper():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Usuário ou código de primeiro acesso inválido")
    if len(payload.new_password) < 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A senha precisa ter pelo menos 6 caracteres")

    user.password_hash = hash_password(payload.new_password)
    user.setup_code = None
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_session_token(user.id)
    response.set_cookie(
        SESSION_COOKIE_NAME, token, httponly=True, samesite="lax", max_age=60 * 60 * 12
    )
    return _out(user)


@router.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE_NAME)
    return {"ok": True}


@router.get("/auth/me", response_model=UserOut)
def me(user: CurrentUser):
    return _out(user)


@router.patch("/auth/me", response_model=UserOut)
def update_profile(payload: UpdateProfileRequest, user: CurrentUser, session: SessionDep):
    """Autoatendimento — cada pessoa cadastra os próprios dados pessoais
    (pedido do usuário), sem precisar do administrador máximo."""
    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.email is not None:
        user.email = payload.email
    if payload.phone is not None:
        user.phone = payload.phone
    if payload.onboarded is not None:
        user.onboarded = payload.onboarded
    if payload.birth_set is True:
        _validate_birth(payload.birth_day, payload.birth_month, payload.birth_year)
        user.birth_day = payload.birth_day
        user.birth_month = payload.birth_month
        user.birth_year = payload.birth_year
    elif payload.birth_set is False:
        user.birth_day = user.birth_month = user.birth_year = None
    session.add(user)
    session.commit()
    session.refresh(user)
    return _out(user)


@router.post("/auth/me/photo", response_model=UserOut)
async def upload_my_photo(file: UploadFile, user: CurrentUser, session: SessionDep):
    if file.content_type not in _ALLOWED_PHOTO_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Formato de imagem não suportado (use JPEG, PNG ou WEBP)")
    data = await file.read()
    if len(data) > _MAX_PHOTO_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Imagem grande demais (máximo 2 MB)")

    user.photo = data
    user.photo_content_type = file.content_type
    session.add(user)
    session.commit()
    session.refresh(user)
    return _out(user)


@router.delete("/auth/me/photo", response_model=UserOut)
def delete_my_photo(user: CurrentUser, session: SessionDep):
    user.photo = None
    user.photo_content_type = None
    session.add(user)
    session.commit()
    session.refresh(user)
    return _out(user)


@router.get("/users/{user_id}/photo")
def get_user_photo(user_id: int, _user: CurrentUser, session: SessionDep):
    """Servida separada do resto do perfil (ver UserOut) — assim listar
    usuários nunca fica pesado carregando bytes de imagem à toa."""
    user = session.get(User, user_id)
    if user is None or user.photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sem foto")
    return Response(content=user.photo, media_type=user.photo_content_type or "application/octet-stream")


@router.post("/users", response_model=UserOut)
def create_user(payload: CreateUserRequest, _admin: SuperAdminUser, session: SessionDep):
    """Só o administrador máximo cria usuários locais — importação
    automática do AD (Prompt_Horun_Core.md, seção 4) ainda não
    implementada."""
    username = _validate_username(payload.username)
    existing = session.exec(select(User).where(User.username == username)).first()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nome de usuário já existe")

    user = User(
        username=username,
        password_hash=hash_password(payload.password) if payload.password else None,
        setup_code=None if payload.password else generate_setup_code(),
        display_name=payload.display_name or payload.username,
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        position=payload.position,
        qualification=payload.qualification,
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


class DirectoryEntryOut(BaseModel):
    """Diretório de colaboradores — aberto a qualquer autenticado. Só
    nome/cargo/qualificação/e-mail são públicos; telefone só aparece pro
    administrador máximo (pedido do usuário)."""

    id: int
    name: str  # full_name se preenchido, senão display_name
    position: str
    qualification: str
    email: str
    has_photo: bool
    phone: str  # "" para quem não é administrador máximo


@router.get("/users/directory", response_model=list[DirectoryEntryOut])
def users_directory(current: CurrentUser, session: SessionDep):
    users = session.exec(select(User).order_by(User.display_name)).all()
    return [
        DirectoryEntryOut(
            id=u.id,
            name=u.full_name or u.display_name or u.username,
            position=u.position or "",
            qualification=u.qualification or "",
            email=u.email or "",
            has_photo=u.photo is not None,
            phone=(u.phone or "") if current.is_super_admin else "",
        )
        for u in users
    ]


class BirthdayOut(BaseModel):
    user_id: int
    name: str
    has_photo: bool
    date: date  # a ocorrência dentro do intervalo pedido (ano do calendário)
    day: int
    month: int


def _birthday_on(year: int, month: int, day: int) -> date:
    try:
        return date(year, month, day)
    except ValueError:
        # 29/02 em ano não bissexto — mostra em 28/02
        return date(year, 2, 28)


@router.get("/users/birthdays", response_model=list[BirthdayOut])
def users_birthdays(
    _user: CurrentUser,
    session: SessionDep,
    start: date = Query(...),
    end: date = Query(...),
):
    """Aniversários que caem no intervalo [start, end] — projeção dos
    perfis, sem tabela. A Agenda pede a semana; o widget do Mural, os
    próximos dias."""
    out: list[BirthdayOut] = []
    for u in session.exec(select(User)).all():
        if not u.birth_day or not u.birth_month:
            continue
        for year in range(start.year, end.year + 1):
            occ = _birthday_on(year, u.birth_month, u.birth_day)
            if start <= occ <= end:
                out.append(
                    BirthdayOut(
                        user_id=u.id,
                        name=u.full_name or u.display_name or u.username,
                        has_photo=u.photo is not None,
                        date=occ,
                        day=u.birth_day,
                        month=u.birth_month,
                    )
                )
    out.sort(key=lambda b: b.date)
    return out


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

    if payload.username is not None:
        new_username = _validate_username(payload.username)
        if new_username != user.username:
            clash = session.exec(select(User).where(User.username == new_username)).first()
            if clash is not None:
                raise HTTPException(status.HTTP_409_CONFLICT, "Nome de usuário já existe")
            user.username = new_username
    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
        user.setup_code = None
    if payload.is_super_admin is not None:
        user.is_super_admin = payload.is_super_admin
    if payload.position is not None:
        user.position = payload.position
    if payload.qualification is not None:
        user.qualification = payload.qualification
    session.add(user)
    session.commit()
    session.refresh(user)
    return _out(user)


@router.post("/users/{user_id}/regenerate-setup-code", response_model=UserOut)
def regenerate_setup_code(user_id: int, _admin: SuperAdminUser, session: SessionDep):
    """Perdeu o código de primeiro acesso, ou quer voltar alguém pro fluxo
    de 'defina sua senha' (ex. esqueceu a senha e não quer que o admin
    saiba a nova)."""
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuário não encontrado")
    if user.is_protected:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Esta é a conta protegida do Core — não pode ser alterada.")

    user.password_hash = None
    user.setup_code = generate_setup_code()
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
