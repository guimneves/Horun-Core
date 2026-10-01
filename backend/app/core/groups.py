"""Helpers de grupo (Fase 2) — quem enxerga o quê."""

from __future__ import annotations

from sqlmodel import Session, select

from app.db.models import Group, GroupMembership, User
from app.core.permissions import is_coordinator_or_above


def member_group_ids(session: Session, user_id: int) -> set[int]:
    rows = session.exec(select(GroupMembership.group_id).where(GroupMembership.user_id == user_id)).all()
    return set(rows)


def group_member_ids(session: Session, group_id: int) -> set[int]:
    rows = session.exec(select(GroupMembership.user_id).where(GroupMembership.group_id == group_id)).all()
    return set(rows)


def visible_group_scopes(session: Session, user: User) -> set[int | None]:
    """Escopos de mural/agenda que o usuário pode ver: sempre o do
    laboratório (None) + os grupos dos quais é membro."""
    return {None} | member_group_ids(session, user.id)


def is_member(session: Session, group_id: int, user_id: int) -> bool:
    return (
        session.exec(
            select(GroupMembership).where(
                GroupMembership.group_id == group_id, GroupMembership.user_id == user_id
            )
        ).first()
        is not None
    )


def can_manage_group(group: Group, user: User) -> bool:
    """Gerenciar membros / editar o grupo / criar evento do grupo: um
    coordenador do Core (nível ≤ 2) ou o admin interno do grupo."""
    return is_coordinator_or_above(user) or group.internal_admin_id == user.id


def can_see_group(session: Session, group: Group, user: User) -> bool:
    return is_coordinator_or_above(user) or is_member(session, group.id, user.id)
