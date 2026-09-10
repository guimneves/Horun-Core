"""Mural de avisos e lembretes entre colaboradores (dashboard "Mural").
Qualquer usuário autenticado publica e responde; só o administrador
máximo fixa (pinned) ou remove post/resposta de outra pessoa."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, SuperAdminUser
from app.db.models import Post, PostReply, User

router = APIRouter(tags=["posts"])


class CreatePostRequest(BaseModel):
    content: str


class CreateReplyRequest(BaseModel):
    content: str


class UpdatePostRequest(BaseModel):
    pinned: bool


class ReplyOut(BaseModel):
    id: int
    post_id: int
    content: str
    created_at: datetime
    author_id: int
    author_username: str
    author_display_name: str


class PostOut(BaseModel):
    id: int
    content: str
    pinned: bool
    created_at: datetime
    author_id: int
    author_username: str
    author_display_name: str
    replies: list[ReplyOut]


class MentionableUserOut(BaseModel):
    id: int
    username: str
    display_name: str


def _reply_out(reply: PostReply, author: User) -> ReplyOut:
    return ReplyOut(
        id=reply.id,
        post_id=reply.post_id,
        content=reply.content,
        created_at=reply.created_at,
        author_id=author.id,
        author_username=author.username,
        author_display_name=author.display_name or author.username,
    )


def _post_out(post: Post, author: User, session: SessionDep) -> PostOut:
    replies = session.exec(
        select(PostReply).where(PostReply.post_id == post.id).order_by(PostReply.created_at.asc())
    ).all()
    reply_outs = []
    for r in replies:
        reply_author = session.get(User, r.author_id)
        if reply_author is not None:
            reply_outs.append(_reply_out(r, reply_author))
    return PostOut(
        id=post.id,
        content=post.content,
        pinned=post.pinned,
        created_at=post.created_at,
        author_id=author.id,
        author_username=author.username,
        author_display_name=author.display_name or author.username,
        replies=reply_outs,
    )


@router.get("/users/mentionable", response_model=list[MentionableUserOut])
def list_mentionable_users(_user: CurrentUser, session: SessionDep):
    """Lista mínima (id/usuário/nome) pra autocompletar @menções no mural —
    aberta a qualquer usuário autenticado, ao contrário de GET /users
    (administração), que expõe papel/status e é restrita ao admin máximo."""
    users = session.exec(select(User)).all()
    return [MentionableUserOut(id=u.id, username=u.username, display_name=u.display_name or u.username) for u in users]


@router.get("/posts", response_model=list[PostOut])
def list_posts(user: CurrentUser, session: SessionDep):
    posts = session.exec(select(Post).order_by(Post.pinned.desc(), Post.created_at.desc())).all()
    out = []
    for p in posts:
        author = session.get(User, p.author_id)
        if author is not None:
            out.append(_post_out(p, author, session))
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
    return _post_out(post, user, session)


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
    return _post_out(post, author, session)


@router.delete("/posts/{post_id}")
def delete_post(post_id: int, user: CurrentUser, session: SessionDep):
    post = session.get(Post, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aviso não encontrado")
    if post.author_id != user.id and not user.is_super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só o autor ou o administrador máximo pode remover")
    replies = session.exec(select(PostReply).where(PostReply.post_id == post_id)).all()
    for r in replies:
        session.delete(r)
    session.delete(post)
    session.commit()
    return {"ok": True}


@router.post("/posts/{post_id}/replies", response_model=ReplyOut)
def create_reply(post_id: int, payload: CreateReplyRequest, user: CurrentUser, session: SessionDep):
    post = session.get(Post, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aviso não encontrado")
    content = payload.content.strip()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A resposta não pode ficar vazia")
    reply = PostReply(post_id=post_id, author_id=user.id, content=content)
    session.add(reply)
    session.commit()
    session.refresh(reply)
    return _reply_out(reply, user)


@router.delete("/posts/{post_id}/replies/{reply_id}")
def delete_reply(post_id: int, reply_id: int, user: CurrentUser, session: SessionDep):
    reply = session.get(PostReply, reply_id)
    if reply is None or reply.post_id != post_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resposta não encontrada")
    if reply.author_id != user.id and not user.is_super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só o autor ou o administrador máximo pode remover")
    session.delete(reply)
    session.commit()
    return {"ok": True}
