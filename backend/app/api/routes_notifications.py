"""Notificações pessoais — o sininho do topo do Core.

Geradas hoje pelo Mural (menção com @, ou resposta a um aviso seu — ver
app/api/routes_posts.py). Cada usuário só enxerga as próprias. O badge do
sininho é a contagem de não lidas; abrir o painel marca todas como lidas
(mesmo padrão do GitHub — "novidades desde a última vez que olhei")."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.db.models import Notification, User

router = APIRouter(tags=["notifications"])

_LIMIT = 50


class NotificationOut(BaseModel):
    id: int
    kind: str
    text: str
    link: str
    actor_id: int | None
    actor_display_name: str
    read: bool
    created_at: datetime


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(user: CurrentUser, session: SessionDep):
    rows = session.exec(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(_LIMIT)
    ).all()
    out = []
    for n in rows:
        actor = session.get(User, n.actor_id) if n.actor_id is not None else None
        out.append(
            NotificationOut(
                id=n.id,
                kind=n.kind,
                text=n.text,
                link=n.link,
                actor_id=n.actor_id,
                actor_display_name=(actor.display_name or actor.username) if actor else "",
                read=n.read,
                created_at=n.created_at,
            )
        )
    return out


@router.get("/notifications/unread-count")
def unread_count(user: CurrentUser, session: SessionDep):
    count = session.exec(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read.is_(False))
    ).one()
    return {"count": count}


@router.post("/notifications/mark-read")
def mark_all_read(user: CurrentUser, session: SessionDep):
    rows = session.exec(
        select(Notification).where(
            Notification.user_id == user.id, Notification.read.is_(False)
        )
    ).all()
    for n in rows:
        n.read = True
        session.add(n)
    session.commit()
    return {"ok": True, "marked": len(rows)}
