def test_login_wrong_password_fails(client, user_a):
    r = client.post("/auth/login", json={"username": "usuario-a", "password": "errada"})
    assert r.status_code == 401


def test_login_sets_cookie_and_me_works(client, user_a):
    r = client.post("/auth/login", json={"username": "usuario-a", "password": "senha-a"})
    assert r.status_code == 200
    assert r.cookies.get("horun_core_session")

    r2 = client.get("/auth/me")
    assert r2.status_code == 200
    assert r2.json()["username"] == "usuario-a"
    assert r2.json()["is_super_admin"] is False


def test_me_without_login_is_401(client):
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_logout_clears_session(client, user_a):
    client.post("/auth/login", json={"username": "usuario-a", "password": "senha-a"})
    assert client.get("/auth/me").status_code == 200

    client.post("/auth/logout")
    assert client.get("/auth/me").status_code == 401


def test_only_super_admin_can_create_users(user_a_client):
    r = user_a_client.post("/users", json={"username": "novo", "password": "senha-nova"})
    assert r.status_code == 403


def test_super_admin_can_create_and_list_users(super_admin_client):
    r = super_admin_client.post("/users", json={"username": "novo", "password": "senha-nova"})
    assert r.status_code == 200
    assert r.json()["is_super_admin"] is False

    r2 = super_admin_client.get("/users")
    assert r2.status_code == 200
    usernames = {u["username"] for u in r2.json()}
    assert {"superadmin", "novo"} <= usernames


def test_duplicate_username_conflicts(super_admin_client):
    super_admin_client.post("/users", json={"username": "dup", "password": "x"})
    r = super_admin_client.post("/users", json={"username": "dup", "password": "y"})
    assert r.status_code == 409


def test_protected_account_cannot_be_deleted_or_modified(super_admin_client, super_admin_user):
    r = super_admin_client.delete(f"/users/{super_admin_user.id}")
    assert r.status_code in (400, 403)  # 400 se for a própria conta, 403 se protegida — aqui é as duas coisas

    r2 = super_admin_client.patch(f"/users/{super_admin_user.id}", json={"display_name": "Novo Nome"})
    assert r2.status_code == 403
