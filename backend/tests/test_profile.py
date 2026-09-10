def test_create_user_without_password_gets_setup_code(super_admin_client):
    r = super_admin_client.post("/users", json={"username": "nova", "position": "Pesquisador(a)"})
    assert r.status_code == 200
    body = r.json()
    assert body["setup_code"] is not None
    assert len(body["setup_code"]) == 6


def test_create_user_with_password_has_no_setup_code(super_admin_client):
    r = super_admin_client.post("/users", json={"username": "nova", "password": "senha123"})
    assert r.status_code == 200
    assert r.json()["setup_code"] is None


def test_login_without_password_set_returns_428(super_admin_client, client):
    super_admin_client.post("/users", json={"username": "nova"})
    r = client.post("/auth/login", json={"username": "nova", "password": "qualquer"})
    assert r.status_code == 428


def test_set_password_with_valid_code_logs_in(super_admin_client, client):
    code = super_admin_client.post("/users", json={"username": "nova"}).json()["setup_code"]
    r = client.post(
        "/auth/set-password", json={"username": "nova", "setup_code": code, "new_password": "senhanova123"}
    )
    assert r.status_code == 200
    assert r.json()["username"] == "nova"

    # já logado — o próprio set-password autentica
    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "nova"

    # e a senha nova funciona num login normal depois
    fresh = client.post("/auth/logout")
    assert fresh.status_code == 200
    r2 = client.post("/auth/login", json={"username": "nova", "password": "senhanova123"})
    assert r2.status_code == 200


def test_set_password_with_wrong_code_rejected(super_admin_client, client):
    super_admin_client.post("/users", json={"username": "nova"})
    r = client.post(
        "/auth/set-password", json={"username": "nova", "setup_code": "ZZZZZZ", "new_password": "senhanova123"}
    )
    assert r.status_code == 400


def test_set_password_too_short_rejected(super_admin_client, client):
    code = super_admin_client.post("/users", json={"username": "nova"}).json()["setup_code"]
    r = client.post("/auth/set-password", json={"username": "nova", "setup_code": code, "new_password": "123"})
    assert r.status_code == 400


def test_set_password_cannot_be_reused_once_already_set(super_admin_client, client):
    code = super_admin_client.post("/users", json={"username": "nova"}).json()["setup_code"]
    client.post("/auth/set-password", json={"username": "nova", "setup_code": code, "new_password": "senhanova123"})
    # tentar de novo com o mesmo código, já consumido
    r = client.post(
        "/auth/set-password", json={"username": "nova", "setup_code": code, "new_password": "outrasenha123"}
    )
    assert r.status_code == 400


def test_invalid_position_rejected(super_admin_client):
    r = super_admin_client.post("/users", json={"username": "nova", "position": "Chefe Supremo"})
    assert r.status_code == 422


def test_invalid_qualification_rejected(super_admin_client):
    r = super_admin_client.post("/users", json={"username": "nova", "qualification": "Gênio"})
    assert r.status_code == 422


def test_create_user_with_valid_position_and_qualification(super_admin_client):
    r = super_admin_client.post(
        "/users",
        json={"username": "nova", "password": "senha123", "position": "Técnico(a)", "qualification": "Graduado(a)"},
    )
    assert r.status_code == 200
    assert r.json()["position"] == "Técnico(a)"
    assert r.json()["qualification"] == "Graduado(a)"


def test_admin_can_update_position_and_qualification(super_admin_client, user_a):
    r = super_admin_client.patch(
        f"/users/{user_a.id}", json={"position": "Coordenador(a)", "qualification": "Doutor(a)"}
    )
    assert r.status_code == 200
    assert r.json()["position"] == "Coordenador(a)"
    assert r.json()["qualification"] == "Doutor(a)"


def test_regular_user_cannot_set_own_position(user_a_client):
    # PATCH /auth/me (autoatendimento) nem aceita esses campos — só nome,
    # e-mail, telefone. Tentar mandar não muda nada (campo ignorado).
    r = user_a_client.patch("/auth/me", json={"full_name": "Fulano da Silva Completo"})
    assert r.status_code == 200
    assert r.json()["full_name"] == "Fulano da Silva Completo"
    assert r.json()["position"] == ""


def test_user_updates_own_profile(user_a_client):
    r = user_a_client.patch(
        "/auth/me", json={"full_name": "Ana Paula Souza", "email": "ana@nqtr.ufrj.br", "phone": "(21) 99999-0000"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["full_name"] == "Ana Paula Souza"
    assert body["email"] == "ana@nqtr.ufrj.br"
    assert body["phone"] == "(21) 99999-0000"


def test_upload_and_fetch_photo(user_a_client, user_a):
    fake_jpeg = b"\xff\xd8\xff\xe0fake-jpeg-bytes"
    r = user_a_client.post(
        "/auth/me/photo", files={"file": ("foto.jpg", fake_jpeg, "image/jpeg")}
    )
    assert r.status_code == 200
    assert r.json()["has_photo"] is True

    r2 = user_a_client.get(f"/users/{user_a.id}/photo")
    assert r2.status_code == 200
    assert r2.content == fake_jpeg
    assert r2.headers["content-type"] == "image/jpeg"


def test_upload_photo_rejects_bad_content_type(user_a_client):
    r = user_a_client.post(
        "/auth/me/photo", files={"file": ("arquivo.txt", b"nao e imagem", "text/plain")}
    )
    assert r.status_code == 400


def test_delete_photo(user_a_client, user_a):
    fake_jpeg = b"\xff\xd8\xff\xe0fake-jpeg-bytes"
    user_a_client.post("/auth/me/photo", files={"file": ("foto.jpg", fake_jpeg, "image/jpeg")})
    r = user_a_client.delete("/auth/me/photo")
    assert r.status_code == 200
    assert r.json()["has_photo"] is False
    assert user_a_client.get(f"/users/{user_a.id}/photo").status_code == 404


def test_photo_404_when_never_set(user_a_client, user_b):
    r = user_a_client.get(f"/users/{user_b.id}/photo")
    assert r.status_code == 404


def test_regenerate_setup_code(super_admin_client, user_a):
    r = super_admin_client.post(f"/users/{user_a.id}/regenerate-setup-code")
    assert r.status_code == 200
    assert r.json()["setup_code"] is not None
    # a senha antiga não funciona mais
    r2 = super_admin_client.post("/auth/login", json={"username": "usuario-a", "password": "senha-a"})
    assert r2.status_code == 428


def test_regenerate_setup_code_blocked_for_protected_account(super_admin_client, super_admin_user):
    r = super_admin_client.post(f"/users/{super_admin_user.id}/regenerate-setup-code")
    assert r.status_code == 403


def test_new_user_starts_not_onboarded(super_admin_client):
    r = super_admin_client.post("/users", json={"username": "nova", "password": "senha123"})
    assert r.status_code == 200
    assert r.json()["onboarded"] is False


def test_user_marks_onboarding_done(user_a_client):
    assert user_a_client.get("/auth/me").json()["onboarded"] is False
    r = user_a_client.patch("/auth/me", json={"full_name": "Ana Paula", "onboarded": True})
    assert r.status_code == 200
    assert r.json()["onboarded"] is True
    assert user_a_client.get("/auth/me").json()["onboarded"] is True
