"""Níveis de permissão do Core, derivados da POSIÇÃO da pessoa
(Prompt_Horun_Core.md, seção 6).

    1  Administrador máximo  — só a conta original (`User.is_protected`).
                               Acesso total, inclusive cadastro/integração
                               de módulos e caixa de sugestões.
    2  Coordenador(a)        — tudo, menos cadastro/integração de módulos.
    3  Pesquisador(a)        — moderação (Mural, eventos do laboratório,
                               reservas de outros, conferência da ficha RUE);
                               não cria usuários, não dá permissões, não
                               mexe em módulos nem em equipamentos.
    4  Técnico(a)            — o mesmo do pesquisador + equipamentos.
    5  Iniciação Científica  — uso básico. Também é o nível de quem ainda
                               não tem posição definida (o mais restrito, de
                               propósito: ninguém ganha permissão por
                               esquecimento).

Toda checagem de permissão passa por estas funções — nunca compare
`position` ou `is_super_admin` direto numa rota. O frontend recebe o
resultado pronto em `can` (ver `capabilities`), sem repetir a regra.
"""

from __future__ import annotations

from app.db.models import User

LEVEL_ADMIN = 1
LEVEL_COORDINATOR = 2
LEVEL_RESEARCHER = 3
LEVEL_TECHNICIAN = 4
LEVEL_BASIC = 5

POSITION_LEVELS = {
    "Coordenador(a)": LEVEL_COORDINATOR,
    "Pesquisador(a)": LEVEL_RESEARCHER,
    "Técnico(a)": LEVEL_TECHNICIAN,
    "Iniciação Científica": LEVEL_BASIC,
}

# Nome do nível em ASCII — vai no cabeçalho X-Horun-Level-Name para os
# módulos (valor de cabeçalho HTTP não deve levar acento).
LEVEL_SLUGS = {
    LEVEL_ADMIN: "admin",
    LEVEL_COORDINATOR: "coordenador",
    LEVEL_RESEARCHER: "pesquisador",
    LEVEL_TECHNICIAN: "tecnico",
    LEVEL_BASIC: "ic",
}

LEVEL_LABELS = {
    LEVEL_ADMIN: "Administrador máximo",
    LEVEL_COORDINATOR: "Coordenador(a)",
    LEVEL_RESEARCHER: "Pesquisador(a)",
    LEVEL_TECHNICIAN: "Técnico(a)",
    LEVEL_BASIC: "Iniciação Científica",
}


def user_level(user: User) -> int:
    if user.is_protected:
        return LEVEL_ADMIN
    return POSITION_LEVELS.get(user.position or "", LEVEL_BASIC)


def is_coordinator_or_above(user: User) -> bool:
    """Administração geral: usuários (e as posições, que definem o nível),
    permissões de módulo, grupos, telefones no diretório, acesso a todo
    módulo. É o que antes era "administrador máximo"."""
    return user_level(user) <= LEVEL_COORDINATOR


def can_manage_modules(user: User) -> bool:
    """Cadastro e integração de módulos (URLs internas, ícone, créditos) —
    fica só com o nível 1 para evitar conflito na integração."""
    return user_level(user) == LEVEL_ADMIN


def can_manage_equipment(user: User) -> bool:
    """Criar/editar equipamentos, áreas e tipos. Técnicos sim; pesquisadores
    não (pedido explícito)."""
    return user_level(user) in (LEVEL_ADMIN, LEVEL_COORDINATOR, LEVEL_TECHNICIAN)


def can_moderate(user: User) -> bool:
    """Mexer no que é de outras pessoas: fixar/editar/remover avisos e
    respostas, eventos do laboratório, reservas de outros, editar e conferir
    registros da ficha RUE."""
    return user_level(user) <= LEVEL_TECHNICIAN


def capabilities(user: User) -> dict[str, bool]:
    """Mapa pronto para o frontend esconder/mostrar ações (o backend continua
    sendo quem decide — isto é só para a interface não oferecer o que vai
    ser recusado)."""
    coordinator = is_coordinator_or_above(user)
    return {
        "manage_users": coordinator,
        "manage_access": coordinator,
        "manage_groups": coordinator,
        "manage_modules": can_manage_modules(user),
        "manage_equipment": can_manage_equipment(user),
        "moderate": can_moderate(user),
        "read_suggestions": user.is_protected,
    }
