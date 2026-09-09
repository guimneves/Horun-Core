def test_any_user_can_post(user_a_client):
    r = user_a_client.post("/posts", json={"content": "Chegou o novo lote de hélio."})
    assert r.status_code == 200
    assert r.json()["content"] == "Chegou o novo lote de hélio."
    assert r.json()["pinned"] is False


def test_empty_post_rejected(user_a_client):
    r = user_a_client.post("/posts", json={"content": "   "})
    assert r.status_code == 400


def test_list_posts_shows_author_info(user_a_client, user_a):
    user_a_client.post("/posts", json={"content": "Aviso de teste"})
    r = user_a_client.get("/posts")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["author_username"] == "usuario-a"


def test_pinned_posts_come_first(user_a_client, super_admin_client):
    r1 = user_a_client.post("/posts", json={"content": "Post normal"})
    r2 = user_a_client.post("/posts", json={"content": "Post fixado"})
    post_id_2 = r2.json()["id"]

    super_admin_client.patch(f"/posts/{post_id_2}", json={"pinned": True})

    body = user_a_client.get("/posts").json()
    assert body[0]["id"] == post_id_2
    assert body[0]["pinned"] is True


def test_regular_user_cannot_pin(user_a_client):
    r = user_a_client.post("/posts", json={"content": "x"})
    post_id = r.json()["id"]
    r2 = user_a_client.patch(f"/posts/{post_id}", json={"pinned": True})
    assert r2.status_code == 403


def test_author_can_delete_own_post(user_a_client):
    r = user_a_client.post("/posts", json={"content": "x"})
    post_id = r.json()["id"]
    r2 = user_a_client.delete(f"/posts/{post_id}")
    assert r2.status_code == 200
    assert user_a_client.get("/posts").json() == []


def test_other_user_cannot_delete_post(user_a_client, user_b_client):
    r = user_a_client.post("/posts", json={"content": "x"})
    post_id = r.json()["id"]
    r2 = user_b_client.delete(f"/posts/{post_id}")
    assert r2.status_code == 403


def test_super_admin_can_delete_any_post(user_a_client, super_admin_client):
    r = user_a_client.post("/posts", json={"content": "x"})
    post_id = r.json()["id"]
    r2 = super_admin_client.delete(f"/posts/{post_id}")
    assert r2.status_code == 200
