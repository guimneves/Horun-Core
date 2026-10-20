"""Crachá automático (Prompt 8.3 itens 6–7, pedido do usuário em 2026-10-20):
dados do verso no perfil (contato de emergência, alergias/condições, tipo
sanguíneo) — sensíveis: só a própria pessoa e o administrador máximo."""


def test_person_fills_own_badge_data(user_a_client, user_a):
    r = user_a_client.patch("/auth/me", json={
        "display_name": "Ana Teste", "emergency_contact_name": "Fulano", "emergency_contact_phone": "+55 21 90000-0000",
        "medical_notes": "Alergia a látex", "blood_type": "O-", "badge_title": "Doutoranda",
    })
    assert r.status_code == 200, r.text
    # nada disso vai no UserOut
    assert "medical_notes" not in r.json() and "blood_type" not in r.json()
    b = user_a_client.get("/auth/me/badge").json()
    assert b["name"] == "Ana Teste" and b["title"] == "Doutoranda" and b["blood_type"] == "O-"
    assert b["medical_notes"] == "Alergia a látex" and b["emergency_contact_name"] == "Fulano"
    assert user_a_client.get(f"/users/{user_a.id}/badge").status_code == 200

    assert user_a_client.patch("/auth/me", json={"blood_type": "Z+"}).status_code == 422
    assert user_a_client.patch("/auth/me", json={"medical_notes": "x" * 200}).status_code == 400
    # limpar volta ao título da qualificação/posição
    assert user_a_client.patch("/auth/me", json={"blood_type": "", "badge_title": ""}).status_code == 200
    assert user_a_client.get("/auth/me/badge").json()["blood_type"] == ""


def test_only_admin_maximo_sees_other_badges(super_admin_client, user_a_client, user_b_client, user_a, user_b, admin2_client):
    user_a_client.patch("/auth/me", json={"medical_notes": "Asma"})
    # outra pessoa, mesmo coordenador(a): não
    assert user_b_client.get(f"/users/{user_a.id}/badge").status_code == 403
    assert admin2_client.get(f"/users/{user_a.id}/badge").status_code == 403
    assert admin2_client.get("/users/badges").status_code == 403
    assert "medical_notes" not in str(admin2_client.get("/users").json())
    assert "Asma" not in str(user_b_client.get("/users/directory").json())
    # administrador máximo: sim, um a um e em lote
    assert super_admin_client.get(f"/users/{user_a.id}/badge").json()["medical_notes"] == "Asma"
    names = [b["id"] for b in super_admin_client.get("/users/badges").json()]
    assert user_a.id in names and user_b.id in names
    assert super_admin_client.get("/auth/me").json()["can"]["make_badges"] is True
    assert user_a_client.get("/auth/me").json()["can"]["make_badges"] is False
