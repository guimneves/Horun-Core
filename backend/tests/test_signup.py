"""Cadastro automático: chave do administrador máximo, código por e-mail,
regras do nome de usuário, criação da conta com login automático."""

import re

import pytest
from fastapi.testclient import TestClient

from app.core import email as email_mod
from app.core.config import settings


@pytest.fixture
def outbox(monkeypatch):
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_from", "horun@test")
    monkeypatch.setattr(email_mod, "send_email_async", lambda to, subject, body: sent.append((to, subject, body)))
    return sent


def _enable(super_admin_client):
    r = super_admin_client.put("/admin/signup-settings", json={"enabled": True})
    assert r.status_code == 200, r.text


def _code(outbox) -> str:
    return re.search(r"\b(\d{6})\b", outbox[-1][2]).group(1)


def test_only_admin_maximo_toggles(super_admin_client, admin2_client, user_a_client, outbox):
    assert admin2_client.get("/admin/signup-settings").json() == {"enabled": False, "email_configured": True}
    assert admin2_client.put("/admin/signup-settings", json={"enabled": True}).status_code == 403
    assert user_a_client.put("/admin/signup-settings", json={"enabled": True}).status_code == 403
    assert super_admin_client.get("/auth/me").json()["can"]["manage_signup"] is True
    assert admin2_client.get("/auth/me").json()["can"]["manage_signup"] is False
    _enable(super_admin_client)
    assert admin2_client.get("/admin/signup-settings").json()["enabled"] is True


def test_disabled_by_default(client, outbox):
    assert client.get("/auth/signup").json()["enabled"] is False
    r = client.post("/auth/signup/code", json={"email": "a@exemplo.org", "username": "maria.silva"})
    assert r.status_code == 403
    assert outbox == []


def test_needs_smtp(super_admin_client, client):
    _enable(super_admin_client)
    assert client.get("/auth/signup").json()["enabled"] is False  # sem SMTP
    r = client.post("/auth/signup/code", json={"email": "a@exemplo.org", "username": "maria.silva"})
    assert r.status_code == 503


@pytest.mark.parametrize("bad", ["ab", "Maria", "maria silva", "1maria", "joão", "a" * 31, "maria@x"])
def test_username_rules(super_admin_client, client, outbox, bad):
    _enable(super_admin_client)
    r = client.post("/auth/signup/code", json={"email": "a@exemplo.org", "username": bad})
    assert r.status_code == 400
    assert "letras minúsculas" in r.json()["detail"]


def test_full_flow_creates_user_and_logs_in(app_with_overrides, super_admin_client, outbox):
    _enable(super_admin_client)
    c = TestClient(app_with_overrides)
    assert c.get("/auth/signup").json()["enabled"] is True
    r = c.post("/auth/signup/code", json={"email": " Maria@Exemplo.org ", "username": "maria.silva"})
    assert r.status_code == 200, r.text
    assert outbox[-1][0] == "maria@exemplo.org"
    code = _code(outbox)

    base = {"email": "maria@exemplo.org", "username": "maria.silva", "code": code}
    assert c.post("/auth/signup/complete", json={**base, "password": "curta", "password_confirm": "curta"}).status_code == 400
    assert (
        c.post("/auth/signup/complete", json={**base, "password": "senha-boa-1", "password_confirm": "outra-1234"}).status_code
        == 400
    )
    r = c.post("/auth/signup/complete", json={**base, "password": "senha-boa-1", "password_confirm": "senha-boa-1"})
    assert r.status_code == 200, r.text
    me = c.get("/auth/me").json()  # login automático
    assert me["username"] == "maria.silva"
    assert me["email"] == "maria@exemplo.org"
    assert me["level"] == 5
    assert me["onboarded"] is False

    # coordenação recebe aviso no sininho
    notes = super_admin_client.get("/notifications").json()
    items = notes["items"] if isinstance(notes, dict) else notes
    assert any("maria.silva" in n["text"] for n in items)

    # entrar de novo com a senha escolhida
    c2 = TestClient(app_with_overrides)
    assert c2.post("/auth/login", json={"username": "maria.silva", "password": "senha-boa-1"}).status_code == 200

    # usuário e e-mail agora ocupados
    r = c2.post("/auth/signup/code", json={"email": "maria@exemplo.org", "username": "outra.pessoa"})
    assert r.status_code == 409
    r = c2.post("/auth/signup/code", json={"email": "nova@exemplo.org", "username": "maria.silva"})
    assert r.status_code == 409


def test_wrong_code_attempts_then_new_code(super_admin_client, client, outbox):
    _enable(super_admin_client)
    client.post("/auth/signup/code", json={"email": "b@exemplo.org", "username": "bruno.lima"})
    code = _code(outbox)
    wrong = "000000" if code != "000000" else "111111"
    body = {"email": "b@exemplo.org", "username": "bruno.lima", "password": "senha-boa-1", "password_confirm": "senha-boa-1"}
    for _ in range(5):
        r = client.post("/auth/signup/complete", json={**body, "code": wrong})
        assert r.status_code == 400
    # depois de 5 erros, nem o código certo vale — precisa pedir outro
    r = client.post("/auth/signup/complete", json={**body, "code": code})
    assert r.status_code in (400, 429)


def test_send_rate_limited_per_email(super_admin_client, client, outbox):
    _enable(super_admin_client)
    for _ in range(5):
        assert client.post("/auth/signup/code", json={"email": "c@exemplo.org", "username": "carla.dias"}).status_code == 200
    r = client.post("/auth/signup/code", json={"email": "c@exemplo.org", "username": "carla.dias"})
    assert r.status_code == 429
