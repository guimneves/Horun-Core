"""Níveis de permissão por posição (app/core/permissions.py,
Prompt_Horun_Core.md seção 6) e a migração dos antigos administradores."""

import pytest
from sqlmodel import Session

from app.core.permissions import capabilities, user_level
from app.db.models import User
from app.db.session import migrate_promoted_admins_to_coordinators
from tests.conftest import _create_user, _login


@pytest.fixture()
def by_position(db_engine, app_with_overrides):
    """Cria um usuário logado para cada posição: by_position("Técnico(a)")."""
    counter = {"n": 0}

    def make(position: str):
        counter["n"] += 1
        name = f"pessoa{counter['n']}"
        user = _create_user(db_engine, name, "senha-123", position=position)
        return user, _login(app_with_overrides, name, "senha-123")

    return make


# ---------- regra ----------


@pytest.mark.parametrize(
    ("position", "protected", "level"),
    [
        ("", True, 1),
        ("Pesquisador(a)", True, 1),  # a conta original é nível 1 qualquer que seja a posição
        ("Coordenador(a)", False, 2),
        ("Pesquisador(a)", False, 3),
        ("Técnico(a)", False, 4),
        ("Iniciação Científica", False, 5),
        ("", False, 5),  # sem posição = o mais restrito
    ],
)
def test_level_comes_from_position(position, protected, level):
    assert user_level(User(username="x", position=position, is_protected=protected)) == level


def test_old_super_admin_flag_alone_grants_nothing():
    assert user_level(User(username="x", is_super_admin=True)) == 5


def test_capabilities_table():
    def caps(position, protected=False):
        return capabilities(User(username="x", position=position, is_protected=protected))

    admin, coord, pesq, tec, ic = caps("", True), caps("Coordenador(a)"), caps("Pesquisador(a)"), caps("Técnico(a)"), caps("")
    assert all(admin.values())
    assert coord["manage_users"] and coord["manage_access"] and coord["manage_equipment"] and coord["moderate"]
    assert not coord["manage_modules"] and not coord["read_suggestions"]
    assert pesq["moderate"] and not (pesq["manage_users"] or pesq["manage_access"] or pesq["manage_equipment"])
    assert tec["moderate"] and tec["manage_equipment"] and not tec["manage_users"]
    assert not any(ic.values())


def test_me_returns_level_label_and_capabilities(by_position):
    _, client = by_position("Técnico(a)")
    me = client.get("/auth/me").json()
    assert me["level"] == 4 and me["level_label"] == "Técnico(a)"
    assert me["can"]["manage_equipment"] is True and me["can"]["manage_users"] is False


# ---------- nível 2: coordenador ----------


def test_coordinator_manages_users_and_access_but_not_module_integration(by_position, super_admin_client, user_a):
    super_admin_client.post(
        "/modules", json={"id": "re7s", "display_name": "RE7S", "internal_base_url": "http://x:8000", "health_path": "/health"}
    )
    _, coord = by_position("Coordenador(a)")
    assert coord.post("/users", json={"username": "novo", "password": "senha-123"}).status_code == 200
    assert coord.post("/modules/re7s/access", json={"user_id": user_a.id}).status_code == 200
    assert coord.get("/modules").status_code == 200  # precisa da lista para dar permissões
    # integração de módulo: só o nível 1
    assert coord.post("/modules", json={"id": "y", "display_name": "Y", "internal_base_url": "http://y"}).status_code == 403
    assert coord.patch("/modules/re7s", json={"id": "re7s", "display_name": "Outro", "internal_base_url": "http://x"}).status_code == 403
    assert coord.request("DELETE", "/modules/re7s").status_code == 403


def test_coordinator_changes_positions_and_that_changes_the_level(by_position, user_a, user_a_client):
    _, coord = by_position("Coordenador(a)")
    assert user_a_client.get("/auth/me").json()["level"] == 5
    assert coord.patch(f"/users/{user_a.id}", json={"position": "Técnico(a)"}).status_code == 200
    assert user_a_client.get("/auth/me").json()["level"] == 4


def test_nobody_can_touch_the_original_account(by_position, super_admin_user):
    _, coord = by_position("Coordenador(a)")
    assert coord.patch(f"/users/{super_admin_user.id}", json={"position": "Iniciação Científica"}).status_code == 403
    assert coord.request("DELETE", f"/users/{super_admin_user.id}").status_code == 403


def test_promote_toggle_no_longer_exists(by_position, user_a, user_a_client):
    _, coord = by_position("Coordenador(a)")
    coord.patch(f"/users/{user_a.id}", json={"is_super_admin": True})  # campo ignorado
    assert user_a_client.get("/auth/me").json()["level"] == 5


# ---------- nível 3: pesquisador ----------


def test_researcher_cannot_administer(by_position, user_a):
    _, pesq = by_position("Pesquisador(a)")
    assert pesq.post("/users", json={"username": "novo", "password": "senha-123"}).status_code == 403
    assert pesq.get("/users").status_code == 403
    assert pesq.post("/equipment", json={"id": "eq1", "display_name": "Eq"}).status_code == 403
    assert pesq.post("/groups", json={"name": "G", "internal_admin_id": user_a.id}).status_code == 403


def test_researcher_moderates_mural_events_reservations_and_rue(by_position, super_admin_client, user_a_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    _, pesq = by_position("Pesquisador(a)")

    post = user_a_client.post("/posts", data={"content": "aviso de outra pessoa"}).json()
    assert pesq.patch(f"/posts/{post['id']}", json={"pinned": True}).status_code == 200
    assert pesq.request("DELETE", f"/posts/{post['id']}").status_code == 200

    event = {"title": "Reunião", "start_at": "2026-10-01T14:00:00", "end_at": "2026-10-01T15:00:00"}
    assert pesq.post("/events", json=event).status_code == 200

    res = user_a_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "title": "Rotina", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    ).json()
    moved = {"equipment_id": "re7s", "start_at": "2026-09-10T13:00:00", "end_at": "2026-09-10T15:00:00"}
    assert pesq.patch(f"/reservations/{res['id']}", json=moved).status_code == 200

    log = user_a_client.post("/equipment/re7s/logs", json={"description": "uso"}).json()
    assert pesq.post(f"/equipment/re7s/logs/{log['id']}/verify").status_code == 200


# ---------- nível 4: técnico ----------


def test_technician_manages_equipment_but_not_users(by_position):
    _, tec = by_position("Técnico(a)")
    assert tec.post("/equipment", json={"id": "eq1", "display_name": "Eq"}).status_code == 200
    assert tec.patch("/equipment/eq1", json={"display_name": "Eq novo"}).status_code == 200
    assert tec.post("/equipment-areas", json={"name": "Sala 1"}).status_code == 200
    assert tec.post("/users", json={"username": "novo", "password": "senha-123"}).status_code == 403


# ---------- nível 5: IC ----------


def test_ic_has_only_basic_permissions(by_position, super_admin_client, user_a_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    _, ic = by_position("Iniciação Científica")
    post = user_a_client.post("/posts", data={"content": "aviso"}).json()
    assert ic.patch(f"/posts/{post['id']}", json={"pinned": True}).status_code == 403
    event = {"title": "Reunião", "start_at": "2026-10-01T14:00:00", "end_at": "2026-10-01T15:00:00"}
    assert ic.post("/events", json=event).status_code == 403
    assert ic.post("/equipment", json={"id": "eq1", "display_name": "Eq"}).status_code == 403
    # o básico continua: publicar, reservar, registrar uso
    assert ic.post("/posts", data={"content": "meu aviso"}).status_code == 200
    assert ic.post("/equipment/re7s/logs", json={"description": "uso"}).status_code == 200


# ---------- migração ----------


def test_promoted_admins_become_coordinators_once(db_engine):
    promoted = _create_user(db_engine, "promovido", "x", is_super_admin=True)
    original = _create_user(db_engine, "original", "x", is_super_admin=True, is_protected=True)

    assert migrate_promoted_admins_to_coordinators(db_engine) == 1
    with Session(db_engine) as s:
        p, o = s.get(User, promoted.id), s.get(User, original.id)
        assert p.position == "Coordenador(a)" and p.is_super_admin is False and user_level(p) == 2
        assert o.is_super_admin is True and user_level(o) == 1
        # depois, alguém muda a posição: a próxima subida não pode desfazer
        p.position = "Pesquisador(a)"
        s.add(p)
        s.commit()

    assert migrate_promoted_admins_to_coordinators(db_engine) == 0
    with Session(db_engine) as s:
        assert s.get(User, promoted.id).position == "Pesquisador(a)"
