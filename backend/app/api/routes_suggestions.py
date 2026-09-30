"""Caixa de sugestões — qualquer colaborador autenticado deixa uma
sugestão pelo ícone flutuante (canto da tela); só o administrador
*original* (`User.is_protected`, ver Prompt_Horun_Core.md §6) enxerga e
gerencia a lista — nem os demais administradores máximos."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, ProtectedUser, SessionDep
from app.db.models import Suggestion, User

router = APIRouter(tags=["suggestions"])

_STATUSES = {"novo", "lida", "arquivada"}


def _name(u: User | None) -> str:
    return (u.full_name or u.display_name or u.username) if u else ""


class SuggestionIn(BaseModel):
    text: str


class SuggestionOut(BaseModel):
    id: int
    text: str
    status: str
    author_name: str
    created_at: datetime


class StatusIn(BaseModel):
    status: str


@router.post("/suggestions")
def create_suggestion(payload: SuggestionIn, user: CurrentUser, session: SessionDep):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A sugestão não pode estar vazia")
    session.add(Suggestion(author_id=user.id, text=text))
    session.commit()
    return {"ok": True}


@router.get("/suggestions", response_model=list[SuggestionOut])
def list_suggestions(_admin: ProtectedUser, session: SessionDep):
    rows = session.exec(select(Suggestion).order_by(Suggestion.created_at.desc())).all()
    return [
        SuggestionOut(
            id=s.id,
            text=s.text,
            status=s.status,
            author_name=_name(session.get(User, s.author_id)),
            created_at=s.created_at,
        )
        for s in rows
    ]


@router.get("/suggestions/unread-count")
def unread_count(_admin: ProtectedUser, session: SessionDep):
    rows = session.exec(select(Suggestion).where(Suggestion.status == "novo")).all()
    return {"count": len(rows)}


@router.patch("/suggestions/{suggestion_id}")
def update_status(suggestion_id: int, payload: StatusIn, _admin: ProtectedUser, session: SessionDep):
    if payload.status not in _STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Status inválido")
    s = session.get(Suggestion, suggestion_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sugestão não encontrada")
    s.status = payload.status
    session.add(s)
    session.commit()
    return {"ok": True}


@router.delete("/suggestions/{suggestion_id}")
def delete_suggestion(suggestion_id: int, _admin: ProtectedUser, session: SessionDep):
    s = session.get(Suggestion, suggestion_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sugestão não encontrada")
    session.delete(s)
    session.commit()
    return {"ok": True}
