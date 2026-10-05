"""Operações de administração da plataforma que não se encaixam nos
outros routers (disparo manual de tarefas agendadas, etc.)."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import SessionDep, CoordinatorUser
from app.services.calendar_notify import send_due_reminders
from app.services.reminders import send_weekly_birthday_reminder

router = APIRouter(tags=["admin"])


@router.post("/admin/reminders/calendar")
def run_calendar_reminders(_admin: CoordinatorUser, session: SessionDep):
    """Dispara agora os lembretes da Agenda que estão no prazo (o agendador
    roda sozinho a cada 15 min): reuniões de grupo e reservas."""
    return send_due_reminders(session)


@router.post("/admin/reminders/weekly-birthdays")
def run_weekly_birthday_reminder(_admin: CoordinatorUser, session: SessionDep):
    """Dispara o lembrete semanal de aniversários agora (o agendador roda
    sozinho toda segunda 07:30). Útil pra testar ou pra reenviar."""
    n = send_weekly_birthday_reminder(force=True, session=session)
    return {"notifications_created": n}
