"""Endurecimento do login (revisão de 2026-10-01, item 2): limite de
tentativas, código de primeiro acesso mais forte e com prazo, sessões que
caem ao trocar a senha, cookie Secure, checagem de Origin e chave de sessão
obrigatória em produção."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core import rate_limit
from app.core.config import settings
from app.core.security import _SETUP_CODE_ALPHABET, SETUP_CODE_LENGTH, generate_setup_code
from app.db.models import User
from tests.conftest import _create_user, _login


def _try_login(client, username, password):
    return client.post("/auth/login", json={"username": username, "password": password})


# ---------- limite de tentativas ----------


def test_login_is_locked_after_five_wrong_passwords(app_with_overrides, user_a):
    c = TestClient(app_with_overrides)
    for _ in range(rate_limit.MAX_PER_USER):
        assert _try_login(c, "usuario-a", "errada").status_code == 401
    # nem a senha certa entra durante o bloqueio
    r = _try_login(c, "usuario-a", "senha-a")
    assert r.status_code == 429 and "Tente de novo" in r.json()["detail"]


def test_lock_is_per_user_and_success_resets_it(app_with_overrides, user_a, user_b):
    c = TestClient(app_with_overrides)
    for _ in range(rate_limit.MAX_PER_USER - 1):
        _try_login(c, "usuario-a", "errada")
    assert _try_login(c, "usuario-b", "senha-b").status_code == 200  # outro usuário não é afetado
    assert _try_login(c, "usuario-a", "senha-a").status_code == 200
    for _ in range(rate_limit.MAX_PER_USER - 1):
        assert _try_login(c, "usuario-a", "errada").status_code == 401  # contador zerou no acerto


def test_one_ip_trying_many_usernames_is_locked(app_with_overrides, user_a):
    c = TestClient(app_with_overrides)
    for i in range(rate_limit.MAX_PER_IP):
        _try_login(c, f"inexistente{i}", "x")
    assert _try_login(c, "usuario-a", "senha-a").status_code == 429


def test_unknown_user_still_counts_as_failure(app_with_overrides):
    c = TestClient(app_with_overrides)
    for _ in range(rate_limit.MAX_PER_USER):
        assert _try_login(c, "fantasma", "x").status_code == 401
    assert _try_login(c, "fantasma", "x").status_code == 429


# ---------- código de primeiro acesso ----------


def test_setup_code_is_longer_and_unambiguous():
    for _ in range(50):
        code = generate_setup_code()
        assert len(code) == SETUP_CODE_LENGTH == 8
        assert set(code) <= set(_SETUP_CODE_ALPHABET)
        assert not set(code) & set("0O1IL")


def test_setup_code_accepts_lowercase_and_separators(super_admin_client, app_with_overrides):
    code = super_admin_client.post("/users", json={"username": "nova"}).json()["setup_code"]
    typed = f"{code[:4].lower()}-{code[4:]}"
    c = TestClient(app_with_overrides)
    r = c.post("/auth/set-password", json={"username": "nova", "setup_code": typed, "new_password": "senhanova123"})
    assert r.status_code == 200


def test_setup_code_guessing_is_locked(super_admin_client, app_with_overrides):
    code = super_admin_client.post("/users", json={"username": "nova"}).json()["setup_code"]
    c = TestClient(app_with_overrides)
    for _ in range(rate_limit.MAX_PER_USER):
        assert c.post(
            "/auth/set-password", json={"username": "nova", "setup_code": "AAAAAAAA", "new_password": "senhanova123"}
        ).status_code == 400
    r = c.post("/auth/set-password", json={"username": "nova", "setup_code": code, "new_password": "senhanova123"})
    assert r.status_code == 429


def test_expired_setup_code_is_refused(super_admin_client, app_with_overrides, db_engine):
    body = super_admin_client.post("/users", json={"username": "nova"}).json()
    with Session(db_engine) as s:
        user = s.get(User, body["id"])
        user.setup_code_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        s.add(user)
        s.commit()
    c = TestClient(app_with_overrides)
    r = c.post(
        "/auth/set-password", json={"username": "nova", "setup_code": body["setup_code"], "new_password": "senhanova123"}
    )
    assert r.status_code == 400 and "expirado" in r.json()["detail"]


def test_new_setup_codes_have_a_deadline(super_admin_client, db_engine):
    body = super_admin_client.post("/users", json={"username": "nova"}).json()
    with Session(db_engine) as s:
        expires = s.get(User, body["id"]).setup_code_expires_at
    assert expires is not None


# ---------- sessões ----------


def test_changing_password_ends_other_sessions_but_keeps_this_one(app_with_overrides, user_a):
    pc_lab = _login(app_with_overrides, "usuario-a", "senha-a")
    celular = _login(app_with_overrides, "usuario-a", "senha-a")
    r = celular.post("/auth/change-password", json={"current_password": "senha-a", "new_password": "nova-senha-1"})
    assert r.status_code == 200
    assert celular.get("/auth/me").status_code == 200  # quem trocou continua logado
    assert pc_lab.get("/auth/me").status_code == 401  # a outra sessão caiu


def test_regenerate_access_ends_the_persons_sessions(super_admin_client, app_with_overrides, user_a):
    sessao = _login(app_with_overrides, "usuario-a", "senha-a")
    assert super_admin_client.post(f"/users/{user_a.id}/regenerate-setup-code").status_code == 200
    assert sessao.get("/auth/me").status_code == 401


def test_admin_setting_a_password_ends_sessions_and_needs_six_chars(super_admin_client, app_with_overrides, user_a):
    sessao = _login(app_with_overrides, "usuario-a", "senha-a")
    assert super_admin_client.patch(f"/users/{user_a.id}", json={"password": "123"}).status_code == 400
    assert super_admin_client.patch(f"/users/{user_a.id}", json={"password": "outra-senha"}).status_code == 200
    assert sessao.get("/auth/me").status_code == 401


def test_cookie_is_secure_when_configured(app_with_overrides, user_a, monkeypatch):
    monkeypatch.setattr(settings, "cookie_secure", True)
    r = _try_login(TestClient(app_with_overrides), "usuario-a", "senha-a")
    assert "secure" in r.headers["set-cookie"].lower()


# ---------- CSRF (Origin) ----------


def test_write_from_another_site_is_refused(user_a_client):
    r = user_a_client.post("/posts", data={"content": "oi"}, headers={"Origin": "https://site-malicioso.example"})
    assert r.status_code == 403


def test_write_from_the_same_site_passes(user_a_client):
    r = user_a_client.post(
        "/posts", data={"content": "oi"}, headers={"Origin": "https://192.168.31.80", "Host": "192.168.31.80"}
    )
    assert r.status_code == 200


def test_dev_frontend_origin_passes(user_a_client):
    r = user_a_client.post("/posts", data={"content": "oi"}, headers={"Origin": "http://localhost:5174"})
    assert r.status_code == 200


def test_reads_from_another_site_are_not_blocked(user_a_client):
    assert user_a_client.get("/posts", headers={"Origin": "https://outro.example"}).status_code == 200


# ---------- chave de sessão em produção ----------


@pytest.mark.parametrize("key", ["dev-only-troque-em-producao", "troque-por-um-segredo-longo-e-aleatorio", "curta"])
def test_production_refuses_example_or_short_secret_key(monkeypatch, key):
    from app.core.config import check_production_settings

    monkeypatch.setattr(settings, "database_url", "postgresql+psycopg://x@db/horun_core")
    monkeypatch.setattr(settings, "secret_key", key)
    with pytest.raises(RuntimeError, match="CORE_SECRET_KEY"):
        check_production_settings()


def test_dev_sqlite_tolerates_the_default_key(monkeypatch):
    from app.core.config import check_production_settings

    monkeypatch.setattr(settings, "database_url", "sqlite:///./x.db")
    monkeypatch.setattr(settings, "secret_key", "dev-only-troque-em-producao")
    check_production_settings()
