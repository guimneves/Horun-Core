def _mk_group(client, admin_id, name="Cromatografia"):
    return client.post("/groups", json={"name": name, "internal_admin_id": admin_id})


def test_only_super_admin_creates_group(user_a_client, super_admin_user):
    r = user_a_client.post("/groups", json={"name": "X", "internal_admin_id": super_admin_user.id})
    assert r.status_code == 403


def test_internal_admin_must_be_super_admin(super_admin_client, user_a):
    r = super_admin_client.post("/groups", json={"name": "X", "internal_admin_id": user_a.id})
    assert r.status_code == 400


def test_create_group_adds_internal_admin_as_member(super_admin_client, super_admin_user):
    r = _mk_group(super_admin_client, super_admin_user.id)
    assert r.status_code == 200
    body = r.json()
    assert body["member_count"] == 1
    assert body["is_member"] is True
    assert body["internal_admin_name"]


def test_regular_user_only_sees_own_groups(super_admin_client, super_admin_user, admin2, admin2_client, user_a, user_a_client):
    g1 = _mk_group(super_admin_client, super_admin_user.id, "Grupo 1").json()
    g2 = _mk_group(super_admin_client, admin2.id, "Grupo 2").json()
    super_admin_client.post(f"/groups/{g1['id']}/members", json={"user_id": user_a.id})

    seen = {g["name"] for g in user_a_client.get("/groups").json()}
    assert seen == {"Grupo 1"}

    # admin2 vê o grupo que administra mesmo sem ter sido adicionado por fora
    assert {g["name"] for g in admin2_client.get("/groups").json()} >= {"Grupo 2"}

    # super-admin vê todos
    assert {g["name"] for g in super_admin_client.get("/groups").json()} >= {"Grupo 1", "Grupo 2"}


def test_internal_admin_manages_members(super_admin_client, admin2, admin2_client, user_a, user_b):
    g = _mk_group(super_admin_client, admin2.id).json()
    assert admin2_client.post(f"/groups/{g['id']}/members", json={"user_id": user_a.id}).status_code == 200
    assert admin2_client.post(f"/groups/{g['id']}/members", json={"user_id": user_b.id}).status_code == 200
    members = {m["name"] for m in admin2_client.get(f"/groups/{g['id']}/members").json()}
    assert "usuario-a" in members and "usuario-b" in members

    assert admin2_client.request("DELETE", f"/groups/{g['id']}/members/{user_a.id}").status_code == 200
    members2 = {m["name"] for m in admin2_client.get(f"/groups/{g['id']}/members").json()}
    assert "usuario-a" not in members2


def test_non_manager_cannot_add_members(super_admin_client, super_admin_user, user_a, user_a_client, user_b):
    g = _mk_group(super_admin_client, super_admin_user.id).json()
    super_admin_client.post(f"/groups/{g['id']}/members", json={"user_id": user_a.id})
    r = user_a_client.post(f"/groups/{g['id']}/members", json={"user_id": user_b.id})
    assert r.status_code == 403


def test_cannot_remove_internal_admin(super_admin_client, super_admin_user):
    g = _mk_group(super_admin_client, super_admin_user.id).json()
    r = super_admin_client.request("DELETE", f"/groups/{g['id']}/members/{super_admin_user.id}")
    assert r.status_code == 400


def test_non_member_cannot_list_members(super_admin_client, super_admin_user, user_a_client):
    g = _mk_group(super_admin_client, super_admin_user.id).json()
    assert user_a_client.get(f"/groups/{g['id']}/members").status_code == 403


def test_delete_group_removes_it(super_admin_client, super_admin_user):
    g = _mk_group(super_admin_client, super_admin_user.id).json()
    assert super_admin_client.delete(f"/groups/{g['id']}").status_code == 200
    assert super_admin_client.get("/groups").json() == []


def test_change_internal_admin(super_admin_client, super_admin_user, admin2):
    g = _mk_group(super_admin_client, super_admin_user.id).json()
    r = super_admin_client.patch(f"/groups/{g['id']}", json={"internal_admin_id": admin2.id})
    assert r.status_code == 200
    assert r.json()["internal_admin_id"] == admin2.id
    # o novo admin interno entra como membro
    members = {m["user_id"] for m in super_admin_client.get(f"/groups/{g['id']}/members").json()}
    assert admin2.id in members
