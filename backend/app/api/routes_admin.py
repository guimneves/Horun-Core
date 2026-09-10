"""Operações de administração da plataforma que não se encaixam nos
outros routers (disparo manual de tarefas agendadas, etc.)."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import SessionDep, SuperAdminUser
from app.services.reminders import send_weekly_birthday_reminder

router = APIRouter(tags=["admin"])


@router.post("/admin/reminders/weekly-birthdays")
def run_weekly_birthday_reminder(_admin: SuperAdminUser, session: SessionDep):
    """Dispara o lembrete semanal de aniversários agora (o agendador roda
    sozinho toda segunda 07:30). Útil pra testar ou pra reenviar."""
    n = send_weekly_birthday_reminder(force=True, session=session)
    return {"notifications_created": n}
