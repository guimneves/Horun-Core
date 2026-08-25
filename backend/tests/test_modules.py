import app.api.routes_modules as routes_modules


def _register_module(client, module_id="re7s"):
    return client.post(
        "/modules",
        json={
            "id": module_id,
            "display_name": "RE7S",
            "codename": "Ogun",
            "description": "Modulo Rock-Eval",
            "icon": "🪨",
            "internal_base_url": "http://re7s-backend:8000",
            "health_path": "/health",
        },
    )


def test_only_super_admin_can_register_module(user_a_client):
    r = _register_module(user_a_client)
    assert r.status_code == 403


def test_super_admin_can_register_and_list_modules(super_admin_client):
    r = _register_module(super_admin_client)
    assert r.status_code == 200
    assert r.json()["id"] == "re7s"

    r2 = super_admin_client.get("/modules")
    assert r2.status_code == 200
    assert len(r2.json()) == 1


def test_duplicate_module_id_conflicts(super_admin_client):
    _register_module(super_admin_client)
    r = _register_module(super_admin_client)
    assert r.status_code == 409


def test_delete_module(super_admin_client):
    _register_module(super_admin_client)
    r = super_admin_client.delete("/modules/re7s")
    assert r.status_code == 200
    assert super_admin_client.get("/modules").json() == []


def test_dashboard_shows_module_offline_when_unreachable(super_admin_client):
    _register_module(super_admin_client)
    # Sem mock: internal_base_url aponta pra um host que não existe na
    # rede de teste, então o health check real deve falhar rápido (timeout
    # curto configurado em Settings) e reportar "offline".
    r = super_admin_client.get("/dashboard/modules")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["status"] == "offline"


def test_dashboard_reports_online_when_health_check_succeeds(super_admin_client, monkeypatch):
    _register_module(super_admin_client)

    async def _fake_online(module):
        return True

    monkeypatch.setattr(routes_modules, "_check_module_online", _fake_online)

    r = super_admin_client.get("/dashboard/modules")
    assert r.json()[0]["status"] == "online"


def test_regular_user_without_grant_has_no_access_but_sees_module(super_admin_client, user_a_client):
    _register_module(super_admin_client)

    r = user_a_client.get("/dashboard/modules")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1  # visível mesmo sem permissão (seção 5 do Prompt_Horun_Core.md)
    assert body[0]["has_access"] is False


def test_super_admin_can_grant_and_revoke_access(super_admin_client, user_a_client, user_a):
    _register_module(super_admin_client)

    r = super_admin_client.post("/modules/re7s/access", json={"user_id": user_a.id})
    assert r.status_code == 200

    dash = user_a_client.get("/dashboard/modules").json()
    assert dash[0]["has_access"] is True

    r2 = super_admin_client.delete(f"/modules/re7s/access/{user_a.id}")
    assert r2.status_code == 200

    dash2 = user_a_client.get("/dashboard/modules").json()
    assert dash2[0]["has_access"] is False


def test_regular_user_cannot_grant_access(user_a_client, user_b, super_admin_client):
    _register_module(super_admin_client)
    r = user_a_client.post("/modules/re7s/access", json={"user_id": user_b.id})
    assert r.status_code == 403


def test_super_admin_always_has_access_without_explicit_grant(super_admin_client):
    _register_module(super_admin_client)
    dash = super_admin_client.get("/dashboard/modules").json()
    assert dash[0]["has_access"] is True
