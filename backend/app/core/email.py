"""Envio de e-mail (SMTP direto, ex. Gmail + senha de app). Não é um
serviço separado — é chamado do backend, em thread, pras notificações
importantes. Sem SMTP configurado (`settings.email_enabled` False), tudo
vira no-op silencioso — o app funciona igual, só sem e-mail."""

from __future__ import annotations

import logging
import smtplib
import threading
from email.message import EmailMessage

from app.core.config import settings
from app.db.models import User

log = logging.getLogger("horun.email")


def _send(to: str, subject: str, body: str) -> None:
    if not settings.email_enabled or not to:
        return
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
            s.starttls()
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_pass)
            s.send_message(msg)
    except Exception:  # noqa: BLE001 — e-mail falhando não pode derrubar a requisição
        log.exception("Falha ao enviar e-mail para %s", to)


def send_email_async(to: str, subject: str, body: str) -> None:
    """Fire-and-forget — não bloqueia a requisição."""
    if not settings.email_enabled or not to:
        return
    threading.Thread(target=_send, args=(to, subject, body), daemon=True).start()


def notify_user_by_email(user: User, subject: str, body: str) -> None:
    """Respeita o opt-out da pessoa (`email_notifications`) e só manda se
    ela tem e-mail cadastrado."""
    if not settings.email_enabled:
        return
    if not user.email or not getattr(user, "email_notifications", True):
        return
    send_email_async(user.email, subject, body)
