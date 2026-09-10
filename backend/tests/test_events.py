def test_admin_creates_event(super_admin_client):
    r = super_admin_client.post(
        "/events",
        json={
            "title": "Reunião geral do NQTR",
            "location": "Sala 512",
            "start_at": "2026-10-01T14:00:00",
            "end_at": "2026-10-01T15:30:00",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Reunião geral do NQTR"
    assert body["all_day"] is False
    assert body["created_by_name"]


def test_regular_user_cannot_create_event(user_a_client):
    r = user_a_client.post(
        "/events",
        json={"title": "x", "start_at": "2026-10-01T14:00:00", "end_at": "2026-10-01T15:00:00"},
    )
    assert r.status_code == 403


def test_everyone_can_list_events(super_admin_client, user_a_client):
    super_admin_client.post(
        "/events",
        json={"title": "Seminário", "start_at": "2026-10-02T10:00:00", "end_at": "2026-10-02T11:00:00"},
    )
    r = user_a_client.get("/events")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_events_filtered_by_range(super_admin_client):
    super_admin_client.post(
        "/events",
        json={"title": "Em outubro", "start_at": "2026-10-10T10:00:00", "end_at": "2026-10-10T11:00:00"},
    )
    super_admin_client.post(
        "/events",
        json={"title": "Em dezembro", "start_at": "2026-12-10T10:00:00", "end_at": "2026-12-10T11:00:00"},
    )
    r = super_admin_client.get("/events?start=2026-10-01T00:00:00&end=2026-11-01T00:00:00")
    titles = [e["title"] for e in r.json()]
    assert titles == ["Em outubro"]


def test_empty_title_rejected(super_admin_client):
    r = super_admin_client.post(
        "/events",
        json={"title": "  ", "start_at": "2026-10-01T14:00:00", "end_at": "2026-10-01T15:00:00"},
    )
    assert r.status_code == 400


def test_end_before_start_rejected(super_admin_client):
    r = super_admin_client.post(
        "/events",
        json={"title": "x", "start_at": "2026-10-01T15:00:00", "end_at": "2026-10-01T14:00:00"},
    )
    assert r.status_code == 400


def test_all_day_event(super_admin_client):
    r = super_admin_client.post(
        "/events",
        json={
            "title": "Feriado",
            "all_day": True,
            "start_at": "2026-11-15T00:00:00",
            "end_at": "2026-11-15T00:00:00",
        },
    )
    assert r.status_code == 200
    assert r.json()["all_day"] is True


def test_admin_edits_and_deletes_event(super_admin_client, user_a_client):
    eid = super_admin_client.post(
        "/events",
        json={"title": "Rascunho", "start_at": "2026-10-01T14:00:00", "end_at": "2026-10-01T15:00:00"},
    ).json()["id"]

    r = super_admin_client.patch(
        f"/events/{eid}",
        json={"title": "Definitivo", "start_at": "2026-10-01T14:00:00", "end_at": "2026-10-01T16:00:00"},
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Definitivo"

    assert user_a_client.delete(f"/events/{eid}").status_code == 403
    assert super_admin_client.delete(f"/events/{eid}").status_code == 200
    assert super_admin_client.get("/events").json() == []
