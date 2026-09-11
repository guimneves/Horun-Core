"""Cadastro de equipamentos reserváveis na Agenda, das áreas do
laboratório que os agrupam, e do perfil rico de cada equipamento (Fase A
da página Equipamentos — ver Prompt_Horun_Core.md). Separado do cadastro
de módulos (routes_modules.py) — ver Equipment/EquipmentArea em
app/db/models.py."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session, select

from app.api.deps import CurrentUser, SessionDep, SuperAdminUser
from app.db.models import Equipment, EquipmentArea, EquipmentLog, Module, User

router = APIRouter(tags=["equipment"])

_MAX_PHOTO_BYTES = 4 * 1024 * 1024  # 4 MB — foto de bancada, um pouco maior que retrato
_ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}


# --- Áreas do laboratório -----------------------------------------------


class EquipmentAreaIn(BaseModel):
    name: str


class EquipmentAreaOut(BaseModel):
    id: int
    name: str


def _area_out(a: EquipmentArea) -> EquipmentAreaOut:
    return EquipmentAreaOut(id=a.id, name=a.name)


@router.get("/equipment-areas", response_model=list[EquipmentAreaOut])
def list_equipment_areas(_user: CurrentUser, session: SessionDep):
    areas = session.exec(select(EquipmentArea).order_by(EquipmentArea.name)).all()
    return [_area_out(a) for a in areas]


@router.post("/equipment-areas", response_model=EquipmentAreaOut)
def create_equipment_area(payload: EquipmentAreaIn, _admin: SuperAdminUser, session: SessionDep):
    area = EquipmentArea(name=payload.name)
    session.add(area)
    session.commit()
    session.refresh(area)
    return _area_out(area)


@router.patch("/equipment-areas/{area_id}", response_model=EquipmentAreaOut)
def update_equipment_area(area_id: int, payload: EquipmentAreaIn, _admin: SuperAdminUser, session: SessionDep):
    area = session.get(EquipmentArea, area_id)
    if area is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Área não encontrada")
    area.name = payload.name
    session.add(area)
    session.commit()
    session.refresh(area)
    return _area_out(area)


@router.delete("/equipment-areas/{area_id}")
def delete_equipment_area(area_id: int, _admin: SuperAdminUser, session: SessionDep):
    area = session.get(EquipmentArea, area_id)
    if area is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Área não encontrada")
    # Equipamentos da área ficam sem área (não apaga nem bloqueia) — mesmo
    # espírito de "área" ser só uma etiqueta de organização, não uma
    # dependência forte.
    for eq in session.exec(select(Equipment).where(Equipment.area_id == area_id)).all():
        eq.area_id = None
        session.add(eq)
    session.delete(area)
    session.commit()
    return {"ok": True}


# --- Equipamentos ---------------------------------------------------------


class EquipmentIn(BaseModel):
    id: str
    display_name: str
    color: str = "#15216f"
    description: str = ""
    area_id: int | None = None
    module_id: str | None = None
    anydesk_id: str = ""
    pop_folder_path: str = ""


class EquipmentPatch(BaseModel):
    display_name: str | None = None
    color: str | None = None
    description: str | None = None
    area_id: int | None = None
    clear_area: bool = False
    module_id: str | None = None
    clear_module: bool = False
    anydesk_id: str | None = None
    pop_folder_path: str | None = None


class EquipmentOut(BaseModel):
    id: str
    display_name: str
    color: str
    description: str
    area_id: int | None
    module_id: str | None
    anydesk_id: str
    pop_folder_path: str
    has_photo: bool


def _out(e: Equipment) -> EquipmentOut:
    return EquipmentOut(
        id=e.id,
        display_name=e.display_name,
        color=e.color,
        description=e.description or "",
        area_id=e.area_id,
        module_id=e.module_id,
        anydesk_id=e.anydesk_id or "",
        pop_folder_path=e.pop_folder_path or "",
        has_photo=e.photo is not None,
    )


def _check_area(session: Session, area_id: int | None) -> None:
    if area_id is not None and session.get(EquipmentArea, area_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Área não encontrada")


def _check_module(session: Session, module_id: str | None) -> None:
    if module_id is not None and session.get(Module, module_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Módulo não encontrado")


@router.get("/equipment", response_model=list[EquipmentOut])
def list_equipment(_user: CurrentUser, session: SessionDep):
    items = session.exec(select(Equipment)).all()
    return [_out(e) for e in items]


@router.post("/equipment", response_model=EquipmentOut)
def create_equipment(payload: EquipmentIn, _admin: SuperAdminUser, session: SessionDep):
    existing = session.get(Equipment, payload.id)
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe um equipamento com esse id")
    _check_area(session, payload.area_id)
    _check_module(session, payload.module_id)
    equipment = Equipment(**payload.model_dump())
    session.add(equipment)
    session.commit()
    session.refresh(equipment)
    return _out(equipment)


@router.patch("/equipment/{equipment_id}", response_model=EquipmentOut)
def update_equipment(equipment_id: str, payload: EquipmentPatch, _admin: SuperAdminUser, session: SessionDep):
    equipment = session.get(Equipment, equipment_id)
    if equipment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipamento não encontrado")

    if payload.display_name is not None:
        equipment.display_name = payload.display_name
    if payload.color is not None:
        equipment.color = payload.color
    if payload.description is not None:
        equipment.description = payload.description
    if payload.clear_area:
        equipment.area_id = None
    elif payload.area_id is not None:
        _check_area(session, payload.area_id)
        equipment.area_id = payload.area_id
    if payload.clear_module:
        equipment.module_id = None
    elif payload.module_id is not None:
        _check_module(session, payload.module_id)
        equipment.module_id = payload.module_id
    if payload.anydesk_id is not None:
        equipment.anydesk_id = payload.anydesk_id
    if payload.pop_folder_path is not None:
        equipment.pop_folder_path = payload.pop_folder_path

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


@router.post("/equipment/{equipment_id}/photo", response_model=EquipmentOut)
async def upload_equipment_photo(equipment_id: str, file: UploadFile, _admin: SuperAdminUser, session: SessionDep):
    equipment = session.get(Equipment, equipment_id)
    if equipment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipamento não encontrado")
    if file.content_type not in _ALLOWED_PHOTO_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Formato de imagem não suportado (use JPEG, PNG ou WEBP)")
    data = await file.read()
    if len(data) > _MAX_PHOTO_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Imagem grande demais (máximo 4 MB)")

    equipment.photo = data
    equipment.photo_content_type = file.content_type
    session.add(equipment)
    session.commit()
    session.refresh(equipment)
    return _out(equipment)


@router.delete("/equipment/{equipment_id}/photo", response_model=EquipmentOut)
def delete_equipment_photo(equipment_id: str, _admin: SuperAdminUser, session: SessionDep):
    equipment = session.get(Equipment, equipment_id)
    if equipment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipamento não encontrado")
    equipment.photo = None
    equipment.photo_content_type = None
    session.add(equipment)
    session.commit()
    session.refresh(equipment)
    return _out(equipment)


@router.get("/equipment/{equipment_id}/photo")
def get_equipment_photo(equipment_id: str, _user: CurrentUser, session: SessionDep):
    equipment = session.get(Equipment, equipment_id)
    if equipment is None or equipment.photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sem foto")
    return Response(content=equipment.photo, media_type=equipment.photo_content_type or "application/octet-stream")


# --- Registro de uso (RUE), Fase B — manual, ainda não sincronizado com o
# histórico interno de cada módulo (Fase C, futura) ------------------------


class EquipmentLogIn(BaseModel):
    description: str
    occurred_at: datetime | None = None  # None = agora


class EquipmentLogPatch(BaseModel):
    description: str | None = None
    occurred_at: datetime | None = None


class EquipmentLogOut(BaseModel):
    id: int
    equipment_id: str
    description: str
    occurred_at: datetime
    created_at: datetime
    user_id: int
    user_display_name: str


def _log_out(log: EquipmentLog, user: User) -> EquipmentLogOut:
    return EquipmentLogOut(
        id=log.id,
        equipment_id=log.equipment_id,
        description=log.description,
        occurred_at=log.occurred_at,
        created_at=log.created_at,
        user_id=user.id,
        user_display_name=user.display_name or user.username,
    )


@router.get("/equipment/{equipment_id}/logs", response_model=list[EquipmentLogOut])
def list_equipment_logs(equipment_id: str, _user: CurrentUser, session: SessionDep):
    if session.get(Equipment, equipment_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipamento não encontrado")
    logs = session.exec(
        select(EquipmentLog).where(EquipmentLog.equipment_id == equipment_id).order_by(EquipmentLog.occurred_at.desc())
    ).all()
    out = []
    for log in logs:
        author = session.get(User, log.user_id)
        if author is not None:
            out.append(_log_out(log, author))
    return out


@router.post("/equipment/{equipment_id}/logs", response_model=EquipmentLogOut)
def create_equipment_log(equipment_id: str, payload: EquipmentLogIn, user: CurrentUser, session: SessionDep):
    if session.get(Equipment, equipment_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipamento não encontrado")
    if not payload.description.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Descreva o que foi feito")
    log = EquipmentLog(
        equipment_id=equipment_id,
        user_id=user.id,
        description=payload.description.strip(),
        # Naive (hora local do laboratório), mesma convenção do
        # start_at/end_at de Reservation — não datetime.utcnow() (aware).
        occurred_at=payload.occurred_at or datetime.now(),
    )
    session.add(log)
    session.commit()
    session.refresh(log)
    return _log_out(log, user)


@router.patch("/equipment/{equipment_id}/logs/{log_id}", response_model=EquipmentLogOut)
def update_equipment_log(equipment_id: str, log_id: int, payload: EquipmentLogPatch, user: CurrentUser, session: SessionDep):
    log = session.get(EquipmentLog, log_id)
    if log is None or log.equipment_id != equipment_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro não encontrado")
    if log.user_id != user.id and not user.is_super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só quem registrou ou o administrador máximo pode editar")

    if payload.description is not None:
        if not payload.description.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Descreva o que foi feito")
        log.description = payload.description.strip()
    if payload.occurred_at is not None:
        log.occurred_at = payload.occurred_at

    session.add(log)
    session.commit()
    session.refresh(log)
    author = session.get(User, log.user_id)
    return _log_out(log, author or user)


@router.delete("/equipment/{equipment_id}/logs/{log_id}")
def delete_equipment_log(equipment_id: str, log_id: int, user: CurrentUser, session: SessionDep):
    log = session.get(EquipmentLog, log_id)
    if log is None or log.equipment_id != equipment_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro não encontrado")
    if log.user_id != user.id and not user.is_super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só quem registrou ou o administrador máximo pode remover")
    session.delete(log)
    session.commit()
    return {"ok": True}
