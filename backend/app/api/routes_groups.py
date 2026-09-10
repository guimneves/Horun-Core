"""Grupos de colaboradores (Fase 2). Só o administrador máximo cria e
exclui grupos; o admin interno de um grupo (que também é super-admin)
gerencia os membros dele. Cada grupo tem mural (Post.group_id) e eventos
(Event.group_id) próprios — ver routes_posts.py / routes_events.py."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, SuperAdminUser
from app.core.groups import can_manage_group, can_see_group, member_group_ids
from app.db.models import Event, Group, GroupMembership, Post, PostReply, User

router = APIRouter(tags=["groups"])


def _name(u: User | None) -> str:
    return (u.full_name or u.display_name or u.username) if u else ""


class GroupIn(BaseModel):
    name: str
    description: str = ""
    color: str = "#5c6bc4"
    internal_admin_id: int


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    internal_admin_id: int | None = None


class GroupOut(BaseModel):
    id: int
    name: str
    description: str
    color: str
    internal_admin_id: int
    internal_admin_name: str
    member_count: int
    is_member: bool
    can_manage: bool


class MemberOut(BaseModel):
    user_id: int
    name: str
    has_photo: bool
    is_internal_admin: bool
    added_at: datetime


def _out(session: SessionDep, g: Group, user: User) -> GroupOut:
    members = session.exec(select(GroupMembership).where(GroupMembership.group_id == g.id)).all()
    member_ids = {m.user_id for m in members}
    return GroupOut(
        id=g.id,
        name=g.name,
        description=g.description or "",
        color=g.color or "#5c6bc4",
        internal_admin_id=g.internal_admin_id,
        internal_admin_name=_name(session.get(User, g.internal_admin_id)),
        member_count=len(member_ids),
        is_member=user.id in member_ids,
        can_manage=can_manage_group(g, user),
    )


def _require_super_admin_target(session: SessionDep, user_id: int) -> User:
    target = session.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuário não encontrado")
    if not target.is_super_admin:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "O admin interno do grupo tem que ser um administrador máximo do Horun.",
        )
    return target


def _add_member(session: SessionDep, group_id: int, user_id: int, added_by_id: int) -> None:
    exists = session.exec(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id, GroupMembership.user_id == user_id
        )
    ).first()
    if exists is None:
        session.add(GroupMembership(group_id=group_id, user_id=user_id, added_by_id=added_by_id))


@router.get("/groups", response_model=list[GroupOut])
def list_groups(user: CurrentUser, session: SessionDep):
    groups = session.exec(select(Group).order_by(Group.name)).all()
    if not user.is_super_admin:
        mine = member_group_ids(session, user.id)
        groups = [g for g in groups if g.id in mine or g.internal_admin_id == user.id]
    return [_out(session, g, user) for g in groups]


@router.post("/groups", response_model=GroupOut)
def create_group(payload: GroupIn, admin: SuperAdminUser, session: SessionDep):
    if not payload.name.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "O grupo precisa de um nome")
    _require_super_admin_target(session, payload.internal_admin_id)
    group = Group(
        name=payload.name.strip(),
        description=payload.description.strip(),
        color=payload.color or "#5c6bc4",
        internal_admin_id=payload.internal_admin_id,
    )
    session.add(group)
    session.commit()
    session.refresh(group)
    _add_member(session, group.id, group.internal_admin_id, admin.id)  # admin interno entra como membro
    session.commit()
    return _out(session, group, admin)


@router.patch("/groups/{group_id}", response_model=GroupOut)
def update_group(group_id: int, payload: GroupUpdate, user: CurrentUser, session: SessionDep):
    group = session.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grupo não encontrado")
    if not can_manage_group(group, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só o administrador máximo ou o admin interno do grupo")

    if payload.name is not None:
        group.name = payload.name.strip() or group.name
    if payload.description is not None:
        group.description = payload.description.strip()
    if payload.color is not None:
        group.color = payload.color
    if payload.internal_admin_id is not None and payload.internal_admin_id != group.internal_admin_id:
        if not user.is_super_admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Só o administrador máximo troca o admin interno")
        _require_super_admin_target(session, payload.internal_admin_id)
        group.internal_admin_id = payload.internal_admin_id
        _add_member(session, group.id, payload.internal_admin_id, user.id)

    session.add(group)
    session.commit()
    session.refresh(group)
    return _out(session, group, user)


@router.delete("/groups/{group_id}")
def delete_group(group_id: int, _admin: SuperAdminUser, session: SessionDep):
    group = session.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grupo não encontrado")
    # Leva junto o conteúdo do grupo — sem membros ele ficaria invisível de qualquer forma.
    posts = session.exec(select(Post).where(Post.group_id == group_id)).all()
    for p in posts:
        for r in session.exec(select(PostReply).where(PostReply.post_id == p.id)).all():
            session.delete(r)
        session.delete(p)
    for e in session.exec(select(Event).where(Event.group_id == group_id)).all():
        session.delete(e)
    for m in session.exec(select(GroupMembership).where(GroupMembership.group_id == group_id)).all():
        session.delete(m)
    session.delete(group)
    session.commit()
    return {"ok": True}


@router.get("/groups/{group_id}/members", response_model=list[MemberOut])
def list_members(group_id: int, user: CurrentUser, session: SessionDep):
    group = session.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grupo não encontrado")
    if not can_see_group(session, group, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Você não faz parte deste grupo")
    rows = session.exec(
        select(GroupMembership).where(GroupMembership.group_id == group_id).order_by(GroupMembership.added_at)
    ).all()
    out = []
    for m in rows:
        u = session.get(User, m.user_id)
        if u is None:
            continue
        out.append(
            MemberOut(
                user_id=u.id,
                name=_name(u),
                has_photo=u.photo is not None,
                is_internal_admin=u.id == group.internal_admin_id,
                added_at=m.added_at,
            )
        )
    return out


class AddMemberIn(BaseModel):
    user_id: int


@router.post("/groups/{group_id}/members")
def add_member(group_id: int, payload: AddMemberIn, user: CurrentUser, session: SessionDep):
    group = session.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grupo não encontrado")
    if not can_manage_group(group, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só o administrador máximo ou o admin interno do grupo")
    if session.get(User, payload.user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuário não encontrado")
    _add_member(session, group_id, payload.user_id, user.id)
    session.commit()
    return {"ok": True}


@router.delete("/groups/{group_id}/members/{user_id}")
def remove_member(group_id: int, user_id: int, user: CurrentUser, session: SessionDep):
    group = session.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grupo não encontrado")
    if not can_manage_group(group, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só o administrador máximo ou o admin interno do grupo")
    if user_id == group.internal_admin_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Não dá pra remover o admin interno — defina outro admin interno primeiro.",
        )
    m = session.exec(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id, GroupMembership.user_id == user_id
        )
    ).first()
    if m is not None:
        session.delete(m)
        session.commit()
    return {"ok": True}
