"""Ciclo de vida de uma corrida (Prompt_Horun_PostRun.md, seção 3) com o
equipamento de exemplo e dados sintéticos. Ao trocar `app/equipment.py`
pelo seu equipamento, ajuste os números esperados e os arquivos de
`sample_data/` — a sequência dos testes continua valendo."""

from tests.conftest import headers


def _scan(client):
    r = client.post("/api/postrun/scan", headers=headers())
    assert r.status_code == 200, r.text
    return r.json()


def _run_by_label(client, label):
    runs = client.get("/api/postrun/runs", headers=headers()).json()
    return next(r for r in runs if r["sample_label"] == label)


def test_scan_reads_new_files_once_and_reports_bad_ones(client):
    first = _scan(client)
    assert first["new_runs"] == 3
    assert [e["path"] for e in first["errors"]] == ["2026-11-13/corrida_quebrada.csv"]
    again = _scan(client)
    assert again["new_files"] == 0 and again["new_runs"] == 0
    files = client.get("/api/postrun/files", headers=headers()).json()
    assert len(files) == 1 and "cabeçalho" in files[0]["error"]


def test_run_detail_has_signals_for_the_plot(client):
    _scan(client)
    run = _run_by_label(client, "PADRAO-01")
    detail = client.get(f"/api/postrun/runs/{run['id']}", headers=headers()).json()
    names = {s["name"]: s for s in detail["signals"]}
    assert set(names) == {"sinal", "temperatura"} and names["temperatura"]["secondary"]
    assert len(names["sinal"]["x"]) == len(names["sinal"]["y"]) > 100
    assert detail["status"] == "nova" and detail["params"]["baseline"] == "linear"


def test_treat_computes_values_and_suggests_sample_code(client):
    _scan(client)
    run = _run_by_label(client, "HP300N-A_2")
    r = client.post(f"/api/postrun/runs/{run['id']}/treat", json={"params": {}}, headers=headers())
    assert r.status_code == 200, r.text
    body = r.json()
    values = {v["name"]: v["value"] for v in body["values"]}
    assert body["status"] == "tratada" and body["sample_code"] == "HP300N-A"
    assert 300 <= values["t_pico"] <= 340 and values["area"] > 0

    bad = client.post(f"/api/postrun/runs/{run['id']}/treat", json={"params": {"t_ini": 500, "t_fim": 100}}, headers=headers())
    assert bad.status_code == 422


def test_validate_rules_and_lock(client):
    _scan(client)
    run = _run_by_label(client, "PADRAO-01")
    rid = run["id"]
    assert client.post(f"/api/postrun/runs/{rid}/validate", headers=headers()).status_code == 409  # sem tratamento
    client.post(f"/api/postrun/runs/{rid}/treat", json={"params": {}}, headers=headers())
    assert client.post(f"/api/postrun/runs/{rid}/validate", headers=headers(level=5)).status_code == 403  # IC
    r = client.post(f"/api/postrun/runs/{rid}/validate", headers=headers(level=4))
    assert r.status_code == 200 and r.json()["status"] == "validada" and r.json()["validated_by"] == "ana"
    # validada: tratamento e amostra travados
    assert client.post(f"/api/postrun/runs/{rid}/treat", json={"params": {}}, headers=headers()).status_code == 409
    assert client.post(f"/api/postrun/runs/{rid}/link", json={"sample_code": "X"}, headers=headers()).status_code == 409


def test_publish_retract_and_republish_new_version(client, resultados):
    _scan(client)
    rid = _run_by_label(client, "HP300N-A_1")["id"]
    client.post(f"/api/postrun/runs/{rid}/treat", json={"params": {}}, headers=headers())
    client.post(f"/api/postrun/runs/{rid}/link", json={"sample_code": "HP300N-A", "project_code": "Hidro"}, headers=headers())
    assert client.post(f"/api/postrun/runs/{rid}/publish", headers=headers()).status_code == 409  # não validada
    client.post(f"/api/postrun/runs/{rid}/validate", headers=headers())
    r = client.post(f"/api/postrun/runs/{rid}/publish", headers=headers())
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "publicada" and r.json()["delivery"]["state"] == "enviado"
    sent = resultados.received[-1]
    assert sent["schema"] == "horun.postrun.result/1" and sent["version"] == 1
    assert sent["sample_code"] == "HP300N-A" and sent["project_code"] == "Hidro"
    assert sent["source_key"] == "__MODULE_ID__:2026-11-13/corrida_02.csv"
    assert {v["name"] for v in sent["values"]} == {"area", "altura", "t_pico", "T_pico"}

    # publicada: só a coordenação desvalida (e isso retira do Resultados)
    assert client.post(f"/api/postrun/runs/{rid}/unvalidate", json={}, headers=headers(level=3)).status_code == 403
    r = client.post(f"/api/postrun/runs/{rid}/unvalidate", json={"reason": "janela errada"}, headers=headers(level=2))
    assert r.status_code == 200 and r.json()["status"] == "tratada"
    assert resultados.received[-1]["retracted"] is True and resultados.received[-1]["version"] == 1

    client.post(f"/api/postrun/runs/{rid}/treat", json={"params": {"t_ini": 100}}, headers=headers())
    client.post(f"/api/postrun/runs/{rid}/validate", headers=headers())
    client.post(f"/api/postrun/runs/{rid}/publish", headers=headers())
    assert resultados.received[-1]["version"] == 2 and resultados.received[-1]["treatment"]["params"]["t_ini"] == 100


def test_resultados_down_keeps_it_in_the_outbox(client, resultados):
    _scan(client)
    rid = _run_by_label(client, "PADRAO-01")["id"]
    client.post(f"/api/postrun/runs/{rid}/treat", json={"params": {}}, headers=headers())
    client.post(f"/api/postrun/runs/{rid}/validate", headers=headers())
    resultados.fail = True
    r = client.post(f"/api/postrun/runs/{rid}/publish", headers=headers())
    assert r.status_code == 200
    delivery = r.json()["delivery"]
    assert delivery["state"] == "pendente" and "fora do ar" in delivery["last_error"]
    assert client.get("/api/postrun/equipment", headers=headers()).json()["outbox_pending"] == 1

    resultados.fail = False
    assert client.post("/api/postrun/outbox/retry", headers=headers()).json() == {"tried": 1, "sent": 1, "still_pending": 0}
    assert _run_by_label(client, "PADRAO-01")["delivery"]["state"] == "enviado"
    assert len(resultados.received) == 1


def test_batch_treat_validate_publish(client, resultados):
    _scan(client)
    ids = [r["id"] for r in client.get("/api/postrun/runs", headers=headers()).json()]
    assert client.post("/api/postrun/batch", json={"action": "tratar", "run_ids": ids}, headers=headers()).json()["failed"] == []
    assert client.post("/api/postrun/batch", json={"action": "validar", "run_ids": ids}, headers=headers(level=5)).status_code == 403
    assert len(client.post("/api/postrun/batch", json={"action": "validar", "run_ids": ids}, headers=headers()).json()["done"]) == 3
    out = client.post("/api/postrun/batch", json={"action": "publicar", "run_ids": ids}, headers=headers()).json()
    assert len(out["done"]) == 3 and len(resultados.received) == 3


def test_changed_file_after_validation_is_flagged_not_overwritten(client):
    import os
    from pathlib import Path

    _scan(client)
    rid = _run_by_label(client, "PADRAO-01")["id"]
    client.post(f"/api/postrun/runs/{rid}/treat", json={"params": {}}, headers=headers())
    client.post(f"/api/postrun/runs/{rid}/validate", headers=headers())
    path = Path(os.environ["POSTRUN_DATA_DIR"]) / "2026-11-13" / "corrida_01.csv"
    path.write_text(path.read_text(encoding="utf-8").replace("PADRAO-01", "PADRAO-01X"), encoding="utf-8")
    r = client.post(f"/api/postrun/runs/{rid}/reread", headers=headers())
    assert r.status_code == 200
    run = r.json()["run"]
    assert run["status"] == "validada" and run["source_changed"] is True and run["sample_label"] == "PADRAO-01"


def test_requires_core_identity(client):
    assert client.get("/api/postrun/runs").status_code == 401
