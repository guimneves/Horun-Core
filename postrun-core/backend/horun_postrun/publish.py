"""Envio ao Resultados (contrato `horun.postrun.result/1`,
Prompt_Horun_PostRun.md seção 4) com fila de saída.

Toda publicação/retirada vira uma linha em `PostrunOutbox` ANTES de tentar
enviar: se o Resultados estiver fora, nada se perde — `retry_pending` tenta
de novo (o módulo chama a cada poucos minutos, ver `start_outbox_worker`).
O Resultados ignora versão repetida ou antiga, então reenviar nunca duplica.
"""

from __future__ import annotations

import json
import logging
import threading
import urllib.error
import urllib.request
from typing import Protocol

from sqlmodel import Session, select

from .models import PostrunOutbox, utcnow

log = logging.getLogger(__name__)


class PublishError(RuntimeError):
    pass


class Publisher(Protocol):
    description: str

    def send(self, payload: dict) -> str:
        """Entrega o payload; devolve a resposta do Resultados
        ("stored" | "ignored" | "retracted"). Falha = PublishError."""
        ...


class HttpPublisher:
    def __init__(self, url: str, token: str, *, timeout: float = 10.0):
        self.url = url.rstrip("/") + "/api/internal/postrun/results"
        self.token = token
        self.timeout = timeout
        self.description = f"Resultados ({url})"

    def send(self, payload: dict) -> str:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.token}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                answer = json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            raise PublishError(f"Resultados respondeu {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            raise PublishError(f"Resultados inacessível: {exc}") from exc
        status = str(answer.get("status", ""))
        if status not in {"stored", "ignored", "retracted"}:
            raise PublishError(f"Resposta inesperada do Resultados: {answer!r}")
        return status


class DisabledPublisher:
    """Sem POSTRUN_RESULTADOS_URL/TOKEN: as publicações ficam na fila."""

    description = "Resultados não configurado (as publicações ficam na fila)"

    def send(self, payload: dict) -> str:
        raise PublishError("Envio ao Resultados não configurado (POSTRUN_RESULTADOS_URL / POSTRUN_RESULTADOS_TOKEN)")


def try_send(session: Session, item: PostrunOutbox, publisher: Publisher) -> bool:
    item.attempts += 1
    try:
        item.answer = publisher.send(json.loads(item.payload_json))
    except PublishError as exc:
        item.last_error = str(exc)[:500]
        session.add(item)
        session.commit()
        return False
    item.state = "enviado"
    item.sent_at = utcnow()
    item.last_error = ""
    session.add(item)
    session.commit()
    return True


def retry_pending(session: Session, publisher: Publisher, *, limit: int = 200) -> dict:
    pending = session.exec(
        select(PostrunOutbox).where(PostrunOutbox.state == "pendente").order_by(PostrunOutbox.id).limit(limit)
    ).all()
    sent = sum(1 for item in pending if try_send(session, item, publisher))
    return {"tried": len(pending), "sent": sent, "still_pending": len(pending) - sent}


def start_outbox_worker(engine, publisher: Publisher, *, interval_seconds: float = 300.0) -> threading.Event:
    """Reenvia o que ficou pendente a cada `interval_seconds`. Devolve o
    evento para parar (o lifespan do módulo chama `.set()` ao desligar)."""
    stop = threading.Event()

    def loop() -> None:
        while not stop.wait(interval_seconds):
            try:
                with Session(engine) as session:
                    result = retry_pending(session, publisher)
                if result["tried"]:
                    log.info("fila do Resultados: %s", result)
            except Exception:  # noqa: BLE001 — o laço nunca pode morrer
                log.exception("falha ao reenviar a fila do Resultados")

    threading.Thread(target=loop, name="postrun-outbox", daemon=True).start()
    return stop
