"""Eventos do calendário do laboratório — reuniões, seminários, feriados,
prazos. Só o administrador máximo cria/edita/remove (Fase 1); todo usuário
autenticado vê. Diferente de `Reservation`: sem checagem de conflito, pode
ser de dia inteiro. Escopo de grupo entra na Fase 2."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, SuperAdminUser
from app.db.models import Event, User

router = APIRouter(tags=["events"])


def _naive(value: datetime) -> datetime:
    return value.replace(tzinfo=None) if value.tzinfo is not None else value


class EventIn(BaseModel):
    title: str
    description: str = ""
    location: str = ""
    start_at: datetime
    end_at: datetime
    all_day: bool = False


class EventOut(BaseModel):
    id: int
    title: str
    description: str
    location: str
    start_at: datetime
    end_at: datetime
    all_day: bool
    created_by_id: int
    created_by_name: str


def _out(e: Event, author: User | None) -> EventOut:
    return EventOut(
        id=e.id,
        title=e.title,
        description=e.description or "",
        location=e.location or "",
        start_at=e.start_at,
        end_at=e.end_at,
        all_day=bool(e.all_day),
        created_by_id=e.created_by_id,
        created_by_name=(author.display_name or author.username) if author else "",
    )


@router.get("/events", response_model=list[EventOut])
def list_events(
    _user: CurrentUser,
    session: SessionDep,
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
):
    events = session.exec(select(Event)).all()
    if start is not None:
        s = _naive(start)
        events = [e for e in events if e.end_at > s]
    if end is not None:
        en = _naive(end)
        events = [e for e in events if e.start_at < en]
    events.sort(key=lambda e: e.start_at)
    return [_out(e, session.get(User, e.created_by_id)) for e in events]


@router.post("/events", response_model=EventOut)
def create_event(payload: EventIn, admin: SuperAdminUser, session: SessionDep):
    title = payload.title.strip()
    if not title:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "O evento precisa de um título")
    if payload.end_at < payload.start_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "O fim do evento não pode ser antes do início")
    event = Event(
        title=title,
        description=payload.description.strip(),
        location=payload.location.strip(),
        start_at=payload.start_at,
        end_at=payload.end_at,
        all_day=payload.all_day,
        created_by_id=admin.id,
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    return _out(event, admin)


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(event_id: int, payload: EventIn, _admin: SuperAdminUser, session: SessionDep):
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento não encontrado")
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
    return _out(event, session.get(User, event.created_by_id))


@router.delete("/events/{event_id}")
def delete_event(event_id: int, _admin: SuperAdminUser, session: SessionDep):
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento não encontrado")
    session.delete(event)
    session.commit()
    return {"ok": True}
