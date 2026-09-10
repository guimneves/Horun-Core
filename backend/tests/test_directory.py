def _find(rows, name):
    return next(r for r in rows if r["name"] == name)


def test_any_authenticated_user_sees_directory(user_a_client):
    r = user_a_client.get("/users/directory")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_directory_requires_auth(client):
    assert client.get("/users/directory").status_code == 401


def test_directory_shows_public_fields(super_admin_client, user_a, user_a_client):
    super_admin_client.patch(
        f"/users/{user_a.id}", json={"position": "Técnico(a)", "qualification": "Graduado(a)"}
    )
    user_a_client.patch("/auth/me", json={"full_name": "Ana Paula", "email": "ana@nqtr.br", "phone": "(21) 1"})

    rows = user_a_client.get("/users/directory").json()
    ana = _find(rows, "Ana Paula")
    assert ana["position"] == "Técnico(a)"
    assert ana["qualification"] == "Graduado(a)"
    assert ana["email"] == "ana@nqtr.br"


def test_phone_hidden_from_regular_users_visible_to_admin(super_admin_client, user_a, user_a_client, user_b_client):
    user_a_client.patch("/auth/me", json={"full_name": "Ana Paula", "phone": "(21) 99999-0000"})

    # colega comum: sem telefone
    as_peer = _find(user_b_client.get("/users/directory").json(), "Ana Paula")
    assert as_peer["phone"] == ""

    # administrador máximo: com telefone
    as_admin = _find(super_admin_client.get("/users/directory").json(), "Ana Paula")
    assert as_admin["phone"] == "(21) 99999-0000"


def test_name_falls_back_to_display_name_then_username(user_a_client, user_b):
    # user_b nunca preencheu full_name — cai pro display_name ("usuario-b")
    rows = user_a_client.get("/users/directory").json()
    assert any(r["name"] == "usuario-b" for r in rows)


def test_directory_does_not_expose_username_or_admin_flags(user_a_client):
    rows = user_a_client.get("/users/directory").json()
    assert rows, "diretório vazio"
    for r in rows:
        assert "username" not in r
        assert "is_super_admin" not in r
        assert "setup_code" not in r
