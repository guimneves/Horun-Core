"""Configuração deste PostRun, lida de variáveis de ambiente.

Desenvolvimento: sem nada configurado, lê os arquivos de `sample_data/`
(dados sintéticos) e guarda as publicações na fila (sem Resultados).

Produção (atrás do Core): MODULE_DATABASE_URL (Postgres), POSTRUN_AGENT_MODE=true
(arquivos pelo Agente Horun, pasta `EQUIPMENT.agent_root` no config.json dele),
POSTRUN_RESULTADOS_URL=http://resultados-backend:8000 e POSTRUN_RESULTADOS_TOKEN
(o mesmo token cadastrado em POSTRUN_INGEST_TOKENS no Resultados).
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


class Settings:
    database_url: str = os.environ.get("MODULE_DATABASE_URL", "sqlite:///./__MODULE_ID___dev.db")
    # arquivos brutos: Agente (produção) ou uma pasta local (desenvolvimento)
    agent_mode: bool = os.environ.get("POSTRUN_AGENT_MODE", "false").lower() == "true"
    data_dir: Path = Path(os.environ.get("POSTRUN_DATA_DIR", str(BACKEND_DIR / "sample_data")))
    # envio ao Resultados — vazio = publicações ficam na fila
    resultados_url: str = os.environ.get("POSTRUN_RESULTADOS_URL", "")
    resultados_token: str = os.environ.get("POSTRUN_RESULTADOS_TOKEN", "")
    outbox_retry_seconds: float = float(os.environ.get("POSTRUN_OUTBOX_RETRY_SECONDS", "300"))
    # permissões por nível do Core (1 administrador máximo … 5 IC)
    validate_max_level: int = _int("POSTRUN_VALIDATE_MAX_LEVEL", 4)
    unpublish_max_level: int = _int("POSTRUN_UNPUBLISH_MAX_LEVEL", 2)


settings = Settings()
