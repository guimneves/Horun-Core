"""Mural de avisos e lembretes entre colaboradores (dashboard "Mural").
Qualquer usuário autenticado publica e responde; só o administrador
máximo fixa (pinned) ou remove post/resposta de outra pessoa."""

from __future__ import annotations

import re
from datetime import datetime

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.api.deps import CurrentUser, SessionDep
from app.core.groups import can_see_group, group_member_ids
from app.db.models import Group, Notification, Post, PostReply, User

router = APIRouter(tags=["posts"])

_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024  # 5 MB
_ALLOWED_ATTACHMENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}

# Mesma forma que o frontend reconhece/destaca (MentionTextarea.tsx):
# "@" seguido de letras, números, ponto ou hífen.
_MENTION_RE = re.compile(r"@([\w.-]+)")


def _mural_link(post: Post) -> str:
    return f"/?g={post.group_id}" if post.group_id else "/"


def _fan_out_notifications(
    session: Session, *, content: str, actor: User, post: Post, is_reply: bool
) -> None:
    """Cria as notificações de um post/resposta recém-criado: uma por
    pessoa mencionada (@), mais o autor do post quando é uma resposta.
    Num mural de grupo, só notifica quem é membro (não faz sentido avisar
    alguém de um aviso que ele não pode ver). Não commita."""
    recipients: dict[int, str] = {}  # user_id -> kind ("mention" vence "reply")

    usernames = set(_MENTION_RE.findall(content))
    if usernames:
        mentioned = session.exec(select(User).where(User.username.in_(list(usernames)))).all()
        for u in mentioned:
            if u.id != actor.id:
                recipients[u.id] = "mention"

    if is_reply and post.author_id != actor.id:
        recipients.setdefault(post.author_id, "reply")

    if post.group_id is not None:
        members = group_member_ids(session, post.group_id)
        recipients = {uid: k for uid, k in recipients.items() if uid in members}

    onde_mural = "no mural do grupo" if post.group_id else "no Mural"
    actor_name = actor.display_name or actor.username
    for user_id, kind in recipients.items():
        if kind == "mention":
            onde = "numa resposta" if is_reply else "num aviso"
            text = f"{actor_name} mencionou você {onde} {onde_mural}"
        else:
            text = f"{actor_name} respondeu seu aviso {onde_mural}"
        session.add(
            Notification(user_id=user_id, kind=kind, text=text, link=_mural_link(post), actor_id=actor.id)
        )


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
    can_delete: bool


class PostOut(BaseModel):
    id: int
    content: str
    pinned: bool
    group_id: int | None
    created_at: datetime
    author_id: int
    author_username: str
    author_display_name: str
    has_attachment: bool
    attachment_filename: str
    attachment_content_type: str
    can_delete: bool  # autor, super-admin, ou admin interno do grupo
    can_pin: bool  # super-admin ou admin interno do grupo (não o autor comum)
    replies: list[ReplyOut]


class MentionableUserOut(BaseModel):
    id: int
    username: str
    display_name: str


def _reply_out(reply: PostReply, author: User, session: Session, viewer: User) -> ReplyOut:
    post = session.get(Post, reply.post_id)
    can_delete = (
        reply.author_id == viewer.id
        or viewer.is_super_admin
        or (post is not None and _group_internal_admin_id(session, post.group_id) == viewer.id)
    )
    return ReplyOut(
        id=reply.id,
        post_id=reply.post_id,
        content=reply.content,
        created_at=reply.created_at,
        author_id=author.id,
        author_username=author.username,
        author_display_name=author.display_name or author.username,
        can_delete=can_delete,
    )


def _group_internal_admin_id(session: Session, group_id: int | None) -> int | None:
    if group_id is None:
        return None
    g = session.get(Group, group_id)
    return g.internal_admin_id if g else None


def _can_pin_post(session: Session, post: Post, user: User) -> bool:
    return user.is_super_admin or _group_internal_admin_id(session, post.group_id) == user.id


def _can_manage_post(session: Session, post: Post, user: User) -> bool:
    """Remover: o autor, o super-admin, ou — num mural de grupo — o admin
    interno do grupo."""
    return post.author_id == user.id or _can_pin_post(session, post, user)


def _post_out(post: Post, author: User, session: SessionDep, viewer: User) -> PostOut:
    replies = session.exec(
        select(PostReply).where(PostReply.post_id == post.id).order_by(PostReply.created_at.asc())
    ).all()
    reply_outs = []
    for r in replies:
        reply_author = session.get(User, r.author_id)
        if reply_author is not None:
            reply_outs.append(_reply_out(r, reply_author, session, viewer))
    return PostOut(
        id=post.id,
        content=post.content,
        pinned=post.pinned,
        group_id=post.group_id,
        created_at=post.created_at,
        author_id=author.id,
        author_username=author.username,
        author_display_name=author.display_name or author.username,
        has_attachment=post.attachment is not None,
        attachment_filename=post.attachment_filename or "",
        attachment_content_type=post.attachment_content_type or "",
        can_delete=_can_manage_post(session, post, viewer),
        can_pin=_can_pin_post(session, post, viewer),
        replies=reply_outs,
    )


@router.get("/users/mentionable", response_model=list[MentionableUserOut])
def list_mentionable_users(_user: CurrentUser, session: SessionDep):
    """Lista mínima (id/usuário/nome) pra autocompletar @menções no mural —
    aberta a qualquer usuário autenticado, ao contrário de GET /users
    (administração), que expõe papel/status e é restrita ao admin máximo."""
    users = session.exec(select(User)).all()
    return [MentionableUserOut(id=u.id, username=u.username, display_name=u.display_name or u.username) for u in users]


def _require_group_visible(session: Session, group_id: int, user: User) -> Group:
    group = session.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grupo não encontrado")
    if not can_see_group(session, group, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Você não faz parte deste grupo")
    return group


@router.get("/posts", response_model=list[PostOut])
def list_posts(user: CurrentUser, session: SessionDep, group_id: int | None = Query(default=None)):
    """Sem `group_id` = mural do laboratório (`group_id IS NULL`). Com
    `group_id` = mural daquele grupo (só se o usuário puder ver)."""
    if group_id is not None:
        _require_group_visible(session, group_id, user)
        q = select(Post).where(Post.group_id == group_id)
    else:
        q = select(Post).where(Post.group_id.is_(None))
    posts = session.exec(q.order_by(Post.pinned.desc(), Post.created_at.desc())).all()
    out = []
    for p in posts:
        author = session.get(User, p.author_id)
        if author is not None:
            out.append(_post_out(p, author, session, user))
    return out


@router.post("/posts", response_model=PostOut)
async def create_post(
    user: CurrentUser,
    session: SessionDep,
    content: str = Form(""),
    file: UploadFile | None = File(None),
    group_id: int | None = Form(None),
):
    """Multipart (não JSON): `content` obrigatório, `file` opcional (imagem
    ou PDF, até 5 MB), `group_id` opcional (publica no mural do grupo —
    qualquer membro pode)."""
    content = content.strip()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "O aviso não pode ficar vazio")

    if group_id is not None:
        _require_group_visible(session, group_id, user)

    post = Post(author_id=user.id, content=content, group_id=group_id)

    if file is not None and file.filename:
        if file.content_type not in _ALLOWED_ATTACHMENT_TYPES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Anexo não suportado (use imagem JPEG/PNG/WEBP ou PDF)"
            )
        data = await file.read()
        if len(data) > _MAX_ATTACHMENT_BYTES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Anexo grande demais (máximo 5 MB)")
        post.attachment = data
        post.attachment_content_type = file.content_type
        post.attachment_filename = file.filename

    session.add(post)
    session.commit()
    session.refresh(post)
    _fan_out_notifications(session, content=content, actor=user, post=post, is_reply=False)
    session.commit()
    return _post_out(post, user, session, user)


@router.get("/posts/{post_id}/attachment")
def get_post_attachment(post_id: int, _user: CurrentUser, session: SessionDep):
    post = session.get(Post, post_id)
    if post is None or post.attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sem anexo")
    headers = {}
    if post.attachment_filename:
        # inline: imagem abre na aba, PDF idem — o nome fica pro "salvar como"
        headers["Content-Disposition"] = f'inline; filename="{post.attachment_filename}"'
    return Response(
        content=post.attachment,
        media_type=post.attachment_content_type or "application/octet-stream",
        headers=headers,
    )


@router.patch("/posts/{post_id}", response_model=PostOut)
def update_post(post_id: int, payload: UpdatePostRequest, user: CurrentUser, session: SessionDep):
    """Fixar/desafixar — o administrador máximo, ou (num mural de grupo) o
    admin interno do grupo."""
    post = session.get(Post, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aviso não encontrado")
    if not (user.is_super_admin or _group_internal_admin_id(session, post.group_id) == user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sem permissão para fixar este aviso")
    post.pinned = payload.pinned
    session.add(post)
    session.commit()
    session.refresh(post)
    author = session.get(User, post.author_id)
    return _post_out(post, author, session, user)


@router.delete("/posts/{post_id}")
def delete_post(post_id: int, user: CurrentUser, session: SessionDep):
    post = session.get(Post, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aviso não encontrado")
    if not _can_manage_post(session, post, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sem permissão para remover este aviso")
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
    if post.group_id is not None:
        _require_group_visible(session, post.group_id, user)
    content = payload.content.strip()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A resposta não pode ficar vazia")
    reply = PostReply(post_id=post_id, author_id=user.id, content=content)
    session.add(reply)
    session.commit()
    session.refresh(reply)
    _fan_out_notifications(session, content=content, actor=user, post=post, is_reply=True)
    session.commit()
    return _reply_out(reply, user, session, user)


@router.delete("/posts/{post_id}/replies/{reply_id}")
def delete_reply(post_id: int, reply_id: int, user: CurrentUser, session: SessionDep):
    reply = session.get(PostReply, reply_id)
    if reply is None or reply.post_id != post_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resposta não encontrada")
    post = session.get(Post, post_id)
    can = reply.author_id == user.id or user.is_super_admin or (
        post is not None and _group_internal_admin_id(session, post.group_id) == user.id
    )
    if not can:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sem permissão para remover esta resposta")
    session.delete(reply)
    session.commit()
    return {"ok": True}
