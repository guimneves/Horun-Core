"""Mural de avisos e lembretes entre colaboradores (dashboard "Mural").
Qualquer usuário autenticado publica; só o administrador máximo fixa
(pinned) ou remove post de outra pessoa."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, SuperAdminUser
from app.db.models import Post, User

router = APIRouter(tags=["posts"])


class CreatePostRequest(BaseModel):
    content: str


class UpdatePostRequest(BaseModel):
    pinned: bool


class PostOut(BaseModel):
    id: int
    content: str
    pinned: bool
    created_at: datetime
    author_id: int
    author_username: str
    author_display_name: str


def _out(post: Post, author: User) -> PostOut:
    return PostOut(
        id=post.id,
        content=post.content,
        pinned=post.pinned,
        created_at=post.created_at,
        author_id=author.id,
        author_username=author.username,
        author_display_name=author.display_name or author.username,
    )


@router.get("/posts", response_model=list[PostOut])
def list_posts(user: CurrentUser, session: SessionDep):
    posts = session.exec(select(Post).order_by(Post.pinned.desc(), Post.created_at.desc())).all()
    out = []
    for p in posts:
        author = session.get(User, p.author_id)
        if author is not None:
            out.append(_out(p, author))
    return out


@router.post("/posts", response_model=PostOut)
def create_post(payload: CreatePostRequest, user: CurrentUser, session: SessionDep):
    content = payload.content.strip()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "O aviso não pode ficar vazio")
    post = Post(author_id=user.id, content=content)
    session.add(post)
    session.commit()
    session.refresh(post)
    return _out(post, user)


@router.patch("/posts/{post_id}", response_model=PostOut)
def update_post(post_id: int, payload: UpdatePostRequest, _admin: SuperAdminUser, session: SessionDep):
    """Fixar/desafixar — só o administrador máximo (seção 6)."""
    post = session.get(Post, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aviso não encontrado")
    post.pinned = payload.pinned
    session.add(post)
    session.commit()
    session.refresh(post)
    author = session.get(User, post.author_id)
    return _out(post, author)


@router.delete("/posts/{post_id}")
def delete_post(post_id: int, user: CurrentUser, session: SessionDep):
    post = session.get(Post, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aviso não encontrado")
    if post.author_id != user.id and not user.is_super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só o autor ou o administrador máximo pode remover")
    session.delete(post)
    session.commit()
    return {"ok": True}
