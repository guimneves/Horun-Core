"""Cadastro de equipamentos reserváveis na Agenda, das áreas do
laboratório que os agrupam, e do perfil rico de cada equipamento (Fase A
da página Equipamentos — ver Prompt_Horun_Core.md). Separado do cadastro
de módulos (routes_modules.py) — ver Equipment/EquipmentArea em
app/db/models.py."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.deps import CurrentUser, SessionDep, SuperAdminUser
from app.db.models import USAGE_PURPOSES, Equipment, EquipmentArea, EquipmentLog, EquipmentType, Module, Reservation, User

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


# --- Tipos de equipamento --------------------------------------------------


class EquipmentTypeIn(BaseModel):
    name: str


class EquipmentTypeOut(BaseModel):
    id: int
    name: str


def _type_out(t: EquipmentType) -> EquipmentTypeOut:
    return EquipmentTypeOut(id=t.id, name=t.name)


@router.get("/equipment-types", response_model=list[EquipmentTypeOut])
def list_equipment_types(_user: CurrentUser, session: SessionDep):
    types = session.exec(select(EquipmentType).order_by(EquipmentType.name)).all()
    return [_type_out(t) for t in types]


@router.post("/equipment-types", response_model=EquipmentTypeOut)
def create_equipment_type(payload: EquipmentTypeIn, _admin: SuperAdminUser, session: SessionDep):
    et = EquipmentType(name=payload.name)
    session.add(et)
    session.commit()
    session.refresh(et)
    return _type_out(et)


@router.patch("/equipment-types/{type_id}", response_model=EquipmentTypeOut)
def update_equipment_type(type_id: int, payload: EquipmentTypeIn, _admin: SuperAdminUser, session: SessionDep):
    et = session.get(EquipmentType, type_id)
    if et is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tipo não encontrado")
    et.name = payload.name
    session.add(et)
    session.commit()
    session.refresh(et)
    return _type_out(et)


@router.delete("/equipment-types/{type_id}")
def delete_equipment_type(type_id: int, _admin: SuperAdminUser, session: SessionDep):
    et = session.get(EquipmentType, type_id)
    if et is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tipo não encontrado")
    for eq in session.exec(select(Equipment).where(Equipment.type_id == type_id)).all():
        eq.type_id = None
        session.add(eq)
    session.delete(et)
    session.commit()
    return {"ok": True}


# --- Equipamentos ---------------------------------------------------------


class EquipmentIn(BaseModel):
    id: str
    display_name: str
    color: str = "#15216f"
    description: str = ""
    area_id: int | None = None
    type_id: int | None = None
    module_id: str | None = None
    anydesk_id: str = ""
    pop_folder_path: str = ""
    manufacturer: str = ""
    model_name: str = ""
    serial_number: str = ""
    asset_tag: str = ""


class EquipmentPatch(BaseModel):
    display_name: str | None = None
    color: str | None = None
    description: str | None = None
    area_id: int | None = None
    clear_area: bool = False
    type_id: int | None = None
    clear_type: bool = False
    module_id: str | None = None
    clear_module: bool = False
    anydesk_id: str | None = None
    pop_folder_path: str | None = None
    manufacturer: str | None = None
    model_name: str | None = None
    serial_number: str | None = None
    asset_tag: str | None = None


class EquipmentOut(BaseModel):
    id: str
    display_name: str
    color: str
    description: str
    area_id: int | None
    type_id: int | None
    module_id: str | None
    anydesk_id: str
    pop_folder_path: str
    manufacturer: str
    model_name: str
    serial_number: str
    asset_tag: str
    has_photo: bool
    # Resumo pra card da grade — computados, não persistidos.
    reservations_this_week: int = 0
    last_used_at: datetime | None = None


def _week_bounds(now: datetime) -> tuple[datetime, datetime]:
    monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return monday, monday + timedelta(days=7)


def _last_used_map(session: Session) -> dict[str, datetime]:
    rows = session.exec(
        select(EquipmentLog.equipment_id, func.max(EquipmentLog.occurred_at)).group_by(EquipmentLog.equipment_id)
    ).all()
    return dict(rows)


def _reservations_this_week_map(session: Session) -> dict[str, int]:
    start, end = _week_bounds(datetime.now())
    rows = session.exec(
        select(Reservation.equipment_id, func.count(Reservation.id))
        .where(Reservation.start_at >= start)
        .where(Reservation.start_at < end)
        .group_by(Reservation.equipment_id)
    ).all()
    return dict(rows)


def _out(e: Equipment, last_used: datetime | None = None, reservations_week: int = 0) -> EquipmentOut:
    return EquipmentOut(
        id=e.id,
        display_name=e.display_name,
        color=e.color,
        description=e.description or "",
        area_id=e.area_id,
        type_id=e.type_id,
        module_id=e.module_id,
        anydesk_id=e.anydesk_id or "",
        pop_folder_path=e.pop_folder_path or "",
        manufacturer=e.manufacturer or "",
        model_name=e.model_name or "",
        serial_number=e.serial_number or "",
        asset_tag=e.asset_tag or "",
        has_photo=e.photo is not None,
        reservations_this_week=reservations_week,
        last_used_at=last_used,
    )


def _check_area(session: Session, area_id: int | None) -> None:
    if area_id is not None and session.get(EquipmentArea, area_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Área não encontrada")


def _check_type(session: Session, type_id: int | None) -> None:
    if type_id is not None and session.get(EquipmentType, type_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tipo não encontrado")


def _check_module(session: Session, module_id: str | None) -> None:
    if module_id is not None and session.get(Module, module_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Módulo não encontrado")


@router.get("/equipment", response_model=list[EquipmentOut])
def list_equipment(_user: CurrentUser, session: SessionDep):
    items = session.exec(select(Equipment)).all()
    last_used = _last_used_map(session)
    reservations_week = _reservations_this_week_map(session)
    return [_out(e, last_used.get(e.id), reservations_week.get(e.id, 0)) for e in items]


@router.post("/equipment", response_model=EquipmentOut)
def create_equipment(payload: EquipmentIn, _admin: SuperAdminUser, session: SessionDep):
    existing = session.get(Equipment, payload.id)
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe um equipamento com esse id")
    _check_area(session, payload.area_id)
    _check_type(session, payload.type_id)
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
    if payload.clear_type:
        equipment.type_id = None
    elif payload.type_id is not None:
        _check_type(session, payload.type_id)
        equipment.type_id = payload.type_id
    if payload.clear_module:
        equipment.module_id = None
    elif payload.module_id is not None:
        _check_module(session, payload.module_id)
        equipment.module_id = payload.module_id
    if payload.anydesk_id is not None:
        equipment.anydesk_id = payload.anydesk_id
    if payload.pop_folder_path is not None:
        equipment.pop_folder_path = payload.pop_folder_path
    if payload.manufacturer is not None:
        equipment.manufacturer = payload.manufacturer
    if payload.model_name is not None:
        equipment.model_name = payload.model_name
    if payload.serial_number is not None:
        equipment.serial_number = payload.serial_number
    if payload.asset_tag is not None:
        equipment.asset_tag = payload.asset_tag

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


# --- Ficha de utilização do equipamento (RUE), Fase B — mesmo formato da
# ficha de papel do laboratório (RUE modelo.doc): data, objetivo do uso,
# hora início/fim, código do experimento, usuário, observação,
# conferência. Ainda não sincronizado com o histórico interno de cada
# módulo (Fase C, futura) ---------------------------------------------


def _check_purpose(purpose: str) -> None:
    if purpose not in USAGE_PURPOSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Objetivo do uso inválido — use um de: {', '.join(USAGE_PURPOSES)}")


class EquipmentLogIn(BaseModel):
    purpose: str = "AN"
    experiment_code: str = ""
    description: str = ""
    occurred_at: datetime | None = None  # None = agora
    ended_at: datetime | None = None


class EquipmentLogPatch(BaseModel):
    purpose: str | None = None
    experiment_code: str | None = None
    description: str | None = None
    occurred_at: datetime | None = None
    ended_at: datetime | None = None
    clear_ended_at: bool = False


class EquipmentLogOut(BaseModel):
    id: int
    equipment_id: str
    purpose: str
    experiment_code: str
    description: str
    occurred_at: datetime
    ended_at: datetime | None
    created_at: datetime
    user_id: int
    user_display_name: str
    verified_by_id: int | None
    verified_by_name: str | None
    verified_at: datetime | None


def _log_out(log: EquipmentLog, user: User, session: Session) -> EquipmentLogOut:
    verifier_name = None
    if log.verified_by_id is not None:
        verifier = session.get(User, log.verified_by_id)
        verifier_name = (verifier.display_name or verifier.username) if verifier else None
    return EquipmentLogOut(
        id=log.id,
        equipment_id=log.equipment_id,
        purpose=log.purpose,
        experiment_code=log.experiment_code or "",
        description=log.description or "",
        occurred_at=log.occurred_at,
        ended_at=log.ended_at,
        created_at=log.created_at,
        user_id=user.id,
        user_display_name=user.display_name or user.username,
        verified_by_id=log.verified_by_id,
        verified_by_name=verifier_name,
        verified_at=log.verified_at,
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
            out.append(_log_out(log, author, session))
    return out


@router.post("/equipment/{equipment_id}/logs", response_model=EquipmentLogOut)
def create_equipment_log(equipment_id: str, payload: EquipmentLogIn, user: CurrentUser, session: SessionDep):
    if session.get(Equipment, equipment_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipamento não encontrado")
    _check_purpose(payload.purpose)
    log = EquipmentLog(
        equipment_id=equipment_id,
        user_id=user.id,
        purpose=payload.purpose,
        experiment_code=payload.experiment_code.strip(),
        description=payload.description.strip(),
        # Naive (hora local do laboratório), mesma convenção do
        # start_at/end_at de Reservation — não datetime.utcnow() (aware).
        occurred_at=payload.occurred_at or datetime.now(),
        ended_at=payload.ended_at,
    )
    session.add(log)
    session.commit()
    session.refresh(log)
    return _log_out(log, user, session)


@router.patch("/equipment/{equipment_id}/logs/{log_id}", response_model=EquipmentLogOut)
def update_equipment_log(equipment_id: str, log_id: int, payload: EquipmentLogPatch, user: CurrentUser, session: SessionDep):
    log = session.get(EquipmentLog, log_id)
    if log is None or log.equipment_id != equipment_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro não encontrado")
    if log.user_id != user.id and not user.is_super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só quem registrou ou o administrador máximo pode editar")

    if payload.purpose is not None:
        _check_purpose(payload.purpose)
        log.purpose = payload.purpose
    if payload.experiment_code is not None:
        log.experiment_code = payload.experiment_code.strip()
    if payload.description is not None:
        log.description = payload.description.strip()
    if payload.occurred_at is not None:
        log.occurred_at = payload.occurred_at
    if payload.clear_ended_at:
        log.ended_at = None
    elif payload.ended_at is not None:
        log.ended_at = payload.ended_at

    session.add(log)
    session.commit()
    session.refresh(log)
    author = session.get(User, log.user_id)
    return _log_out(log, author or user, session)


@router.post("/equipment/{equipment_id}/logs/{log_id}/verify", response_model=EquipmentLogOut)
def verify_equipment_log(equipment_id: str, log_id: int, admin: SuperAdminUser, session: SessionDep):
    """"Conferido por" da ficha de papel — só o administrador máximo,
    não precisa ser quem registrou (é justamente uma checagem externa)."""
    log = session.get(EquipmentLog, log_id)
    if log is None or log.equipment_id != equipment_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro não encontrado")
    log.verified_by_id = admin.id
    log.verified_at = datetime.now()
    session.add(log)
    session.commit()
    session.refresh(log)
    author = session.get(User, log.user_id)
    return _log_out(log, author or admin, session)


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
