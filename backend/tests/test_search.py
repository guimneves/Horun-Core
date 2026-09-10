def test_search_requires_auth(client):
    assert client.get("/search?q=forno").status_code == 401


def test_short_query_returns_empty(user_a_client):
    assert user_a_client.get("/search?q=a").json() == []


def test_search_finds_posts(user_a_client):
    user_a_client.post("/posts", data={"content": "Manutenção do forno na sexta"})
    hits = user_a_client.get("/search?q=forno").json()
    assert any(h["kind"] == "post" and "forno" in h["title"].lower() for h in hits)


def test_search_finds_equipment(super_admin_client, user_a_client):
    super_admin_client.post("/equipment", json={"id": "leco832", "display_name": "LECO 832", "color": "#111111"})
    hits = user_a_client.get("/search?q=leco").json()
    assert any(h["kind"] == "equipment" and h["title"] == "LECO 832" and h["link"] == "/agenda" for h in hits)


def test_search_finds_modules(super_admin_client, user_a_client):
    super_admin_client.post(
        "/modules",
        json={
            "id": "re7s",
            "display_name": "RE7S",
            "description": "Rock-Eval",
            "internal_base_url": "http://re7s-backend:8000",
        },
    )
    hits = user_a_client.get("/search?q=rock").json()
    assert any(h["kind"] == "module" for h in hits)


def test_search_finds_people_by_name_and_position(super_admin_client, user_a, user_a_client, user_b_client):
    user_a_client.patch("/auth/me", json={"full_name": "Ana Paula Souza"})
    super_admin_client.patch(f"/users/{user_a.id}", json={"position": "Coordenador(a)"})

    by_name = user_b_client.get("/search?q=ana paula").json()
    assert any(h["kind"] == "person" and h["title"] == "Ana Paula Souza" for h in by_name)

    by_position = user_b_client.get("/search?q=coorden").json()
    assert any(h["kind"] == "person" for h in by_position)


def test_search_person_hit_has_no_private_data(super_admin_client, user_a, user_a_client, user_b_client):
    user_a_client.patch("/auth/me", json={"full_name": "Ana", "phone": "(21) 99999-0000"})
    hits = user_b_client.get("/search?q=ana").json()
    person = next(h for h in hits if h["kind"] == "person")
    assert "99999" not in str(person)
