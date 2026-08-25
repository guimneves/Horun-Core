"""Configuração do Horun Core, lida de variáveis de ambiente — mesmo
padrão do RE7S (ver Rock Eval Horun Dev/backend/app/core/config.py)."""

from __future__ import annotations

import os


class Settings:
    database_url: str = os.environ.get("CORE_DATABASE_URL", "sqlite:///./horun_core.db")

    # Fase local: gerado por instalação, não versionado. Em produção vira
    # segredo de verdade gerenciado no .env do servidor (ver .env.example).
    secret_key: str = os.environ.get("CORE_SECRET_KEY", "dev-only-troque-em-producao")
    session_max_age_seconds: int = 60 * 60 * 12  # 12h

    # Timeout curto: health check de módulo não pode travar o dashboard se
    # um módulo estiver com o container parado/inacessível.
    module_health_timeout_seconds: float = 2.0


settings = Settings()
