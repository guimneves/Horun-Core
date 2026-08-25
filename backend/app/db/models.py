"""Modelos de banco de dados do Horun Core (ver Prompt_Horun_Core.md).

- **User**: conta de plataforma. `is_super_admin` é o "administrador
  máximo" da seção 6 do Prompt_Horun_Core.md — diferente do papel `admin`
  que cada módulo tem internamente (ex. RE7S). `is_protected` segue o
  mesmo padrão do RE7S: a conta de bootstrap nunca pode ser excluída,
  rebaixada nem ter usuário/senha alterados, para sempre haver um acesso
  de backup garantido. Importação de usuários do AD (seção 4) ainda não
  implementada — hoje todo usuário é criado localmente pelo super-admin.
- **Module**: cadastro de um módulo (RE7S, Leco, ...) — `id` é o slug
  usado tanto no `MODULE.md` do módulo quanto na rota de proxy
  (`/m/{id}/...`). `internal_base_url` só precisa ser alcançável dentro da
  rede Docker do servidor, nunca da rede do laboratório diretamente
  (seção 3 do Prompt_Horun_Core.md).
- **UserModuleAccess**: permissão binária usuário↔módulo (seção 6) — o
  Core só decide *se* a pessoa entra; o que ela pode fazer lá dentro é
  responsabilidade do próprio módulo.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    display_name: str = ""
    is_super_admin: bool = Field(default=False)
    # Conta de bootstrap protegida — mesmo raciocínio do RE7S (ver
    # app/api/routes_auth.py): sempre precisa existir um acesso de backup.
    is_protected: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)


class Module(SQLModel, table=True):
    # Id é o slug (ex. "re7s"), não um inteiro auto-incrementado — é ele
    # que aparece na URL do proxy (/m/re7s/...) e no MODULE.md do módulo.
    id: str = Field(primary_key=True)
    display_name: str
    codename: str = ""
    description: str = ""
    icon: str = "🧪"
    internal_base_url: str  # ex. "http://re7s-backend:8000" — só resolve na rede Docker do servidor
    health_path: str = "/health"
    created_at: datetime = Field(default_factory=utcnow)


class UserModuleAccess(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    module_id: str = Field(foreign_key="module.id", index=True)
    granted_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    granted_at: datetime = Field(default_factory=utcnow)
