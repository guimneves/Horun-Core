"""Agendador de tarefas do Core (APScheduler, em processo). Roda dentro
do mesmo processo do uvicorn — suficiente pra um deploy de instância
única. Se um dia virar multi-instância, trocar por um agendador externo
pra não disparar N vezes."""

from __future__ import annotations

import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlmodel import Session

from app.db.session import engine
from app.services.calendar_notify import send_due_reminders
from app.services.reminders import send_weekly_birthday_reminder

log = logging.getLogger("horun.scheduler")

_scheduler: BackgroundScheduler | None = None


def _weekly_birthday_job() -> None:
    try:
        n = send_weekly_birthday_reminder()
        if n:
            log.info("Lembrete semanal de aniversários enviado para %d usuários.", n)
    except Exception:  # noqa: BLE001 — job não pode derrubar o agendador
        log.exception("Falha no lembrete semanal de aniversários.")


def _calendar_reminders_job() -> None:
    try:
        with Session(engine) as session:
            sent = send_due_reminders(session)
        if any(sent.values()):
            log.info("Lembretes da Agenda: %s", sent)
    except Exception:  # noqa: BLE001 — job não pode derrubar o agendador
        log.exception("Falha nos lembretes da Agenda.")


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    # Desligado nos testes (conftest) e onde não faz sentido — o
    # BackgroundScheduler abre uma thread real.
    if os.environ.get("CORE_SCHEDULER", "1") == "0" or "PYTEST_CURRENT_TEST" in os.environ:
        return
    _scheduler = BackgroundScheduler(timezone="America/Sao_Paulo")
    # Segunda-feira, 07:30 — antes de a maioria começar o dia.
    _scheduler.add_job(
        _weekly_birthday_job,
        CronTrigger(day_of_week="mon", hour=7, minute=30),
        id="weekly_birthday_reminder",
        misfire_grace_time=6 * 3600,  # se o servidor estava fora do ar no horário, roda ao voltar
        replace_existing=True,
    )
    # Lembretes da Agenda: reuniões de grupo (véspera) e reservas (1 h antes).
    _scheduler.add_job(
        _calendar_reminders_job,
        IntervalTrigger(minutes=15),
        id="calendar_reminders",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    _scheduler.start()
    log.info("Agendador iniciado (aniversários: seg 07:30; lembretes da Agenda: a cada 15 min).")


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
