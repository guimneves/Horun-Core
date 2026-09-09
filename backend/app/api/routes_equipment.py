"""Cadastro de equipamentos reserváveis na Agenda. Separado do cadastro
de módulos (routes_modules.py) — ver Equipment em app/db/models.py."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, SuperAdminUser
from app.db.models import Equipment

router = APIRouter(tags=["equipment"])


class EquipmentIn(BaseModel):
    id: str
    display_name: str
    color: str = "#15216f"


class EquipmentOut(BaseModel):
    id: str
    display_name: str
    color: str


def _out(e: Equipment) -> EquipmentOut:
    return EquipmentOut(id=e.id, display_name=e.display_name, color=e.color)


@router.get("/equipment", response_model=list[EquipmentOut])
def list_equipment(_user: CurrentUser, session: SessionDep):
    items = session.exec(select(Equipment)).all()
    return [_out(e) for e in items]


@router.post("/equipment", response_model=EquipmentOut)
def create_equipment(payload: EquipmentIn, _admin: SuperAdminUser, session: SessionDep):
    existing = session.get(Equipment, payload.id)
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe um equipamento com esse id")
    equipment = Equipment(**payload.model_dump())
    session.add(equipment)
    session.commit()
    session.refresh(equipment)
    return _out(equipment)


@router.delete("/equipment/{equipment_id}")
def delete_equipment(equipment_id: str, _admin: SuperAdminUser, session: SessionDep):
    equipment = session.get(Equipment, equipment_id)
    if equipment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipamento não encontrado")
    session.delete(equipment)
    session.commit()
    return {"ok": True}
