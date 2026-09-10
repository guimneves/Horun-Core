"""Lembretes automáticos do Core. Hoje: aviso semanal (segunda de manhã)
com os aniversariantes da semana — uma notificação pra cada usuário."""

from __future__ import annotations

from datetime import date

from sqlmodel import Session, select

from app.core.birthdays import birthdays_between, week_bounds
from app.db.models import AppState, Notification, User
from app.db.session import engine

_STATE_KEY = "last_weekly_birthday_reminder"
_PT_WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


def _get_state(session: Session, key: str) -> str | None:
    row = session.get(AppState, key)
    return row.value if row else None


def _set_state(session: Session, key: str, value: str) -> None:
    row = session.get(AppState, key)
    if row is None:
        session.add(AppState(key=key, value=value))
    else:
        row.value = value
        session.add(row)


def _run(session: Session, force: bool) -> int:
    today = date.today()
    monday, sunday = week_bounds(today)
    week_key = monday.isoformat()

    if not force and _get_state(session, _STATE_KEY) == week_key:
        return 0

    occ = birthdays_between(session, monday, sunday)
    _set_state(session, _STATE_KEY, week_key)

    if not occ:
        session.commit()
        return 0

    parts = [
        f"{u.full_name or u.display_name or u.username} ({_PT_WEEKDAYS[d.weekday()]} {d.day}/{d.month})"
        for u, d in occ
    ]
    text = "🎂 Aniversariantes desta semana: " + ", ".join(parts)

    users = session.exec(select(User)).all()
    for target in users:
        session.add(
            Notification(user_id=target.id, kind="birthday_week", text=text, link="/agenda", actor_id=None)
        )
    session.commit()
    return len(users)


def send_weekly_birthday_reminder(force: bool = False, session: Session | None = None) -> int:
    """Cria uma notificação pra cada usuário com os aniversariantes da
    semana atual. Idempotente por semana (a não ser com force=True, pro
    disparo manual). Retorna quantas notificações criou. Passe `session`
    (ex. da requisição) ou deixe abrir uma própria (uso do agendador)."""
    if session is not None:
        return _run(session, force)
    with Session(engine) as own:
        return _run(own, force)
