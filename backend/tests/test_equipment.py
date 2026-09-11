def test_list_equipment_empty(user_a_client):
    r = user_a_client.get("/equipment")
    assert r.status_code == 200
    assert r.json() == []


def test_create_equipment_requires_super_admin(user_a_client):
    r = user_a_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    assert r.status_code == 403


def test_create_and_list_equipment(super_admin_client):
    r = super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S", "color": "#112233"})
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "re7s"
    assert body["description"] == ""
    assert body["has_photo"] is False

    r2 = super_admin_client.get("/equipment")
    assert len(r2.json()) == 1


def test_create_equipment_duplicate_id_conflicts(super_admin_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    r = super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "Outro"})
    assert r.status_code == 409


def test_create_equipment_rejects_unknown_area(super_admin_client):
    r = super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S", "area_id": 999})
    assert r.status_code == 400


def test_create_equipment_rejects_unknown_module(super_admin_client):
    r = super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S", "module_id": "nao-existe"})
    assert r.status_code == 400


def test_update_equipment_fields(super_admin_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    r = super_admin_client.patch(
        "/equipment/re7s",
        json={"description": "Pirólise/oxidação programável.", "anydesk_id": "123456789", "pop_folder_path": r"\\nqtrmaster\POPs\RE7S"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["description"] == "Pirólise/oxidação programável."
    assert body["anydesk_id"] == "123456789"
    assert body["pop_folder_path"] == r"\\nqtrmaster\POPs\RE7S"


def test_update_equipment_requires_super_admin(user_a_client, super_admin_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    r = user_a_client.patch("/equipment/re7s", json={"description": "hackeando"})
    assert r.status_code == 403


def test_update_equipment_not_found(super_admin_client):
    r = super_admin_client.patch("/equipment/nao-existe", json={"description": "x"})
    assert r.status_code == 404


def test_link_and_unlink_module(super_admin_client):
    super_admin_client.post(
        "/modules",
        json={"id": "leco", "display_name": "Leco", "internal_base_url": "http://leco-backend:8000"},
    )
    super_admin_client.post("/equipment", json={"id": "leco832", "display_name": "LECO 832"})

    r = super_admin_client.patch("/equipment/leco832", json={"module_id": "leco"})
    assert r.status_code == 200
    assert r.json()["module_id"] == "leco"

    r2 = super_admin_client.patch("/equipment/leco832", json={"clear_module": True})
    assert r2.status_code == 200
    assert r2.json()["module_id"] is None


def test_delete_equipment(super_admin_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    r = super_admin_client.delete("/equipment/re7s")
    assert r.status_code == 200
    assert super_admin_client.get("/equipment").json() == []


# --- Áreas ----------------------------------------------------------------


def test_create_area_requires_super_admin(user_a_client):
    r = user_a_client.post("/equipment-areas", json={"name": "Cromatografia"})
    assert r.status_code == 403


def test_create_list_update_delete_area(super_admin_client):
    r = super_admin_client.post("/equipment-areas", json={"name": "Cromatografia"})
    assert r.status_code == 200
    area_id = r.json()["id"]

    r2 = super_admin_client.get("/equipment-areas")
    assert [a["name"] for a in r2.json()] == ["Cromatografia"]

    r3 = super_admin_client.patch(f"/equipment-areas/{area_id}", json={"name": "Sala de Cromatografia"})
    assert r3.status_code == 200
    assert r3.json()["name"] == "Sala de Cromatografia"

    r4 = super_admin_client.delete(f"/equipment-areas/{area_id}")
    assert r4.status_code == 200
    assert super_admin_client.get("/equipment-areas").json() == []


def test_deleting_area_clears_it_from_equipment(super_admin_client):
    area = super_admin_client.post("/equipment-areas", json={"name": "Cromatografia"}).json()
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S", "area_id": area["id"]})

    super_admin_client.delete(f"/equipment-areas/{area['id']}")

    eq = super_admin_client.get("/equipment").json()[0]
    assert eq["area_id"] is None


# --- Foto -------------------------------------------------------------------


def test_upload_and_fetch_equipment_photo(super_admin_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    fake_jpeg = b"\xff\xd8\xff\xe0fake-jpeg-bytes"

    r = super_admin_client.post("/equipment/re7s/photo", files={"file": ("foto.jpg", fake_jpeg, "image/jpeg")})
    assert r.status_code == 200
    assert r.json()["has_photo"] is True

    r2 = super_admin_client.get("/equipment/re7s/photo")
    assert r2.status_code == 200
    assert r2.content == fake_jpeg


def test_upload_equipment_photo_requires_super_admin(user_a_client, super_admin_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    r = user_a_client.post(
        "/equipment/re7s/photo", files={"file": ("foto.jpg", b"\xff\xd8\xff\xe0abc", "image/jpeg")}
    )
    assert r.status_code == 403


def test_delete_equipment_photo(super_admin_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    super_admin_client.post(
        "/equipment/re7s/photo", files={"file": ("foto.jpg", b"\xff\xd8\xff\xe0abc", "image/jpeg")}
    )
    r = super_admin_client.delete("/equipment/re7s/photo")
    assert r.status_code == 200
    assert r.json()["has_photo"] is False
    assert super_admin_client.get("/equipment/re7s/photo").status_code == 404


def test_equipment_photo_404_when_never_set(super_admin_client, user_a_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    assert user_a_client.get("/equipment/re7s/photo").status_code == 404


# --- Registro de uso (RUE, Fase B) -----------------------------------------


def test_any_user_can_log_and_list_usage(super_admin_client, user_a_client, user_a):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    r = user_a_client.post("/equipment/re7s/logs", json={"description": "Rodada de pirólise, amostras 1-10"})
    assert r.status_code == 200
    body = r.json()
    assert body["description"] == "Rodada de pirólise, amostras 1-10"
    assert body["user_id"] == user_a.id

    r2 = user_a_client.get("/equipment/re7s/logs")
    assert len(r2.json()) == 1


def test_log_requires_equipment_to_exist(user_a_client):
    r = user_a_client.post("/equipment/nao-existe/logs", json={"description": "x"})
    assert r.status_code == 404


def test_log_rejects_blank_description(super_admin_client, user_a_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    r = user_a_client.post("/equipment/re7s/logs", json={"description": "   "})
    assert r.status_code == 400


def test_author_can_edit_own_log(super_admin_client, user_a_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    log = user_a_client.post("/equipment/re7s/logs", json={"description": "primeira versão"}).json()
    r = user_a_client.patch(f"/equipment/re7s/logs/{log['id']}", json={"description": "corrigido"})
    assert r.status_code == 200
    assert r.json()["description"] == "corrigido"


def test_other_user_cannot_edit_log(super_admin_client, user_a_client, user_b_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    log = user_a_client.post("/equipment/re7s/logs", json={"description": "x"}).json()
    r = user_b_client.patch(f"/equipment/re7s/logs/{log['id']}", json={"description": "hackeado"})
    assert r.status_code == 403


def test_admin_can_edit_and_delete_others_log(super_admin_client, user_a_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    log = user_a_client.post("/equipment/re7s/logs", json={"description": "x"}).json()

    r = super_admin_client.patch(f"/equipment/re7s/logs/{log['id']}", json={"description": "revisado pelo admin"})
    assert r.status_code == 200

    r2 = super_admin_client.delete(f"/equipment/re7s/logs/{log['id']}")
    assert r2.status_code == 200
    assert super_admin_client.get("/equipment/re7s/logs").json() == []


def test_author_can_delete_own_log(super_admin_client, user_a_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    log = user_a_client.post("/equipment/re7s/logs", json={"description": "x"}).json()
    r = user_a_client.delete(f"/equipment/re7s/logs/{log['id']}")
    assert r.status_code == 200


def test_other_user_cannot_delete_log(super_admin_client, user_a_client, user_b_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    log = user_a_client.post("/equipment/re7s/logs", json={"description": "x"}).json()
    r = user_b_client.delete(f"/equipment/re7s/logs/{log['id']}")
    assert r.status_code == 403


def test_logs_ordered_most_recent_first(super_admin_client, user_a_client):
    super_admin_client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    user_a_client.post("/equipment/re7s/logs", json={"description": "primeiro", "occurred_at": "2026-01-01T10:00:00"})
    user_a_client.post("/equipment/re7s/logs", json={"description": "segundo", "occurred_at": "2026-02-01T10:00:00"})
    r = user_a_client.get("/equipment/re7s/logs")
    assert [entry["description"] for entry in r.json()] == ["segundo", "primeiro"]
