"""Agenda compartilhada de uso de equipamentos. Qualquer usuário
autenticado reserva um intervalo de tempo para si mesmo, num
equipamento cadastrado — duas reservas do mesmo equipamento não podem
se sobrepor (checado em create_reservation)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.db.models import Equipment, Reservation, User

router = APIRouter(tags=["reservations"])


class ReservationIn(BaseModel):
    equipment_id: str
    title: str = ""
    start_at: datetime
    end_at: datetime


class ReservationMoveIn(BaseModel):
    """Corpo do PATCH usado ao arrastar um bloco na Agenda — só os dois
    campos que uma arrastada muda (dia/hora); trocar de equipamento
    arrastando pra outra coluna também usa isto."""

    equipment_id: str
    start_at: datetime
    end_at: datetime


class ReservationOut(BaseModel):
    id: int
    equipment_id: str
    title: str
    start_at: datetime
    end_at: datetime
    user_id: int
    user_display_name: str


def _out(r: Reservation, user: User) -> ReservationOut:
    return ReservationOut(
        id=r.id,
        equipment_id=r.equipment_id,
        title=r.title,
        start_at=r.start_at,
        end_at=r.end_at,
        user_id=user.id,
        user_display_name=user.display_name or user.username,
    )


def _has_conflict(session: SessionDep, equipment_id: str, start_at: datetime, end_at: datetime, exclude_id: int | None = None) -> bool:
    existing = session.exec(select(Reservation).where(Reservation.equipment_id == equipment_id)).all()
    for r in existing:
        if exclude_id is not None and r.id == exclude_id:
            continue
        # Sobreposição clássica de intervalos: começa antes do outro terminar
        # E termina depois do outro começar.
        if r.start_at < end_at and r.end_at > start_at:
            return True
    return False


def _naive(value: datetime) -> datetime:
    """`start_at`/`end_at` são gravados naive (o frontend manda hora local
    sem timezone). `start`/`end` da querystring, por outro lado, costumam
    chegar com timezone (ex. `toISOString()` do JS, sufixo "Z") — comparar
    um datetime "aware" com um "naive" derruba com TypeError. Descarta o
    timezone do parâmetro pra comparar na mesma "régua" do que é gravado."""
    return value.replace(tzinfo=None) if value.tzinfo is not None else value


@router.get("/reservations", response_model=list[ReservationOut])
def list_reservations(
    _user: CurrentUser,
    session: SessionDep,
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
):
    reservations = session.exec(select(Reservation)).all()
    if start is not None:
        start = _naive(start)
        reservations = [r for r in reservations if r.end_at > start]
    if end is not None:
        end = _naive(end)
        reservations = [r for r in reservations if r.start_at < end]
    out = []
    for r in reservations:
        user = session.get(User, r.user_id)
        if user is not None:
            out.append(_out(r, user))
    return out


@router.post("/reservations", response_model=ReservationOut)
def create_reservation(payload: ReservationIn, user: CurrentUser, session: SessionDep):
    if payload.end_at <= payload.start_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "O fim da reserva precisa ser depois do início")

    equipment = session.get(Equipment, payload.equipment_id)
    if equipment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipamento não encontrado")

    if _has_conflict(session, payload.equipment_id, payload.start_at, payload.end_at):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Já existe uma reserva desse equipamento nesse horário"
        )

    reservation = Reservation(
        equipment_id=payload.equipment_id,
        user_id=user.id,
        title=payload.title,
        start_at=payload.start_at,
        end_at=payload.end_at,
    )
    session.add(reservation)
    session.commit()
    session.refresh(reservation)
    return _out(reservation, user)


@router.patch("/reservations/{reservation_id}", response_model=ReservationOut)
def move_reservation(reservation_id: int, payload: ReservationMoveIn, user: CurrentUser, session: SessionDep):
    """Reagendar uma reserva (arrastar na grade da Agenda) — mesmas regras
    de validação do create_reservation, mas ignorando a própria reserva na
    checagem de conflito (senão ela sempre "conflitaria com ela mesma")."""
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reserva não encontrada")
    if reservation.user_id != user.id and not user.is_super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só quem reservou ou o administrador máximo pode reagendar")

    if payload.end_at <= payload.start_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "O fim da reserva precisa ser depois do início")

    equipment = session.get(Equipment, payload.equipment_id)
    if equipment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipamento não encontrado")

    if _has_conflict(session, payload.equipment_id, payload.start_at, payload.end_at, exclude_id=reservation_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Já existe uma reserva desse equipamento nesse horário"
        )

    reservation.equipment_id = payload.equipment_id
    reservation.start_at = payload.start_at
    reservation.end_at = payload.end_at
    session.add(reservation)
    session.commit()
    session.refresh(reservation)
    return _out(reservation, user)


@router.delete("/reservations/{reservation_id}")
def delete_reservation(reservation_id: int, user: CurrentUser, session: SessionDep):
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reserva não encontrada")
    if reservation.user_id != user.id and not user.is_super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só quem reservou ou o administrador máximo pode cancelar")
    session.delete(reservation)
    session.commit()
    return {"ok": True}
