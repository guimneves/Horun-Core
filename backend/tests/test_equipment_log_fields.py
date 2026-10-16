"""Colunas próprias da ficha RUE de cada equipamento (pedido do usuário,
16/10/2026): técnicos e pesquisadores doutores criam colunas com o tipo de
preenchimento de cada equipamento; os registros guardam os valores."""

from sqlmodel import Session

from app.db.models import User


def _set(db_engine, user_id, **fields):
    with Session(db_engine) as s:
        u = s.get(User, user_id)
        for k, v in fields.items():
            setattr(u, k, v)
        s.add(u)
        s.commit()


def _equipment(client):
    r = client.post("/equipment", json={"id": "re7s", "display_name": "RE7S"})
    assert r.status_code == 200, r.text


def test_who_can_manage_log_fields(super_admin_client, user_a_client, user_a, db_engine):
    _equipment(super_admin_client)
    col = {"label": "Método", "kind": "select", "options": ["Bulk Rock", "Reservoir"]}
    # IC / sem posição: não
    assert user_a_client.post("/equipment/re7s/log-fields", json=col).status_code == 403
    # pesquisador sem doutorado: não
    _set(db_engine, user_a.id, position="Pesquisador(a)", qualification="Mestre(a)")
    assert user_a_client.post("/equipment/re7s/log-fields", json=col).status_code == 403
    assert user_a_client.get("/auth/me").json()["can"]["manage_log_fields"] is False
    # pesquisador doutor: sim
    _set(db_engine, user_a.id, qualification="Doutor(a)")
    r = user_a_client.post("/equipment/re7s/log-fields", json=col)
    assert r.status_code == 200, r.text
    assert user_a_client.get("/auth/me").json()["can"]["manage_log_fields"] is True
    # técnico (qualquer titulação): sim
    _set(db_engine, user_a.id, position="Técnico(a)", qualification="Graduado(a)")
    assert user_a_client.post("/equipment/re7s/log-fields", json={"label": "Nº carrossel", "kind": "number"}).status_code == 200


def test_fields_validate_and_fill_logs(super_admin_client, user_a_client):
    _equipment(super_admin_client)
    mk = lambda **b: super_admin_client.post("/equipment/re7s/log-fields", json=b)  # noqa: E731
    assert mk(label="Lista vazia", kind="select").status_code == 400
    assert mk(label="x", kind="cor").status_code == 400
    method = mk(label="Método", kind="select", options=["Bulk Rock", "Reservoir", "Bulk Rock"], required=True).json()
    assert method["options"] == ["Bulk Rock", "Reservoir"]
    mass = mk(label="Massa", kind="number", unit="mg").json()
    ok = mk(label="Padrão OK", kind="checkbox").json()
    assert mk(label="método", kind="text").status_code == 409  # mesmo nome

    fields = user_a_client.get("/equipment/re7s/log-fields").json()
    assert [f["label"] for f in fields] == ["Método", "Massa", "Padrão OK"]

    # obrigatória
    r = user_a_client.post("/equipment/re7s/logs", json={"extra": {}})
    assert r.status_code == 400 and "Método" in r.json()["detail"]
    # opção fora da lista / número inválido
    assert user_a_client.post("/equipment/re7s/logs", json={"extra": {str(method["id"]): "Outro"}}).status_code == 400
    bad = {str(method["id"]): "Bulk Rock", str(mass["id"]): "abc"}
    assert user_a_client.post("/equipment/re7s/logs", json={"extra": bad}).status_code == 400

    good = {str(method["id"]): "Bulk Rock", str(mass["id"]): "60,5", str(ok["id"]): True, "999": "ignorado"}
    log = user_a_client.post("/equipment/re7s/logs", json={"extra": good}).json()
    assert log["extra"] == {str(method["id"]): "Bulk Rock", str(mass["id"]): 60.5, str(ok["id"]): True}

    # editar só uma coluna mantém as outras; vazio apaga
    r = user_a_client.patch(f"/equipment/re7s/logs/{log['id']}", json={"extra": {str(mass["id"]): ""}})
    assert r.status_code == 200, r.text
    assert r.json()["extra"] == {str(method["id"]): "Bulk Rock", str(ok["id"]): True}

    # arquivar some da lista, mas o valor fica guardado e volta ao reativar
    assert super_admin_client.delete(f"/equipment/re7s/log-fields/{method['id']}").status_code == 200
    assert [f["label"] for f in user_a_client.get("/equipment/re7s/log-fields").json()] == ["Massa", "Padrão OK"]
    log2 = user_a_client.post("/equipment/re7s/logs", json={}).json()  # obrigatória arquivada não cobra
    assert log2["extra"] == {}
    super_admin_client.patch(f"/equipment/re7s/log-fields/{method['id']}", json={"active": True})
    logs = {x["id"]: x for x in user_a_client.get("/equipment/re7s/logs").json()}
    assert logs[log["id"]]["extra"][str(method["id"])] == "Bulk Rock"


def test_reorder_and_rename(super_admin_client):
    _equipment(super_admin_client)
    a = super_admin_client.post("/equipment/re7s/log-fields", json={"label": "A"}).json()
    b = super_admin_client.post("/equipment/re7s/log-fields", json={"label": "B"}).json()
    r = super_admin_client.put("/equipment/re7s/log-fields/order", json={"ids": [b["id"], a["id"]]})
    assert [f["label"] for f in r.json()] == ["B", "A"]
    r = super_admin_client.patch(f"/equipment/re7s/log-fields/{a['id']}", json={"label": "A2", "help": "como preencher"})
    assert r.json()["label"] == "A2" and r.json()["help"] == "como preencher"
    assert super_admin_client.patch(f"/equipment/re7s/log-fields/{a['id']}", json={"label": "b"}).status_code == 409
