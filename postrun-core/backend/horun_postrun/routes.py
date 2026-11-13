"""API comum de todo PostRun (prefixo /postrun) — usada pela interface comum
(`frontend/src/postrun-core/`). O módulo monta assim, no `main.py`:

    app.include_router(build_router(
        get_session=get_session, get_identity=get_identity, plugin=EQUIPMENT,
        source=source, publisher=publisher, config=PostrunConfig(module_id="postrun-x"),
    ), prefix="/api")
"""

import json
from dataclasses import dataclass
from typing import Annotated, Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, col, func, or_, select

from . import PACKAGE_VERSION, service
from .models import PUBLICADA, VALIDADA, PostrunFile, PostrunOutbox, PostrunRun, PostrunTreatment
from .plugin import EquipmentPlugin
from .publish import Publisher, retry_pending
from .sources import FileSource, SourceError


@dataclass
class PostrunConfig:
    module_id: str
    # níveis do Core: 1 administrador máximo … 5 IC
    validate_max_level: int = 4  # validar e publicar: até técnico
    unpublish_max_level: int = 2  # desvalidar o que já foi publicado: coordenação
    # modo Agente: varredura para no prazo (fica abaixo do tempo limite do Core)
    scan_budget_seconds: Optional[float] = None


class TreatIn(BaseModel):
    params: dict[str, Any] = {}


class LinkIn(BaseModel):
    sample_code: str
    project_code: str = ""


class UnvalidateIn(BaseModel):
    reason: str = ""


class BatchIn(BaseModel):
    action: str  # tratar | validar | publicar
    run_ids: list[int]
    params: dict[str, Any] = {}


def _level(identity: Any) -> int:
    try:
        return int(getattr(identity, "level", 5))
    except (TypeError, ValueError):
        return 5


def build_router(
    *,
    get_session: Callable[..., Any],
    get_identity: Callable[..., Any],
    plugin: EquipmentPlugin,
    source: FileSource,
    publisher: Publisher,
    config: PostrunConfig,
) -> APIRouter:
    router = APIRouter(prefix="/postrun", tags=["postrun"])
    SessionDep = Annotated[Session, Depends(get_session)]
    IdentityDep = Annotated[Any, Depends(get_identity)]

    def can_validate(identity: Any) -> bool:
        return _level(identity) <= config.validate_max_level

    def require_validator(identity: Any) -> None:
        if not can_validate(identity):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Seu cargo não permite validar ou publicar resultados.")

    def run_or_404(session: Session, run_id: int) -> PostrunRun:
        run = session.get(PostrunRun, run_id)
        if run is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Corrida não encontrada")
        return run

    def call(fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except service.PostrunError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
        except SourceError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
        except ValueError as exc:  # parâmetro de tratamento inválido (o equipamento levanta ValueError)
            raise HTTPException(422, str(exc)) from exc

    def summary(session: Session, run: PostrunRun) -> dict:
        return {
            "id": run.id,
            "source_path": run.source_path,
            "run_key": run.run_key,
            "sample_label": run.sample_label,
            "sample_code": run.sample_code,
            "project_code": run.project_code,
            "acquired_at": service.iso(run.acquired_at),
            "read_at": service.iso(run.read_at),
            "status": run.status,
            "source_changed": run.source_changed,
            "validated_by": run.validated_by,
            "validated_at": service.iso(run.validated_at),
            "published_version": run.published_version,
            "values": service.current_values(session, run),
            "delivery": service.delivery_state(session, run),
        }

    @router.get("/equipment")
    def equipment(identity: IdentityDep, session: SessionDep):
        pending = session.exec(
            select(func.count()).select_from(PostrunOutbox).where(PostrunOutbox.state == "pendente")
        ).one()
        return {
            **plugin.describe(),
            "module_id": config.module_id,
            "postrun_core": PACKAGE_VERSION,
            "source": source.description,
            "publisher": publisher.description,
            "outbox_pending": pending,
            "can_validate": can_validate(identity),
            "can_unpublish": _level(identity) <= config.unpublish_max_level,
        }

    @router.post("/scan")
    def scan(_identity: IdentityDep, session: SessionDep):
        return call(service.scan, session, plugin, source, budget_seconds=config.scan_budget_seconds)

    @router.get("/runs")
    def list_runs(
        _identity: IdentityDep, session: SessionDep,
        status_: Optional[str] = Query(default=None, alias="status"), q: str = "", limit: int = 500,
    ):
        stmt = select(PostrunRun)
        if status_:
            stmt = stmt.where(PostrunRun.status == status_)
        if q.strip():
            like = f"%{q.strip()}%"
            stmt = stmt.where(or_(
                col(PostrunRun.sample_label).ilike(like), col(PostrunRun.sample_code).ilike(like),
                col(PostrunRun.source_path).ilike(like),
            ))
        stmt = stmt.order_by(col(PostrunRun.acquired_at).desc(), col(PostrunRun.id).desc()).limit(min(limit, 2000))
        return [summary(session, r) for r in session.exec(stmt).all()]

    @router.get("/runs/{run_id}")
    def get_run(run_id: int, _identity: IdentityDep, session: SessionDep):
        run = run_or_404(session, run_id)
        data = json.loads(run.data_json or "{}")
        treatments = session.exec(
            select(PostrunTreatment).where(PostrunTreatment.run_id == run.id).order_by(col(PostrunTreatment.id).desc())
        ).all()
        current = next((t for t in treatments if t.id == run.treatment_id), None)
        return {
            **summary(session, run),
            "signals": data.get("signals", []),
            "metadata": data.get("metadata", {}),
            "file_values": data.get("values", []),
            "params": json.loads(current.params_json) if current else plugin.default_params(),
            "treatments": [
                {"id": t.id, "created_by": t.created_by, "created_at": service.iso(t.created_at),
                 "params": json.loads(t.params_json), "values": json.loads(t.values_json), "current": t.id == run.treatment_id}
                for t in treatments
            ],
        }

    @router.post("/runs/{run_id}/treat")
    def treat(run_id: int, payload: TreatIn, identity: IdentityDep, session: SessionDep):
        call(service.treat, session, plugin, run_id, payload.params, identity.username)
        return get_run(run_id, identity, session)

    @router.post("/runs/{run_id}/link")
    def link(run_id: int, payload: LinkIn, identity: IdentityDep, session: SessionDep):
        if not payload.sample_code.strip():
            raise HTTPException(422, "Informe o código da amostra.")
        call(service.link, session, run_id, payload.sample_code, payload.project_code, identity.username)
        return summary(session, run_or_404(session, run_id))

    @router.post("/runs/{run_id}/validate")
    def validate(run_id: int, identity: IdentityDep, session: SessionDep):
        require_validator(identity)
        run = call(service.validate, session, run_id, identity.username)
        return summary(session, run)

    @router.post("/runs/{run_id}/unvalidate")
    def unvalidate(run_id: int, payload: UnvalidateIn, identity: IdentityDep, session: SessionDep):
        run = run_or_404(session, run_id)
        require_validator(identity)
        if run.status == PUBLICADA and _level(identity) > config.unpublish_max_level:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Só a coordenação desvalida um resultado já publicado no Resultados."
            )
        run = call(service.unvalidate, session, config.module_id, run_id, identity.username, publisher, payload.reason)
        return summary(session, run)

    @router.post("/runs/{run_id}/publish")
    def publish(run_id: int, identity: IdentityDep, session: SessionDep):
        require_validator(identity)
        call(service.publish, session, plugin, config.module_id, run_id, identity.username, publisher)
        return summary(session, run_or_404(session, run_id))

    @router.post("/runs/{run_id}/reread")
    def reread(run_id: int, _identity: IdentityDep, session: SessionDep):
        run = run_or_404(session, run_id)
        result = call(service.reread, session, plugin, source, run.source_path)
        return {"result": result, "run": summary(session, run_or_404(session, run_id))}

    @router.post("/batch")
    def batch(payload: BatchIn, identity: IdentityDep, session: SessionDep):
        """Mesma ação em várias corridas; uma que falha não impede as outras."""
        if payload.action in ("validar", "publicar"):
            require_validator(identity)
        done: list[int] = []
        failed: list[dict] = []
        for run_id in payload.run_ids:
            try:
                if payload.action == "tratar":
                    service.treat(session, plugin, run_id, payload.params, identity.username)
                elif payload.action == "validar":
                    service.validate(session, run_id, identity.username)
                elif payload.action == "publicar":
                    run = session.get(PostrunRun, run_id)
                    if run is not None and run.status == VALIDADA:
                        service.publish(session, plugin, config.module_id, run_id, identity.username, publisher)
                    elif run is None or run.status != PUBLICADA:
                        raise service.PostrunError("não está validada")
                else:
                    raise HTTPException(422, f"Ação desconhecida: {payload.action}")
                done.append(run_id)
            except (service.PostrunError, LookupError, ValueError) as exc:
                session.rollback()
                failed.append({"run_id": run_id, "error": str(exc)})
        return {"done": done, "failed": failed}

    @router.get("/files")
    def files(_identity: IdentityDep, session: SessionDep, only_errors: bool = True):
        stmt = select(PostrunFile).order_by(col(PostrunFile.read_at).desc())
        if only_errors:
            stmt = stmt.where(PostrunFile.error != "")
        return [
            {"id": f.id, "path": f.path, "error": f.error, "read_at": service.iso(f.read_at), "run_count": f.run_count}
            for f in session.exec(stmt.limit(500)).all()
        ]

    @router.post("/files/{file_id}/retry")
    def retry_file(file_id: int, _identity: IdentityDep, session: SessionDep):
        record = session.get(PostrunFile, file_id)
        if record is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado")
        return call(service.read_file, session, plugin, source, record.path)

    @router.post("/outbox/retry")
    def retry_outbox(_identity: IdentityDep, session: SessionDep):
        return retry_pending(session, publisher)

    return router
