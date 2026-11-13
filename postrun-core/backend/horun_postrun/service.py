"""Leitura, tratamento, vínculo, validação e publicação das corridas —
ciclo de vida em Prompt_Horun_PostRun.md, seção 3."""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlmodel import Session, select

from . import PACKAGE_VERSION, RESULT_SCHEMA
from .models import (
    NOVA,
    PUBLICADA,
    TRATADA,
    VALIDADA,
    PostrunFile,
    PostrunOutbox,
    PostrunRun,
    PostrunTreatment,
    as_utc,
    utcnow,
)
from .plugin import EquipmentPlugin, RawRun, ResultValue, Signal
from .publish import Publisher, try_send
from .sources import FileSource, SourceError


class PostrunError(Exception):
    """Ação recusada — a rota devolve 409 com a mensagem."""


# ------------------------------------------------------------ (de)serialização

def _jsonable(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))


def raw_to_json(raw: RawRun) -> str:
    return json.dumps({
        "acquired_at": raw.acquired_at.isoformat() if raw.acquired_at else None,
        "signals": [asdict(s) for s in raw.signals],
        "metadata": _jsonable(raw.metadata),
        "values": [asdict(v) for v in raw.values],
    })


def raw_from_run(run: PostrunRun) -> RawRun:
    data = json.loads(run.data_json or "{}")
    return RawRun(
        run_key=run.run_key,
        sample_label=run.sample_label,
        acquired_at=as_utc(run.acquired_at),
        signals=[Signal(**s) for s in data.get("signals", [])],
        metadata=data.get("metadata", {}),
        values=[ResultValue(**v) for v in data.get("values", [])],
    )


def current_values(session: Session, run: PostrunRun) -> list[dict]:
    if run.treatment_id is None:
        return []
    t = session.get(PostrunTreatment, run.treatment_id)
    return json.loads(t.values_json) if t else []


# ---------------------------------------------------------------- leitura

def _aware(dt: datetime | None, plugin: EquipmentPlugin) -> datetime | None:
    if dt is None or dt.tzinfo is not None:
        return dt
    return dt.replace(tzinfo=timezone(timedelta(hours=plugin.local_utc_offset_hours)))


def _source_key(path: str, run_key: str) -> str:
    return f"{path}#{run_key}" if run_key else path


def _store_runs(
    session: Session, plugin: EquipmentPlugin, path: str, digest: str, runs: list[RawRun]
) -> tuple[int, int]:
    """(novas, atualizadas). Corrida validada/publicada nunca tem os dados
    trocados por baixo: só ganha o aviso `source_changed`."""
    new = updated = 0
    for raw in runs:
        raw.acquired_at = _aware(raw.acquired_at, plugin)
        key = _source_key(path, raw.run_key)
        run = session.exec(select(PostrunRun).where(PostrunRun.source_key == key)).first()
        if run is None:
            run = PostrunRun(source_key=key, source_path=path, run_key=raw.run_key)
            new += 1
        elif run.content_hash == digest:
            continue
        elif run.status in (VALIDADA, PUBLICADA):
            run.source_changed = True
            session.add(run)
            updated += 1
            continue
        else:
            updated += 1
            run.status = NOVA
            run.treatment_id = None
        run.content_hash = digest
        run.sample_label = raw.sample_label
        run.acquired_at = raw.acquired_at
        run.read_at = utcnow()
        run.data_json = raw_to_json(raw)
        session.add(run)
    return new, updated


def read_file(session: Session, plugin: EquipmentPlugin, source: FileSource, path: str) -> dict:
    record = session.exec(select(PostrunFile).where(PostrunFile.path == path)).first() or PostrunFile(path=path)
    try:
        content = source.read(session, path)
    except SourceError as exc:
        record.error = str(exc)[:500]
        session.add(record)
        session.commit()
        return {"path": path, "error": record.error}
    digest = hashlib.sha256(content).hexdigest()
    record.content_hash = digest
    record.size = len(content)
    record.read_at = utcnow()
    try:
        runs = plugin.parse_many(path, content)
    except Exception as exc:  # noqa: BLE001 — arquivo ruim não derruba a varredura
        record.error = f"{type(exc).__name__}: {exc}"[:500]
        record.run_count = 0
        session.add(record)
        session.commit()
        return {"path": path, "error": record.error}
    new, updated = _store_runs(session, plugin, path, digest, runs)
    record.error = ""
    record.run_count = len(runs)
    session.add(record)
    session.commit()
    return {"path": path, "new": new, "updated": updated}


def scan(
    session: Session, plugin: EquipmentPlugin, source: FileSource, *, budget_seconds: float | None = None
) -> dict:
    """Lê os arquivos ainda não vistos. Com `budget_seconds` (modo Agente),
    para no prazo e deixa o resto para a próxima varredura — a resposta não
    pode passar do tempo limite do Core."""
    deadline = time.monotonic() + budget_seconds if budget_seconds else None
    paths = source.list(session, plugin.file_globs)
    known = set(session.exec(select(PostrunFile.path)).all())
    todo = [p for p in paths if p not in known]
    out = {"listed": len(paths), "new_files": 0, "new_runs": 0, "errors": [], "remaining": 0}
    for i, path in enumerate(todo):
        if deadline is not None and time.monotonic() >= deadline:
            out["remaining"] = len(todo) - i
            break
        result = read_file(session, plugin, source, path)
        out["new_files"] += 1
        if "error" in result:
            out["errors"].append(result)
        else:
            out["new_runs"] += result["new"]
    return out


def reread(session: Session, plugin: EquipmentPlugin, source: FileSource, path: str) -> dict:
    return read_file(session, plugin, source, path)


# ------------------------------------------------------- tratamento e vínculo

def _get_run(session: Session, run_id: int) -> PostrunRun:
    run = session.get(PostrunRun, run_id)
    if run is None:
        raise LookupError("Corrida não encontrada")
    return run


def _require_editable(run: PostrunRun) -> None:
    if run.status in (VALIDADA, PUBLICADA):
        raise PostrunError("Corrida validada — desvalide antes de mudar o tratamento ou a amostra.")


def treat(session: Session, plugin: EquipmentPlugin, run_id: int, params: dict | None, user: str) -> PostrunTreatment:
    run = _get_run(session, run_id)
    _require_editable(run)
    merged = {**plugin.default_params(), **(params or {})}
    values = plugin.treat(raw_from_run(run), merged)
    treatment = PostrunTreatment(
        run_id=run.id, params_json=json.dumps(_jsonable(merged)),
        values_json=json.dumps([asdict(v) for v in values]), created_by=user,
    )
    session.add(treatment)
    session.flush()
    run.treatment_id = treatment.id
    run.status = TRATADA
    if not run.sample_code and run.sample_label:
        run.sample_code = plugin.suggest_sample_code(run.sample_label)
    session.add(run)
    session.commit()
    session.refresh(treatment)
    return treatment


def link(session: Session, run_id: int, sample_code: str, project_code: str, user: str) -> PostrunRun:
    run = _get_run(session, run_id)
    _require_editable(run)
    run.sample_code = sample_code.strip()
    run.project_code = project_code.strip()
    run.linked_by = user
    run.linked_at = utcnow()
    session.add(run)
    session.commit()
    return run


def validate(session: Session, run_id: int, user: str) -> PostrunRun:
    run = _get_run(session, run_id)
    if run.status in (VALIDADA, PUBLICADA):
        return run
    if run.treatment_id is None:
        raise PostrunError("Trate a corrida antes de validar.")
    if not run.sample_code:
        raise PostrunError("Informe o código da amostra antes de validar.")
    run.status = VALIDADA
    run.validated_by = user
    run.validated_at = utcnow()
    run.source_changed = False
    session.add(run)
    session.commit()
    return run


# ---------------------------------------------------------------- publicação

def build_payload(session: Session, plugin: EquipmentPlugin, module_id: str, run: PostrunRun, version: int) -> dict:
    treatment = session.get(PostrunTreatment, run.treatment_id) if run.treatment_id else None
    return {
        "schema": RESULT_SCHEMA,
        "module": module_id,
        "equipment": plugin.name,
        "technique": plugin.technique,
        "source_key": f"{module_id}:{run.source_key}",
        "version": version,
        "retracted": False,
        "sample_code": run.sample_code,
        "project_code": run.project_code or None,
        "sample_label": run.sample_label,
        "acquired_at": as_utc(run.acquired_at).isoformat() if run.acquired_at else None,
        "validated_at": as_utc(run.validated_at).isoformat() if run.validated_at else None,
        "validated_by": run.validated_by,
        "values": json.loads(treatment.values_json) if treatment else [],
        "treatment": {
            "params": json.loads(treatment.params_json) if treatment else {},
            "postrun_core": PACKAGE_VERSION,
        },
        "link": f"/m/{module_id}/?run={run.id}",
    }


def _enqueue(session: Session, run: PostrunRun, payload: dict, user: str, *, retracted: bool) -> PostrunOutbox:
    item = PostrunOutbox(
        run_id=run.id, source_key=payload["source_key"], version=payload["version"], retracted=retracted,
        payload_json=json.dumps(payload), created_by=user,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def publish(
    session: Session, plugin: EquipmentPlugin, module_id: str, run_id: int, user: str, publisher: Publisher
) -> PostrunOutbox:
    run = _get_run(session, run_id)
    if run.status == PUBLICADA:
        raise PostrunError("Corrida já publicada.")
    if run.status != VALIDADA:
        raise PostrunError("Valide a corrida antes de publicar.")
    version = run.published_version + 1
    item = _enqueue(session, run, build_payload(session, plugin, module_id, run, version), user, retracted=False)
    run.published_version = version
    run.status = PUBLICADA
    session.add(run)
    session.commit()
    try_send(session, item, publisher)
    return item


def unvalidate(
    session: Session, module_id: str, run_id: int, user: str, publisher: Publisher, reason: str = ""
) -> PostrunRun:
    """Volta a corrida para "tratada". Se já estava publicada, manda a
    retirada ao Resultados (o resultado sai do acervo até nova publicação)."""
    run = _get_run(session, run_id)
    if run.status not in (VALIDADA, PUBLICADA):
        return run
    item = None
    if run.status == PUBLICADA:
        payload = {
            "schema": RESULT_SCHEMA, "module": module_id, "source_key": f"{module_id}:{run.source_key}",
            "version": run.published_version, "retracted": True, "reason": reason, "retracted_by": user,
        }
        item = _enqueue(session, run, payload, user, retracted=True)
    run.status = TRATADA
    run.validated_by = ""
    run.validated_at = None
    session.add(run)
    session.commit()
    if item is not None:
        try_send(session, item, publisher)
    return run


def delivery_state(session: Session, run: PostrunRun) -> dict | None:
    item = session.exec(
        select(PostrunOutbox).where(PostrunOutbox.run_id == run.id).order_by(PostrunOutbox.id.desc())
    ).first()
    if item is None:
        return None
    return {
        "version": item.version, "retracted": item.retracted, "state": item.state, "answer": item.answer,
        "attempts": item.attempts, "last_error": item.last_error,
        "sent_at": as_utc(item.sent_at).isoformat() if item.sent_at else None,
    }


def iso(dt: datetime | None) -> str | None:
    return as_utc(dt).isoformat() if dt else None
