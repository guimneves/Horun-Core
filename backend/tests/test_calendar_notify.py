"""Avisos da Agenda (services/calendar_notify.py): reuniões de grupo avisam
todos os membros; reservas avisam quem reservou; lembretes antes do início."""

from datetime import datetime, timedelta

import pytest
from sqlmodel import Session, select

from app.core import email as email_mod
from app.core.config import settings
from app.db.models import User
from app.services.calendar_notify import send_due_reminders


@pytest.fixture()
def emails(monkeypatch, db_engine):
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_from", "horun@test")
    monkeypatch.setattr(email_mod, "send_email_async", lambda to, subject, body: sent.append((to, subject, body)))
    return sent


def _give_emails(db_engine):
    with Session(db_engine) as s:
        for u in s.exec(select(User)).all():
            u.email = f"{u.username}@nqtr.br"
            s.add(u)
        s.commit()


def _future(hours: float) -> str:
    return (datetime.now() + timedelta(hours=hours)).replace(microsecond=0).isoformat()


@pytest.fixture()
def group(super_admin_client, user_a, user_b):
    g = super_admin_client.post("/groups", json={"name": "Geoquímica", "internal_admin_id": 1}).json()
    for u in (user_a, user_b):
        super_admin_client.post(f"/groups/{g['id']}/members", json={"user_id": u.id})
    return g


def _meeting(client, group_id, **extra):
    body = {"title": "Reunião semanal", "location": "Sala 610", "start_at": _future(48), "end_at": _future(49),
            "all_day": False, "group_id": group_id}
    body.update(extra)
    r = client.post("/events", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_group_meeting_notifies_every_member_but_the_author(super_admin_client, user_a_client, user_b_client, group, db_engine, emails):
    _give_emails(db_engine)
    _meeting(super_admin_client, group["id"])
    for c in (user_a_client, user_b_client):
        bell = c.get("/notifications").json()
        assert bell[0]["kind"] == "group_event" and "Reunião semanal" in bell[0]["text"]
    assert super_admin_client.get("/notifications").json() == []  # quem marcou não é avisado
    assert {to for to, _s, _b in emails} == {"usuario-a@nqtr.br", "usuario-b@nqtr.br"}
    assert all("Sala 610" in body for _t, _s, body in emails)


def test_meeting_change_and_cancel_notify(super_admin_client, user_a_client, group):
    ev = _meeting(super_admin_client, group["id"])
    super_admin_client.patch(f"/events/{ev['id']}", json={**ev, "start_at": _future(72), "end_at": _future(73)})
    super_admin_client.delete(f"/events/{ev['id']}")
    texts = [n["text"] for n in user_a_client.get("/notifications").json()]
    assert any(t.startswith("Evento alterado") for t in texts)
    assert any(t.startswith("Evento cancelado") for t in texts)


def test_lab_events_do_not_notify(super_admin_client, user_a_client):
    _meeting(super_admin_client, None)
    assert user_a_client.get("/notifications").json() == []


def _reserve(client, hours=3):
    r = client.post("/reservations", json={"equipment_id": "re7s", "title": "Rotina",
                                           "start_at": _future(hours), "end_at": _future(hours + 2)})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture()
def equipment(super_admin_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "Rock-Eval 7S", "color": "#15216f"})


def test_reservation_confirmation_is_email_only(user_a_client, equipment, db_engine, emails):
    _give_emails(db_engine)
    _reserve(user_a_client)
    (to, subject, _body), = emails
    assert to == "usuario-a@nqtr.br" and subject.startswith("Horun · Reserva confirmada: Rock-Eval 7S")
    assert user_a_client.get("/notifications").json() == []  # a própria ação não toca o sininho


def test_moderator_moving_or_cancelling_notifies_the_owner(super_admin_client, user_a_client, equipment):
    r = _reserve(user_a_client)
    super_admin_client.patch(f"/reservations/{r['id']}", json={"equipment_id": "re7s", "start_at": _future(5), "end_at": _future(6)})
    super_admin_client.delete(f"/reservations/{r['id']}")
    texts = [n["text"] for n in user_a_client.get("/notifications").json()]
    assert any(t.startswith("Reserva reagendada por superadmin") for t in texts)
    assert any(t.startswith("Reserva cancelada por superadmin") for t in texts)


def test_owner_moving_own_reservation_is_silent(user_a_client, equipment):
    r = _reserve(user_a_client)
    user_a_client.patch(f"/reservations/{r['id']}", json={"equipment_id": "re7s", "start_at": _future(5), "end_at": _future(6)})
    assert user_a_client.get("/notifications").json() == []


def test_reminders_once_and_only_when_due(super_admin_client, user_a_client, group, equipment, db_engine):
    _meeting(super_admin_client, group["id"], start_at=_future(20), end_at=_future(21))  # dentro de 24 h
    _meeting(super_admin_client, group["id"], title="Longe", start_at=_future(60), end_at=_future(61))
    _reserve(user_a_client, hours=0.5)  # começa em 30 min
    _reserve(user_a_client, hours=10)  # ainda longe
    assert super_admin_client.post("/admin/reminders/calendar").json() == {"events": 1, "reservations": 1}
    assert super_admin_client.post("/admin/reminders/calendar").json() == {"events": 0, "reservations": 0}
    texts = [n["text"] for n in user_a_client.get("/notifications").json()]
    assert any(t.startswith("Lembrete — Geoquímica: Reunião semanal") for t in texts)
    assert any(t.startswith("Lembrete: sua reserva do Rock-Eval 7S") for t in texts)
    with Session(db_engine) as s:  # o agendador usa a própria sessão
        assert send_due_reminders(s, datetime.now() + timedelta(hours=40)) == {"events": 1, "reservations": 0}


def test_only_coordinator_triggers_reminders(user_a_client):
    assert user_a_client.post("/admin/reminders/calendar").status_code == 403
