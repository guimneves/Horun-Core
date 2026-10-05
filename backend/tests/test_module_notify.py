"""Notificações pedidas por módulos (routes_module_notify.py): chave por
módulo, só avisa quem tem acesso, sininho com link para dentro do módulo,
e-mail respeitando o opt-out."""

import pytest
from sqlmodel import Session

from app.core import email as email_mod
from app.core.config import settings
from app.db.models import Module, User


@pytest.fixture()
def module(db_engine):
    with Session(db_engine) as s:
        s.add(Module(id="reagentes", display_name="Reagentes", internal_base_url="http://x:8000"))
        s.commit()
    return "reagentes"


@pytest.fixture()
def token(super_admin_client, module):
    r = super_admin_client.post(f"/modules/{module}/notify-token")
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture()
def captured_emails(monkeypatch):
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_from", "horun@test")
    monkeypatch.setattr(settings, "public_url", "http://horun.lab")
    monkeypatch.setattr(email_mod, "send_email_async", lambda to, subject, body: sent.append((to, subject, body)))
    return sent


def _notify(client, token, **body):
    payload = {"subject": "Estoque baixo: acetona", "text": "Restam 2 frascos.", "link": "/liberados"}
    payload.update(body)
    return client.post("/internal/modules/reagentes/notify", json=payload, headers={"Authorization": f"Bearer {token}"})


def _set_email(db_engine, user_id, email, opt_in=True):
    with Session(db_engine) as s:
        u = s.get(User, user_id)
        u.email, u.email_notifications = email, opt_in
        s.add(u)
        s.commit()


def test_only_admin_generates_the_key(user_a_client, module):
    assert user_a_client.post(f"/modules/{module}/notify-token").status_code == 403


def test_wrong_or_missing_key_is_refused(client, token):
    assert _notify(client, "outra-chave", user_ids=[1]).status_code == 401
    assert client.post("/internal/modules/reagentes/notify", json={"subject": "x"}).status_code == 401
    # módulo inexistente responde igual (não revela quais existem)
    r = client.post("/internal/modules/nao-existe/notify", json={"subject": "x"}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_notifies_only_people_with_access(client, token, user_a, user_b, super_admin_client, user_a_client, user_b_client, module):
    super_admin_client.post(f"/modules/{module}/access", json={"user_id": user_a.id})
    r = _notify(client, token, user_ids=[user_a.id, user_b.id])
    assert r.status_code == 200, r.text
    assert r.json()["notified"] == 1  # B não tem acesso ao módulo
    bell = user_a_client.get("/notifications").json()
    assert bell[0]["kind"] == "module"
    assert bell[0]["text"] == "Reagentes: Estoque baixo: acetona"
    assert bell[0]["link"] == "/m/reagentes/liberados"
    assert user_b_client.get("/notifications").json() == []


def test_levels_reach_coordinators(client, token, admin2, user_a):
    r = _notify(client, token, levels=[2])
    assert r.json()["notified"] == 1  # admin2 (coordenador) vê todo módulo; A (IC) não é desse nível


def test_email_respects_opt_out_and_carries_the_link(client, token, db_engine, admin2, captured_emails, super_admin_user):
    _set_email(db_engine, admin2.id, "coord@nqtr.br")
    _set_email(db_engine, super_admin_user.id, "admin@nqtr.br", opt_in=False)
    r = _notify(client, token, levels=[1, 2])
    assert r.json() == {"notified": 2, "emailed": 1}
    (to, subject, body), = captured_emails
    assert to == "coord@nqtr.br"
    assert subject == "[Horun · Reagentes] Estoque baixo: acetona"
    assert "Restam 2 frascos." in body and "http://horun.lab/m/reagentes/liberados" in body


def test_email_false_only_rings_the_bell(client, token, db_engine, admin2, captured_emails):
    _set_email(db_engine, admin2.id, "coord@nqtr.br")
    assert _notify(client, token, levels=[2], email=False).json() == {"notified": 1, "emailed": 0}
    assert captured_emails == []


def test_new_key_replaces_old_and_revoke(client, token, super_admin_client, admin2, module):
    new = super_admin_client.post(f"/modules/{module}/notify-token").json()["token"]
    assert _notify(client, token, levels=[2]).status_code == 401
    assert _notify(client, new, levels=[2]).status_code == 200
    assert super_admin_client.get("/modules").json()[0]["has_notify_token"] is True
    super_admin_client.delete(f"/modules/{module}/notify-token")
    assert _notify(client, new, levels=[2]).status_code == 401
