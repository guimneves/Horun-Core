"""Identidade do usuário autenticado.

Em produção, o módulo roda atrás do Horun Core e nunca fica exposto direto
à rede do laboratório (só alcançável através do gateway do Core — mesma
disciplina já aplicada ao Postgres/backend do RE7S: sem porta pro host).
O Core valida o login e repassa a identidade via cabeçalhos internos
confiáveis (X-Horun-User-Id/X-Horun-User/X-Horun-Role, e o nível de
permissão em X-Horun-Level/X-Horun-Level-Name — Prompt_Horun_Modulo.md,
seção 5). O Core descarta qualquer versão desses cabeçalhos vinda do
navegador, então eles só são confiáveis porque o módulo nunca é alcançável
por fora do Core.

Em desenvolvimento standalone (HORUN_DEV_MODE=true), esses cabeçalhos não
existem — usa-se um usuário fixo, para permitir desenvolver e testar o
módulo inteiro sem o Core rodando (Prompt_Horun_Core.md, seção 3).
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from fastapi import Header, HTTPException, status

DEV_MODE = os.environ.get("HORUN_DEV_MODE", "false").lower() == "true"


@dataclass
class HorunIdentity:
    user_id: str
    username: str
    role: str  # "admin" (coordenador ou administrador máximo do Core) ou "user"
    # Nível de permissão do Core, 1 (administrador máximo) a 5 (IC) — opcional
    # para o módulo usar; ver Prompt_Horun_Modulo.md, seção 5.
    level: int = 5
    level_name: str = "ic"  # admin | coordenador | pesquisador | tecnico | ic


def _parse_level(raw: str | None) -> int:
    try:
        level = int(raw) if raw is not None else 5
    except ValueError:
        return 5
    return level if 1 <= level <= 5 else 5


def get_identity(
    x_horun_user_id: str | None = Header(default=None),
    x_horun_user: str | None = Header(default=None),
    x_horun_role: str | None = Header(default=None),
    x_horun_level: str | None = Header(default=None),
    x_horun_level_name: str | None = Header(default=None),
) -> HorunIdentity:
    if DEV_MODE:
        return HorunIdentity(user_id="dev", username="dev", role="admin", level=1, level_name="admin")

    if not x_horun_user_id or not x_horun_user or not x_horun_role:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Identidade não informada — este módulo só deve ser acessado através do Horun Core.",
        )
    return HorunIdentity(
        user_id=x_horun_user_id,
        username=x_horun_user,
        role=x_horun_role,
        level=_parse_level(x_horun_level),
        level_name=x_horun_level_name or "ic",
    )
