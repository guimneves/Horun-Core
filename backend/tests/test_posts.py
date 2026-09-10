def test_any_user_can_post(user_a_client):
    r = user_a_client.post("/posts", data={"content": "Chegou o novo lote de hélio."})
    assert r.status_code == 200
    assert r.json()["content"] == "Chegou o novo lote de hélio."
    assert r.json()["pinned"] is False


def test_empty_post_rejected(user_a_client):
    r = user_a_client.post("/posts", data={"content": "   "})
    assert r.status_code == 400


def test_list_posts_shows_author_info(user_a_client, user_a):
    user_a_client.post("/posts", data={"content": "Aviso de teste"})
    r = user_a_client.get("/posts")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["author_username"] == "usuario-a"


def test_pinned_posts_come_first(user_a_client, super_admin_client):
    r1 = user_a_client.post("/posts", data={"content": "Post normal"})
    r2 = user_a_client.post("/posts", data={"content": "Post fixado"})
    post_id_2 = r2.json()["id"]

    super_admin_client.patch(f"/posts/{post_id_2}", json={"pinned": True})

    body = user_a_client.get("/posts").json()
    assert body[0]["id"] == post_id_2
    assert body[0]["pinned"] is True


def test_regular_user_cannot_pin(user_a_client):
    r = user_a_client.post("/posts", data={"content": "x"})
    post_id = r.json()["id"]
    r2 = user_a_client.patch(f"/posts/{post_id}", json={"pinned": True})
    assert r2.status_code == 403


def test_author_can_delete_own_post(user_a_client):
    r = user_a_client.post("/posts", data={"content": "x"})
    post_id = r.json()["id"]
    r2 = user_a_client.delete(f"/posts/{post_id}")
    assert r2.status_code == 200
    assert user_a_client.get("/posts").json() == []


def test_other_user_cannot_delete_post(user_a_client, user_b_client):
    r = user_a_client.post("/posts", data={"content": "x"})
    post_id = r.json()["id"]
    r2 = user_b_client.delete(f"/posts/{post_id}")
    assert r2.status_code == 403


def test_super_admin_can_delete_any_post(user_a_client, super_admin_client):
    r = user_a_client.post("/posts", data={"content": "x"})
    post_id = r.json()["id"]
    r2 = super_admin_client.delete(f"/posts/{post_id}")
    assert r2.status_code == 200


def test_new_post_has_no_replies(user_a_client):
    r = user_a_client.post("/posts", data={"content": "x"})
    assert r.json()["replies"] == []


def test_any_user_can_reply(user_a_client, user_b_client):
    post_id = user_a_client.post("/posts", data={"content": "Alguém viu o padrão IFP?"}).json()["id"]
    r = user_b_client.post(f"/posts/{post_id}/replies", json={"content": "Tá na gaveta 3"})
    assert r.status_code == 200
    assert r.json()["author_username"] == "usuario-b"

    body = user_a_client.get("/posts").json()[0]
    assert len(body["replies"]) == 1
    assert body["replies"][0]["content"] == "Tá na gaveta 3"


def test_empty_reply_rejected(user_a_client):
    post_id = user_a_client.post("/posts", data={"content": "x"}).json()["id"]
    r = user_a_client.post(f"/posts/{post_id}/replies", json={"content": "  "})
    assert r.status_code == 400


def test_reply_to_missing_post_404(user_a_client):
    r = user_a_client.post("/posts/999/replies", json={"content": "x"})
    assert r.status_code == 404


def test_replies_ordered_oldest_first(user_a_client):
    post_id = user_a_client.post("/posts", data={"content": "x"}).json()["id"]
    user_a_client.post(f"/posts/{post_id}/replies", json={"content": "primeira"})
    user_a_client.post(f"/posts/{post_id}/replies", json={"content": "segunda"})
    replies = user_a_client.get("/posts").json()[0]["replies"]
    assert [r["content"] for r in replies] == ["primeira", "segunda"]


def test_author_can_delete_own_reply(user_a_client):
    post_id = user_a_client.post("/posts", data={"content": "x"}).json()["id"]
    reply_id = user_a_client.post(f"/posts/{post_id}/replies", json={"content": "y"}).json()["id"]
    r = user_a_client.delete(f"/posts/{post_id}/replies/{reply_id}")
    assert r.status_code == 200
    assert user_a_client.get("/posts").json()[0]["replies"] == []


def test_other_user_cannot_delete_reply(user_a_client, user_b_client):
    post_id = user_a_client.post("/posts", data={"content": "x"}).json()["id"]
    reply_id = user_a_client.post(f"/posts/{post_id}/replies", json={"content": "y"}).json()["id"]
    r = user_b_client.delete(f"/posts/{post_id}/replies/{reply_id}")
    assert r.status_code == 403


def test_deleting_post_cascades_replies(user_a_client, super_admin_client):
    post_id = user_a_client.post("/posts", data={"content": "x"}).json()["id"]
    user_a_client.post(f"/posts/{post_id}/replies", json={"content": "y"})
    r = super_admin_client.delete(f"/posts/{post_id}")
    assert r.status_code == 200
    # Se a resposta órfã tivesse sobrado no banco, criar um post novo com o
    # mesmo id (SQLite reusa ids em alguns casos) poderia "herdar" respostas
    # antigas — a lista vazia confirma que não sobrou nada.
    assert user_a_client.get("/posts").json() == []


def test_mentionable_users_lists_everyone_not_just_admin_view(user_a_client, user_b, super_admin_user):
    r = user_a_client.get("/users/mentionable")
    assert r.status_code == 200
    usernames = {u["username"] for u in r.json()}
    assert {"usuario-a", "usuario-b", "superadmin"} <= usernames
    # Campos mínimos só (sem papel/status) — diferente de GET /users.
    assert set(r.json()[0].keys()) == {"id", "username", "display_name"}


_FAKE_PNG = b"\x89PNG\r\n\x1a\nfake-png-bytes"


def test_post_without_attachment_has_flags_false(user_a_client):
    body = user_a_client.post("/posts", data={"content": "sem anexo"}).json()
    assert body["has_attachment"] is False
    assert body["attachment_filename"] == ""


def test_post_with_attachment(user_a_client):
    r = user_a_client.post(
        "/posts",
        data={"content": "com foto do resultado"},
        files={"file": ("resultado.png", _FAKE_PNG, "image/png")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["has_attachment"] is True
    assert body["attachment_filename"] == "resultado.png"
    assert body["attachment_content_type"] == "image/png"

    att = user_a_client.get(f"/posts/{body['id']}/attachment")
    assert att.status_code == 200
    assert att.content == _FAKE_PNG
    assert att.headers["content-type"] == "image/png"


def test_attachment_rejects_unsupported_type(user_a_client):
    r = user_a_client.post(
        "/posts",
        data={"content": "x"},
        files={"file": ("virus.exe", b"MZ...", "application/x-msdownload")},
    )
    assert r.status_code == 400


def test_attachment_404_when_post_has_none(user_a_client):
    post_id = user_a_client.post("/posts", data={"content": "sem anexo"}).json()["id"]
    assert user_a_client.get(f"/posts/{post_id}/attachment").status_code == 404


def test_attachment_requires_auth(client, user_a_client):
    post_id = user_a_client.post(
        "/posts", data={"content": "x"}, files={"file": ("a.png", _FAKE_PNG, "image/png")}
    ).json()["id"]
    assert client.get(f"/posts/{post_id}/attachment").status_code == 401
