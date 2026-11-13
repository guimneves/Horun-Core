"""Cada teste roda num banco e numa pasta de dados temporários — definidos
ANTES de importar o app (a configuração é lida na importação)."""

import os
import shutil
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="postrun_test_"))
os.environ["MODULE_DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["POSTRUN_DATA_DIR"] = str(_TMP / "data")
os.environ.pop("POSTRUN_RESULTADOS_URL", None)
os.environ.pop("HORUN_DEV_MODE", None)
SAMPLE_DATA = Path(__file__).resolve().parents[1] / "sample_data"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402


def headers(level: int = 3, user: str = "ana", user_id: str = "7") -> dict:
    return {"X-Horun-User-Id": user_id, "X-Horun-User": user, "X-Horun-Role": "user", "X-Horun-Level": str(level)}


@pytest.fixture()
def client():
    from app.db.session import engine
    from app.main import app

    data = Path(os.environ["POSTRUN_DATA_DIR"])
    shutil.rmtree(data, ignore_errors=True)
    shutil.copytree(SAMPLE_DATA, data)
    SQLModel.metadata.drop_all(engine)
    with TestClient(app) as c:
        yield c


class FakePublisher:
    """Faz o papel do Resultados: guarda o que recebeu; `fail=True` simula queda."""

    def __init__(self):
        self.received: list[dict] = []
        self.fail = False

    def __call__(self, payload: dict) -> str:
        from app.postrun_core.publish import PublishError

        if self.fail:
            raise PublishError("Resultados fora do ar (teste)")
        self.received.append(payload)
        return "retracted" if payload.get("retracted") else "stored"


@pytest.fixture()
def resultados(monkeypatch):
    import app.main as main

    fake = FakePublisher()
    monkeypatch.setattr(main.publisher, "send", fake)
    return fake
