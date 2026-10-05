"""Notificações pedidas pelos módulos — sininho do Core + e-mail.

Os módulos não sabem o e-mail de ninguém (recebem só `X-Horun-User-Id` e o
nome, seção 5 do Prompt_Horun_Modulo.md) nem têm SMTP. Então o BACKEND do
módulo pede ao Core: "avise estas pessoas", e o Core:

- só avisa quem tem acesso ao módulo (concessão, módulo público, ou nível 1–2);
- cria o aviso no sininho (link para dentro do módulo, `/m/<id>/...`);
- manda e-mail se o SMTP está configurado e a pessoa não desligou os e-mails
  (`User.email_notifications`, mesmo opt-out do Mural).

Autenticação: `Authorization: Bearer <chave do módulo>`, gerada pelo
administrador na aba Módulos (só o hash fica no banco). A rota é chamada de
servidor para servidor, pela rede Docker (`http://horun-core-backend:8000`).
Contrato completo: Prompt_Horun_Modulo.md, seção 11.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import select

from app.api.deps import ModuleAdminUser, SessionDep
from app.core.email import notify_user_by_email
from app.core.config import settings
from app.core.permissions import user_level
from app.db.models import Module, Notification, User, UserModuleAccess

router = APIRouter(tags=["module-notify"])

MAX_RECIPIENTS = 200


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class NotifyTokenOut(BaseModel):
    token: str  # aparece só agora — guarde na variável HORUN_NOTIFY_TOKEN do módulo


@router.post("/modules/{module_id}/notify-token", response_model=NotifyTokenOut)
def create_notify_token(module_id: str, _admin: ModuleAdminUser, session: SessionDep):
    """Gera (ou troca) a chave de notificação do módulo. A anterior deixa de valer."""
    module = session.get(Module, module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Módulo não encontrado.")
    token = secrets.token_urlsafe(32)
    module.notify_token_hash = _hash(token)
    session.add(module)
    session.commit()
    return NotifyTokenOut(token=token)


@router.delete("/modules/{module_id}/notify-token")
def revoke_notify_token(module_id: str, _admin: ModuleAdminUser, session: SessionDep):
    module = session.get(Module, module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Módulo não encontrado.")
    module.notify_token_hash = ""
    session.add(module)
    session.commit()
    return {"ok": True}


class NotifyIn(BaseModel):
    # Quem avisar — união das duas listas, sempre filtrada por quem tem acesso
    # ao módulo. `user_ids`: ids do Core (os do cabeçalho X-Horun-User-Id).
    # `levels`: níveis do Core (1 admin, 2 coordenador, 3 pesquisador,
    # 4 técnico, 5 IC) — ex. [1, 2] = "os coordenadores".
    user_ids: list[int] = Field(default_factory=list)
    levels: list[int] = Field(default_factory=list)
    subject: str = Field(min_length=1, max_length=150)
    text: str = Field(default="", max_length=4000)
    # Caminho DENTRO do módulo (ex. "/compras/12"); o Core monta /m/<id>/...
    link: str = Field(default="", max_length=500)
    email: bool = True  # False = só o sininho (avisos de rotina)


class NotifyOut(BaseModel):
    notified: int  # avisos criados no sininho
    emailed: int  # e-mails disparados (0 se o SMTP não está configurado)


def _module_from_token(session: SessionDep, module_id: str, authorization: str | None) -> Module:
    module = session.get(Module, module_id)
    token = (authorization or "").removeprefix("Bearer ").strip()
    # mesma resposta para módulo inexistente, sem chave e chave errada
    if (
        module is None
        or not module.notify_token_hash
        or not token
        or not hmac.compare_digest(module.notify_token_hash, _hash(token))
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Chave de notificação inválida.")
    return module


def _recipients(session: SessionDep, module: Module, payload: NotifyIn) -> list[User]:
    wanted_ids = set(payload.user_ids)
    wanted_levels = {lvl for lvl in payload.levels if 1 <= lvl <= 5}
    granted = {
        g.user_id for g in session.exec(select(UserModuleAccess).where(UserModuleAccess.module_id == module.id))
    }
    out: list[User] = []
    for user in session.exec(select(User)).all():
        level = user_level(user)
        if user.id not in wanted_ids and level not in wanted_levels:
            continue
        # mesma regra do proxy (_has_access): nível 1–2 vê tudo
        if not (module.public or level <= 2 or user.id in granted):
            continue
        out.append(user)
    return out[:MAX_RECIPIENTS]


@router.post("/internal/modules/{module_id}/notify", response_model=NotifyOut)
def module_notify(
    module_id: str,
    payload: NotifyIn,
    session: SessionDep,
    authorization: str | None = Header(default=None),
):
    module = _module_from_token(session, module_id, authorization)
    link = payload.link.strip()
    if link and not link.startswith("/"):
        link = "/" + link
    path = f"/m/{module.id}{link or '/'}"
    name = module.display_name or module.id

    recipients = _recipients(session, module, payload)
    emailed = 0
    for user in recipients:
        session.add(Notification(user_id=user.id, kind="module", module_id=module.id,
                                 text=f"{name}: {payload.subject}", link=path))
        if payload.email and settings.email_enabled and user.email and getattr(user, "email_notifications", True):
            body = payload.text or payload.subject
            if settings.public_url:
                body += f"\n\nAbrir no Horun: {settings.public_url}{path}"
            body += "\n\n— Horun (para não receber e-mails, desligue em Meu perfil)."
            notify_user_by_email(user, f"[Horun · {name}] {payload.subject}", body)
            emailed += 1
    session.commit()
    return NotifyOut(notified=len(recipients), emailed=emailed)
