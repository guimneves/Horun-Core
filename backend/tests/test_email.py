import pytest

from app.core import email as email_mod
from app.core.config import settings


@pytest.fixture()
def captured_emails(monkeypatch):
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_from", "horun@test")
    # send_email_async normalmente abre uma thread; aqui grava síncrono.
    monkeypatch.setattr(email_mod, "send_email_async", lambda to, subject, body: sent.append((to, subject, body)))
    return sent


def test_no_email_when_smtp_not_configured(user_a_client, user_b_client):
    # settings.email_enabled é False por padrão nos testes → nada quebra
    user_a_client.patch("/auth/me", json={"full_name": "A"})
    user_b_client.patch("/auth/me", json={"email": "b@nqtr.br"})
    r = user_a_client.post("/posts", data={"content": "@usuario-b oi"})
    assert r.status_code == 200  # sem SMTP, segue normal


def test_mention_emails_recipient_with_email_and_opt_in(captured_emails, user_a_client, user_b_client):
    user_b_client.patch("/auth/me", json={"email": "bia@nqtr.br", "email_notifications": True})
    user_a_client.post("/posts", data={"content": "@usuario-b confere isso"})
    assert any(to == "bia@nqtr.br" for to, _s, _b in captured_emails)


def test_no_email_when_opted_out(captured_emails, user_a_client, user_b_client):
    user_b_client.patch("/auth/me", json={"email": "bia@nqtr.br", "email_notifications": False})
    user_a_client.post("/posts", data={"content": "@usuario-b silêncio"})
    assert captured_emails == []


def test_no_email_when_no_address(captured_emails, user_a_client, user_b_client):
    user_b_client.patch("/auth/me", json={"email": "", "email_notifications": True})
    user_a_client.post("/posts", data={"content": "@usuario-b sem email"})
    assert captured_emails == []


def test_email_notifications_default_true_and_toggleable(user_a_client):
    assert user_a_client.get("/auth/me").json()["email_notifications"] is True
    r = user_a_client.patch("/auth/me", json={"email_notifications": False})
    assert r.json()["email_notifications"] is False


def test_weekly_reminder_emails_members(captured_emails, super_admin_client, user_a_client):
    from datetime import date

    today = date.today()
    user_a_client.patch(
        "/auth/me",
        json={"email": "ana@nqtr.br", "birth_set": True, "birth_day": today.day, "birth_month": today.month},
    )
    super_admin_client.post("/admin/reminders/weekly-birthdays")
    assert any(to == "ana@nqtr.br" for to, _s, _b in captured_emails)
