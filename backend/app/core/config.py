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

    # SMTP para e-mail de notificações importantes (menção, resposta,
    # digest semanal de aniversários). Sem SMTP_HOST → e-mail desligado,
    # nada quebra. Decisão: Gmail dedicado + senha de app
    # (Prompt_Horun_Core.md, seção 8).
    smtp_host: str = os.environ.get("SMTP_HOST", "")
    smtp_port: int = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user: str = os.environ.get("SMTP_USER", "")
    smtp_pass: str = os.environ.get("SMTP_PASS", "")
    smtp_from: str = os.environ.get("SMTP_FROM", "") or os.environ.get("SMTP_USER", "")

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)


settings = Settings()
