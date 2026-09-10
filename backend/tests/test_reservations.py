def _register_equipment(client, equipment_id="re7s"):
    return client.post(
        "/equipment", json={"id": equipment_id, "display_name": "Rock-Eval 7S", "color": "#15216f"}
    )


def test_only_super_admin_registers_equipment(user_a_client):
    r = _register_equipment(user_a_client)
    assert r.status_code == 403


def test_super_admin_registers_and_lists_equipment(super_admin_client):
    r = _register_equipment(super_admin_client)
    assert r.status_code == 200
    assert super_admin_client.get("/equipment").json()[0]["id"] == "re7s"


def test_create_reservation(super_admin_client, user_a_client):
    _register_equipment(super_admin_client)
    r = user_a_client.post(
        "/reservations",
        json={
            "equipment_id": "re7s",
            "title": "Rotina",
            "start_at": "2026-09-10T09:00:00",
            "end_at": "2026-09-10T11:00:00",
        },
    )
    assert r.status_code == 200
    assert r.json()["user_display_name"] == "usuario-a"


def test_reservation_end_before_start_rejected(super_admin_client, user_a_client):
    _register_equipment(super_admin_client)
    r = user_a_client.post(
        "/reservations",
        json={
            "equipment_id": "re7s",
            "start_at": "2026-09-10T11:00:00",
            "end_at": "2026-09-10T09:00:00",
        },
    )
    assert r.status_code == 400


def test_reservation_unknown_equipment_rejected(user_a_client):
    r = user_a_client.post(
        "/reservations",
        json={"equipment_id": "inexistente", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    )
    assert r.status_code == 404


def test_overlapping_reservation_rejected(super_admin_client, user_a_client, user_b_client):
    _register_equipment(super_admin_client)
    user_a_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    )
    # Sobreposição parcial (começa antes do outro terminar)
    r = user_b_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T10:00:00", "end_at": "2026-09-10T12:00:00"},
    )
    assert r.status_code == 409


def test_back_to_back_reservations_do_not_conflict(super_admin_client, user_a_client, user_b_client):
    _register_equipment(super_admin_client)
    user_a_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    )
    # Começa exatamente quando o outro termina — não deve conflitar.
    r = user_b_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T11:00:00", "end_at": "2026-09-10T12:00:00"},
    )
    assert r.status_code == 200


def test_different_equipment_does_not_conflict(super_admin_client, user_a_client):
    _register_equipment(super_admin_client, "re7s")
    _register_equipment(super_admin_client, "leco832")
    user_a_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    )
    r = user_a_client.post(
        "/reservations",
        json={"equipment_id": "leco832", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    )
    assert r.status_code == 200


def test_list_reservations_filtered_by_range(super_admin_client, user_a_client):
    _register_equipment(super_admin_client)
    user_a_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    )
    user_a_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-20T09:00:00", "end_at": "2026-09-20T11:00:00"},
    )
    r = user_a_client.get("/reservations", params={"start": "2026-09-09T00:00:00", "end": "2026-09-11T00:00:00"})
    assert len(r.json()) == 1


def test_owner_can_cancel_reservation(super_admin_client, user_a_client):
    _register_equipment(super_admin_client)
    r = user_a_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    )
    reservation_id = r.json()["id"]
    r2 = user_a_client.delete(f"/reservations/{reservation_id}")
    assert r2.status_code == 200


def test_other_user_cannot_cancel_reservation(super_admin_client, user_a_client, user_b_client):
    _register_equipment(super_admin_client)
    r = user_a_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    )
    reservation_id = r.json()["id"]
    r2 = user_b_client.delete(f"/reservations/{reservation_id}")
    assert r2.status_code == 403


def test_owner_can_move_reservation(super_admin_client, user_a_client):
    _register_equipment(super_admin_client)
    reservation_id = user_a_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    ).json()["id"]

    r = user_a_client.patch(
        f"/reservations/{reservation_id}",
        json={"equipment_id": "re7s", "start_at": "2026-09-11T14:00:00", "end_at": "2026-09-11T16:00:00"},
    )
    assert r.status_code == 200
    assert r.json()["start_at"] == "2026-09-11T14:00:00"


def test_moving_reservation_does_not_conflict_with_itself(super_admin_client, user_a_client):
    """Sem excluir a própria reserva da checagem de conflito, mover um
    bloco (ex. só 30min mais tarde, ainda se sobrepondo ao intervalo
    antigo) sempre falharia "conflitando com si mesma"."""
    _register_equipment(super_admin_client)
    reservation_id = user_a_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    ).json()["id"]

    r = user_a_client.patch(
        f"/reservations/{reservation_id}",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T09:30:00", "end_at": "2026-09-10T11:30:00"},
    )
    assert r.status_code == 200


def test_moving_reservation_still_checks_conflict_with_others(super_admin_client, user_a_client, user_b_client):
    _register_equipment(super_admin_client)
    user_a_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    )
    reservation_b_id = user_b_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T14:00:00", "end_at": "2026-09-10T16:00:00"},
    ).json()["id"]

    r = user_b_client.patch(
        f"/reservations/{reservation_b_id}",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T10:00:00", "end_at": "2026-09-10T12:00:00"},
    )
    assert r.status_code == 409


def test_other_user_cannot_move_reservation(super_admin_client, user_a_client, user_b_client):
    _register_equipment(super_admin_client)
    reservation_id = user_a_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    ).json()["id"]

    r = user_b_client.patch(
        f"/reservations/{reservation_id}",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T14:00:00", "end_at": "2026-09-10T16:00:00"},
    )
    assert r.status_code == 403


def test_move_reservation_to_different_equipment(super_admin_client, user_a_client):
    _register_equipment(super_admin_client, "re7s")
    _register_equipment(super_admin_client, "leco832")
    reservation_id = user_a_client.post(
        "/reservations",
        json={"equipment_id": "re7s", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    ).json()["id"]

    r = user_a_client.patch(
        f"/reservations/{reservation_id}",
        json={"equipment_id": "leco832", "start_at": "2026-09-10T09:00:00", "end_at": "2026-09-10T11:00:00"},
    )
    assert r.status_code == 200
    assert r.json()["equipment_id"] == "leco832"
