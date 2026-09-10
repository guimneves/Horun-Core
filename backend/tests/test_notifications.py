def _count(client):
    return client.get("/notifications/unread-count").json()["count"]


def test_mention_in_post_notifies_mentioned_user(user_a_client, user_b_client):
    user_a_client.post("/posts", data={"content": "@usuario-b confere o forno por favor"})
    rows = user_b_client.get("/notifications").json()
    assert len(rows) == 1
    assert rows[0]["kind"] == "mention"
    assert "mencionou" in rows[0]["text"]
    assert rows[0]["read"] is False


def test_author_is_not_notified_of_own_post(user_a_client):
    user_a_client.post("/posts", data={"content": "@usuario-a lembrete pra mim mesmo"})
    assert user_a_client.get("/notifications").json() == []


def test_reply_notifies_post_author(user_a_client, user_b_client):
    post_id = user_a_client.post("/posts", data={"content": "Alguém viu a pipeta?"}).json()["id"]
    user_b_client.post(f"/posts/{post_id}/replies", json={"content": "Tá na bancada 3"})
    rows = user_a_client.get("/notifications").json()
    assert len(rows) == 1
    assert rows[0]["kind"] == "reply"
    assert "respondeu" in rows[0]["text"]


def test_author_replying_to_own_post_notifies_nobody(user_a_client):
    post_id = user_a_client.post("/posts", data={"content": "x"}).json()["id"]
    user_a_client.post(f"/posts/{post_id}/replies", json={"content": "eu mesmo respondendo"})
    assert user_a_client.get("/notifications").json() == []


def test_mention_in_reply_notifies_mentioned_user(user_a_client, user_b_client, super_admin_client):
    post_id = user_a_client.post("/posts", data={"content": "aviso"}).json()["id"]
    super_admin_client.post(f"/posts/{post_id}/replies", json={"content": "@usuario-b dá uma olhada"})
    rows = user_b_client.get("/notifications").json()
    assert len(rows) == 1
    assert rows[0]["kind"] == "mention"
    assert "numa resposta" in rows[0]["text"]


def test_reply_with_mention_of_post_author_is_single_notification(user_a_client, user_b_client):
    post_id = user_a_client.post("/posts", data={"content": "aviso"}).json()["id"]
    user_b_client.post(f"/posts/{post_id}/replies", json={"content": "@usuario-a respondi e marquei"})
    rows = user_a_client.get("/notifications").json()
    assert len(rows) == 1
    # menção vence "reply"
    assert rows[0]["kind"] == "mention"


def test_unknown_mention_does_not_crash_or_notify(user_a_client):
    r = user_a_client.post("/posts", data={"content": "@ninguem-existe olá"})
    assert r.status_code == 200
    assert _count(user_a_client) == 0


def test_notifications_are_per_user(user_a_client, user_b_client):
    user_a_client.post("/posts", data={"content": "@usuario-b aviso"})
    assert len(user_b_client.get("/notifications").json()) == 1
    assert user_a_client.get("/notifications").json() == []


def test_unread_count_and_mark_read(user_a_client, user_b_client):
    post_id = user_a_client.post("/posts", data={"content": "aviso"}).json()["id"]
    user_a_client.post(f"/posts/{post_id}/replies", json={"content": "@usuario-b e @usuario-b de novo"})
    # duas menções ao mesmo usuário no mesmo texto → uma notificação só
    assert _count(user_b_client) == 1

    user_b_client.post("/notifications/mark-read")
    assert _count(user_b_client) == 0
    # a notificação continua na lista, só marcada como lida
    rows = user_b_client.get("/notifications").json()
    assert len(rows) == 1
    assert rows[0]["read"] is True


def test_notifications_require_auth(client):
    assert client.get("/notifications").status_code == 401
    assert client.get("/notifications/unread-count").status_code == 401
    assert client.post("/notifications/mark-read").status_code == 401
