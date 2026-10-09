"""Cadastro automático — a própria pessoa cria a conta no Horun.

Fluxo (tela de login → Primeiro acesso → Criar minha conta):

1. `POST /auth/signup/code` com e-mail + nome de usuário: confere as regras
   e se os dois estão livres, e manda por e-mail um código de 6 dígitos
   (vale `CODE_VALID_MINUTES`). Só o hash fica no banco (`SignupCode`).
2. `POST /auth/signup/complete` com o código, a senha e a confirmação: cria
   a conta (nível 5 — sem posição; a coordenação define a posição depois) e
   já entra (login automático). Coordenação recebe um aviso no sininho.

Só funciona com o cadastro automático ligado pelo administrador máximo
(Administração → Acesso; chave `self_signup_enabled` em `AppState`) **e** o
e-mail (SMTP) configurado — sem e-mail não há como confirmar o endereço.

Freios: no máximo `rate_limit.MAX_PER_USER` envios de código por e-mail (e
`MAX_PER_IP` por computador) a cada 15 min; `MAX_CODE_ATTEMPTS` tentativas
por código, depois é preciso pedir outro.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.deps import CoordinatorUser, ProtectedUser, SessionDep
from app.api.routes_auth import _out, _set_session_cookie
from app.core import email as email_module
from app.core import rate_limit
from app.core.config import settings
from app.core.permissions import user_level
from app.core.security import hash_password
from app.db.models import AppState, Notification, SignupCode, User

router = APIRouter(tags=["signup"])

SETTING_KEY = "self_signup_enabled"
CODE_VALID_MINUTES = 15
MAX_CODE_ATTEMPTS = 5
PASSWORD_MIN = 8

# Regras do nome de usuário no cadastro automático — as mesmas mostradas na
# tela (USERNAME_RULES). Mais estritas que as do cadastro pela coordenação:
# minúsculas e começando por letra, para a @menção do Mural funcionar sempre.
USERNAME_RULES = (
    "De 3 a 30 caracteres; só letras minúsculas sem acento (a–z), números, ponto (.), "
    "hífen (-) e sublinhado (_); começa com uma letra; sem espaços. Ex.: maria.silva"
)
_USERNAME_RE = re.compile(r"^[a-z][a-z0-9._-]{2,29}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---- configuração (Administração → Acesso) ----------------------------------


def _setting_on(session: Session) -> bool:
    row = session.get(AppState, SETTING_KEY)
    return bool(row and row.value == "1")


def signup_available(session: Session) -> bool:
    return _setting_on(session) and settings.email_enabled


class SignupSettingsOut(BaseModel):
    enabled: bool  # chave ligada pelo administrador máximo
    email_configured: bool  # SMTP configurado (sem ele o cadastro não funciona)


class SignupSettingsIn(BaseModel):
    enabled: bool


@router.get("/admin/signup-settings", response_model=SignupSettingsOut)
def get_signup_settings(_admin: CoordinatorUser, session: SessionDep):
    return SignupSettingsOut(enabled=_setting_on(session), email_configured=settings.email_enabled)


@router.put("/admin/signup-settings", response_model=SignupSettingsOut)
def put_signup_settings(payload: SignupSettingsIn, _admin: ProtectedUser, session: SessionDep):
    """Só o administrador máximo liga/desliga o cadastro automático."""
    row = session.get(AppState, SETTING_KEY) or AppState(key=SETTING_KEY)
    row.value = "1" if payload.enabled else "0"
    session.add(row)
    session.commit()
    return SignupSettingsOut(enabled=payload.enabled, email_configured=settings.email_enabled)


# ---- fluxo público ----------------------------------------------------------


class SignupInfoOut(BaseModel):
    enabled: bool
    username_rules: str
    password_min: int


@router.get("/auth/signup", response_model=SignupInfoOut)
def signup_info(session: SessionDep):
    """Público (tela de login): o cadastro automático está disponível?"""
    return SignupInfoOut(enabled=signup_available(session), username_rules=USERNAME_RULES, password_min=PASSWORD_MIN)


def _require_available(session: Session) -> None:
    if not _setting_on(session):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "O cadastro automático está desligado — peça a sua conta a um coordenador.",
        )
    if not settings.email_enabled:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "O envio de e-mail não está configurado no Horun — peça a sua conta a um coordenador.",
        )


def _clean_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if len(email) > 200 or not _EMAIL_RE.fullmatch(email):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "E-mail inválido.")
    return email


def _clean_username(raw: str) -> str:
    username = (raw or "").strip()
    if not _USERNAME_RE.fullmatch(username):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Nome de usuário fora das regras. {USERNAME_RULES}")
    return username


def _ensure_free(session: Session, username: str, email: str) -> None:
    if session.exec(select(User).where(func.lower(User.username) == username.lower())).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Esse nome de usuário já existe — escolha outro.")
    if session.exec(select(User).where(func.lower(User.email) == email)).first():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Já existe uma conta com esse e-mail. Entre com ela (ou peça ajuda a um coordenador).",
        )


def _hash_code(email: str, code: str) -> str:
    return hashlib.sha256(f"{email}:{code}".encode()).hexdigest()


class CodeRequest(BaseModel):
    email: str
    username: str


class CodeSentOut(BaseModel):
    sent: bool
    valid_minutes: int


@router.post("/auth/signup/code", response_model=CodeSentOut)
def request_signup_code(payload: CodeRequest, request: Request, session: SessionDep):
    _require_available(session)
    email = _clean_email(payload.email)
    username = _clean_username(payload.username)
    # cada envio conta: freia quem usa o Horun para mandar e-mail a terceiros
    rate_limit.check("signup-send", email, request)
    _ensure_free(session, username, email)
    rate_limit.record_failure("signup-send", email, request)

    code = f"{secrets.randbelow(1_000_000):06d}"
    row = session.get(SignupCode, email) or SignupCode(email=email, username=username, code_hash="", expires_at=datetime.now(timezone.utc))
    row.username = username
    row.code_hash = _hash_code(email, code)
    row.attempts = 0
    row.expires_at = datetime.now(timezone.utc) + timedelta(minutes=CODE_VALID_MINUTES)
    session.add(row)
    session.commit()

    body = (
        f"Olá!\n\nSeu código de acesso para criar a conta \"{username}\" no Horun é:\n\n"
        f"    {code}\n\n"
        f"Ele vale por {CODE_VALID_MINUTES} minutos. Se não foi você que pediu, ignore este e-mail."
    )
    if settings.public_url:
        body += f"\n\n{settings.public_url}"
    email_module.send_email_async(email, f"[Horun] Seu código de acesso: {code}", body)
    return CodeSentOut(sent=True, valid_minutes=CODE_VALID_MINUTES)


class CompleteRequest(BaseModel):
    email: str
    username: str
    code: str
    password: str
    password_confirm: str


@router.post("/auth/signup/complete")
def complete_signup(payload: CompleteRequest, request: Request, response: Response, session: SessionDep):
    _require_available(session)
    email = _clean_email(payload.email)
    username = _clean_username(payload.username)
    if len(payload.password) < PASSWORD_MIN:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A senha precisa ter pelo menos {PASSWORD_MIN} caracteres.")
    if payload.password != payload.password_confirm:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "As senhas não coincidem.")

    rate_limit.check("signup-code", email, request)
    row = session.get(SignupCode, email)
    if row is None or row.username != username:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Peça o código de acesso de novo (e-mail ou usuário mudou).")
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc) or row.attempts >= MAX_CODE_ATTEMPTS:
        session.delete(row)
        session.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Código expirado ou com tentativas demais — peça um novo.")
    code = re.sub(r"\D", "", payload.code or "")
    if not hmac.compare_digest(row.code_hash, _hash_code(email, code)):
        row.attempts += 1
        session.add(row)
        session.commit()
        rate_limit.record_failure("signup-code", email, request)
        left = MAX_CODE_ATTEMPTS - row.attempts
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Código incorreto. {left} tentativa(s) restante(s)." if left > 0 else "Código incorreto — peça um novo.",
        )

    _ensure_free(session, username, email)
    user = User(
        username=username,
        email=email,
        password_hash=hash_password(payload.password),
        display_name=username,
        onboarded=False,
    )
    session.add(user)
    session.delete(row)
    session.commit()
    session.refresh(user)
    rate_limit.record_success("signup-code", email, request)

    # coordenação fica sabendo, para definir a posição (nível) da pessoa
    for admin in session.exec(select(User)).all():
        if admin.id != user.id and user_level(admin) <= 2:
            session.add(
                Notification(
                    user_id=admin.id,
                    kind="signup",
                    text=f"Nova conta pelo cadastro automático: {username}. Defina a posição em Administração → Usuários.",
                    link="/admin",
                    actor_id=user.id,
                )
            )
    session.commit()

    _set_session_cookie(response, user)  # login automático
    return _out(user)
