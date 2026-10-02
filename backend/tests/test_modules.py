import app.api.routes_modules as routes_modules


def _register_module(client, module_id="re7s"):
    return client.post(
        "/modules",
        json={
            "id": module_id,
            "display_name": "RE7S",
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


# --- Contribuidores (créditos) ---------------------------------------------


def test_list_contributors_empty(super_admin_client, user_a_client):
    _register_module(super_admin_client)
    r = user_a_client.get("/modules/re7s/contributors")
    assert r.status_code == 200
    assert r.json() == []


def test_add_and_list_contributor(super_admin_client, user_a_client, user_a):
    _register_module(super_admin_client)
    r = super_admin_client.post("/modules/re7s/contributors", json={"user_id": user_a.id})
    assert r.status_code == 200
    assert r.json()["user_id"] == user_a.id

    r2 = user_a_client.get("/modules/re7s/contributors")
    assert len(r2.json()) == 1
    assert r2.json()[0]["display_name"]


def test_regular_user_cannot_add_contributor(user_a_client, user_b, super_admin_client):
    _register_module(super_admin_client)
    r = user_a_client.post("/modules/re7s/contributors", json={"user_id": user_b.id})
    assert r.status_code == 403


def test_adding_same_contributor_twice_is_idempotent(super_admin_client, user_a):
    _register_module(super_admin_client)
    super_admin_client.post("/modules/re7s/contributors", json={"user_id": user_a.id})
    super_admin_client.post("/modules/re7s/contributors", json={"user_id": user_a.id})
    r = super_admin_client.get("/modules/re7s/contributors")
    assert len(r.json()) == 1


def test_remove_contributor(super_admin_client, user_a):
    _register_module(super_admin_client)
    super_admin_client.post("/modules/re7s/contributors", json={"user_id": user_a.id})
    r = super_admin_client.delete(f"/modules/re7s/contributors/{user_a.id}")
    assert r.status_code == 200
    assert super_admin_client.get("/modules/re7s/contributors").json() == []


def test_remove_contributor_requires_super_admin(super_admin_client, user_a_client, user_a):
    _register_module(super_admin_client)
    super_admin_client.post("/modules/re7s/contributors", json={"user_id": user_a.id})
    r = user_a_client.delete(f"/modules/re7s/contributors/{user_a.id}")
    assert r.status_code == 403


def test_contributor_module_must_exist(super_admin_client, user_a):
    r = super_admin_client.post("/modules/nao-existe/contributors", json={"user_id": user_a.id})
    assert r.status_code == 404


# --- Id do módulo como slug (lição 4 do Prompt_Horun_Core.md) --------------


def test_module_id_must_be_slug(super_admin_client):
    for bad in ["re 7s", "re/7s", "reagentes ácidos", "x", "..", ".oculto", ""]:
        r = _register_module(super_admin_client, bad)
        assert r.status_code == 422, bad
        assert "Id do módulo" in r.json()["detail"], bad
    assert super_admin_client.get("/modules").json() == []


def test_module_id_slug_accepts_existing_style_ids(super_admin_client):
    for good in ["re7s", "amostras", "reagentes", "leco_832", "rock-eval.v2"]:
        assert _register_module(super_admin_client, good).status_code == 200, good


def test_module_id_is_trimmed(super_admin_client):
    r = _register_module(super_admin_client, "  re7s  ")
    assert r.status_code == 200
    assert r.json()["id"] == "re7s"


def test_existing_module_with_non_slug_id_still_works(db_engine, super_admin_client):
    # a validação é só na criação: uma linha antiga fora do padrão continua
    # editável/listável/excluível
    from sqlmodel import Session

    from app.db.models import Module

    with Session(db_engine) as s:
        s.add(Module(id="Antigo", display_name="Antigo", internal_base_url="http://x"))
        s.commit()
    r = super_admin_client.patch(
        "/modules/Antigo", json={"id": "Antigo", "display_name": "Novo nome", "internal_base_url": "http://x"}
    )
    assert r.status_code == 200
    assert r.json()["display_name"] == "Novo nome"
    assert super_admin_client.delete("/modules/Antigo").status_code == 200


# --- Excluir módulo com dependentes (8.3 item 10) -------------------------


def test_delete_module_handles_grants_contributors_and_equipment(db_engine, super_admin_client, user_a):
    from sqlmodel import Session, select

    from app.db.models import Equipment, ModuleContributor, UserModuleAccess

    _register_module(super_admin_client)
    assert super_admin_client.post("/modules/re7s/access", json={"user_id": user_a.id}).status_code == 200
    assert super_admin_client.post("/modules/re7s/contributors", json={"user_id": user_a.id}).status_code == 200
    r = super_admin_client.post("/equipment", json={"id": "re7s-eq", "display_name": "RE7S", "module_id": "re7s"})
    assert r.status_code == 200

    r = super_admin_client.delete("/modules/re7s")
    assert r.status_code == 200

    # SQLite dos testes não reforça FK (lição 6) — então conferimos que
    # nada ficou apontando pro módulo que sumiu
    with Session(db_engine) as s:
        assert s.exec(select(UserModuleAccess).where(UserModuleAccess.module_id == "re7s")).all() == []
        assert s.exec(select(ModuleContributor).where(ModuleContributor.module_id == "re7s")).all() == []
        eq = s.get(Equipment, "re7s-eq")
        assert eq is not None  # equipamento fica, só desvinculado
        assert eq.module_id is None


def test_delete_module_with_dependents_under_foreign_keys(super_admin_client, db_engine, user_a):
    # Mesmo caminho com PRAGMA foreign_keys=ON — o mais perto do Postgres
    # que dá pra chegar no SQLite em memória (antes: IntegrityError → 500).
    from sqlalchemy import text

    _register_module(super_admin_client)
    super_admin_client.post("/modules/re7s/access", json={"user_id": user_a.id})
    super_admin_client.post("/modules/re7s/contributors", json={"user_id": user_a.id})
    super_admin_client.post("/equipment", json={"id": "re7s-eq", "display_name": "RE7S", "module_id": "re7s"})

    with db_engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()
    r = super_admin_client.delete("/modules/re7s")
    assert r.status_code == 200, r.text
    with db_engine.connect() as conn:
        assert conn.execute(text("PRAGMA foreign_key_check")).fetchall() == []


# --- Dashboard: health checks em paralelo (8.3 item 10) --------------------


def test_dashboard_health_checks_run_concurrently(super_admin_client, monkeypatch):
    import asyncio
    import time

    for i in range(5):
        _register_module(super_admin_client, f"mod{i}")

    async def _slow_online(module):
        await asyncio.sleep(0.4)
        return True

    monkeypatch.setattr(routes_modules, "_check_module_online", _slow_online)
    t0 = time.monotonic()
    body = super_admin_client.get("/dashboard/modules").json()
    elapsed = time.monotonic() - t0
    assert [m["status"] for m in body] == ["online"] * 5
    assert elapsed < 1.5  # em série seriam ≥ 2,0 s


def test_dashboard_hung_modules_cost_about_one_timeout(super_admin_client, monkeypatch):
    import asyncio
    import time

    for i in range(5):
        _register_module(super_admin_client, f"mod{i}")

    async def _hung(module):
        await asyncio.sleep(30)  # módulo "meio vivo": nunca responde
        return True

    monkeypatch.setattr(routes_modules, "_check_module_online", _hung)
    monkeypatch.setattr(routes_modules.settings, "module_health_timeout_seconds", 0.2)
    t0 = time.monotonic()
    body = super_admin_client.get("/dashboard/modules").json()
    elapsed = time.monotonic() - t0
    assert [m["status"] for m in body] == ["offline"] * 5
    assert elapsed < 2.0  # um teto (0,2 + 0,5 s), não cinco


def test_dashboard_unexpected_checker_error_is_offline(super_admin_client, monkeypatch):
    _register_module(super_admin_client)

    async def _boom(module):
        raise RuntimeError("falha inesperada")

    monkeypatch.setattr(routes_modules, "_check_module_online", _boom)
    r = super_admin_client.get("/dashboard/modules")
    assert r.status_code == 200
    assert r.json()[0]["status"] == "offline"
