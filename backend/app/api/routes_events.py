"""Eventos do calendário do laboratório — reuniões, seminários, feriados,
prazos. Só o administrador máximo cria/edita/remove (Fase 1); todo usuário
autenticado vê. Diferente de `Reservation`: sem checagem de conflito, pode
ser de dia inteiro. Escopo de grupo entra na Fase 2."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.core.groups import can_see_group, member_group_ids
from app.db.models import Event, Group, User

router = APIRouter(tags=["events"])


def _group_internal_admin_id(session: SessionDep, group_id: int | None) -> int | None:
    if group_id is None:
        return None
    g = session.get(Group, group_id)
    return g.internal_admin_id if g else None


def _can_manage_event(session: SessionDep, ev: Event, user: User) -> bool:
    if ev.group_id is None:
        return user.is_super_admin
    return user.is_super_admin or _group_internal_admin_id(session, ev.group_id) == user.id


def _naive(value: datetime) -> datetime:
    return value.replace(tzinfo=None) if value.tzinfo is not None else value


class EventIn(BaseModel):
    title: str
    description: str = ""
    location: str = ""
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    group_id: int | None = None


class EventOut(BaseModel):
    id: int
    title: str
    description: str
    location: str
    start_at: datetime
    end_at: datetime
    all_day: bool
    group_id: int | None
    created_by_id: int
    created_by_name: str
    can_manage: bool


def _out(session: SessionDep, e: Event, viewer: User) -> EventOut:
    author = session.get(User, e.created_by_id)
    return EventOut(
        id=e.id,
        title=e.title,
        description=e.description or "",
        location=e.location or "",
        start_at=e.start_at,
        end_at=e.end_at,
        all_day=bool(e.all_day),
        group_id=e.group_id,
        created_by_id=e.created_by_id,
        created_by_name=(author.display_name or author.username) if author else "",
        can_manage=_can_manage_event(session, e, viewer),
    )


@router.get("/events", response_model=list[EventOut])
def list_events(
    user: CurrentUser,
    session: SessionDep,
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
):
    """Eventos do laboratório (group_id NULL) + eventos dos grupos dos
    quais o usuário é membro."""
    scopes: set[int | None] = {None} | member_group_ids(session, user.id)
    events = [e for e in session.exec(select(Event)).all() if e.group_id in scopes]
    if start is not None:
        s = _naive(start)
        events = [e for e in events if e.end_at > s]
    if end is not None:
        en = _naive(end)
        events = [e for e in events if e.start_at < en]
    events.sort(key=lambda e: e.start_at)
    return [_out(session, e, user) for e in events]


def _validate_event_scope(session: SessionDep, group_id: int | None, user: User) -> None:
    if group_id is None:
        if not user.is_super_admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Só o administrador máximo cria eventos do laboratório")
        return
    group = session.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grupo não encontrado")
    if not (user.is_super_admin or group.internal_admin_id == user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só o admin interno do grupo cria eventos do grupo")


@router.post("/events", response_model=EventOut)
def create_event(payload: EventIn, user: CurrentUser, session: SessionDep):
    title = payload.title.strip()
    if not title:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "O evento precisa de um título")
    if payload.end_at < payload.start_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "O fim do evento não pode ser antes do início")
    _validate_event_scope(session, payload.group_id, user)
    event = Event(
        title=title,
        description=payload.description.strip(),
        location=payload.location.strip(),
        start_at=payload.start_at,
        end_at=payload.end_at,
        all_day=payload.all_day,
        group_id=payload.group_id,
        created_by_id=user.id,
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    return _out(session, event, user)


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(event_id: int, payload: EventIn, user: CurrentUser, session: SessionDep):
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento não encontrado")
    if not _can_manage_event(session, event, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sem permissão para editar este evento")
    if payload.end_at < payload.start_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "O fim do evento não pode ser antes do início")
    event.title = payload.title.strip() or event.title
    event.description = payload.description.strip()
    event.location = payload.location.strip()
    event.start_at = payload.start_at
    event.end_at = payload.end_at
    event.all_day = payload.all_day
    session.add(event)
    session.commit()
    session.refresh(event)
    return _out(session, event, user)


@router.delete("/events/{event_id}")
def delete_event(event_id: int, user: CurrentUser, session: SessionDep):
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento não encontrado")
    if not _can_manage_event(session, event, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sem permissão para remover este evento")
    session.delete(event)
    session.commit()
    return {"ok": True}
