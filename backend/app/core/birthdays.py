"""Projeção de aniversários — sem tabela, calculado a partir dos perfis.
Usado pela rota `GET /users/birthdays` e pelo lembrete semanal."""

from __future__ import annotations

from datetime import date, timedelta

from sqlmodel import Session, select

from app.db.models import User


def birthday_on(year: int, month: int, day: int) -> date:
    try:
        return date(year, month, day)
    except ValueError:
        # 29/02 em ano não bissexto — mostra em 28/02
        return date(year, 2, 28)


def birthdays_between(session: Session, start: date, end: date) -> list[tuple[User, date]]:
    """(usuário, data da ocorrência) para cada aniversário que cai em
    [start, end], já ordenado por data."""
    out: list[tuple[User, date]] = []
    for u in session.exec(select(User)).all():
        if not u.birth_day or not u.birth_month:
            continue
        for year in range(start.year, end.year + 1):
            occ = birthday_on(year, u.birth_month, u.birth_day)
            if start <= occ <= end:
                out.append((u, occ))
    out.sort(key=lambda t: t[1])
    return out


def week_bounds(today: date) -> tuple[date, date]:
    """Segunda a domingo da semana que contém `today`."""
    monday = today - timedelta(days=today.weekday())
    return monday, monday + timedelta(days=6)
