"""Busca global — a caixa do topo do Core. Varre avisos do Mural,
equipamentos, módulos cadastrados e colaboradores. Aberta a qualquer
autenticado; telefone/dados privados nunca entram no resultado."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from sqlmodel import or_, select

from app.api.deps import CurrentUser, SessionDep
from app.db.models import Equipment, Module, Post, User

router = APIRouter(tags=["search"])

_PER_KIND = 5
_MIN_CHARS = 2


class SearchHit(BaseModel):
    kind: str  # "post" | "equipment" | "module" | "person"
    title: str
    subtitle: str
    link: str


def _snippet(text: str, term: str, width: int = 70) -> str:
    lower = text.lower()
    pos = lower.find(term.lower())
    if pos < 0:
        return text[:width] + ("…" if len(text) > width else "")
    start = max(0, pos - width // 3)
    end = min(len(text), start + width)
    return ("…" if start > 0 else "") + text[start:end].strip() + ("…" if end < len(text) else "")


@router.get("/search", response_model=list[SearchHit])
def search(q: str, user: CurrentUser, session: SessionDep):
    term = q.strip()
    if len(term) < _MIN_CHARS:
        return []
    like = f"%{term}%"
    hits: list[SearchHit] = []

    posts = session.exec(
        select(Post).where(Post.content.ilike(like)).order_by(Post.created_at.desc()).limit(_PER_KIND)
    ).all()
    for p in posts:
        author = session.get(User, p.author_id)
        hits.append(
            SearchHit(
                kind="post",
                title=_snippet(p.content, term),
                subtitle=f"aviso de {author.display_name or author.username}" if author else "aviso",
                link="/",
            )
        )

    equipment = session.exec(
        select(Equipment).where(Equipment.display_name.ilike(like)).limit(_PER_KIND)
    ).all()
    for e in equipment:
        hits.append(SearchHit(kind="equipment", title=e.display_name, subtitle="equipamento", link="/agenda"))

    modules = session.exec(
        select(Module)
        .where(or_(Module.display_name.ilike(like), Module.description.ilike(like)))
        .limit(_PER_KIND)
    ).all()
    for m in modules:
        hits.append(
            SearchHit(
                kind="module",
                title=f"Horun · {m.display_name}",
                subtitle=m.description or "módulo",
                link="/modulos",
            )
        )

    people_matches = 0
    for u in session.exec(select(User)).all():
        name = u.full_name or u.display_name or u.username
        haystack = f"{name} {u.position} {u.qualification} {u.email}".lower()
        if term.lower() in haystack:
            hits.append(
                SearchHit(
                    kind="person",
                    title=name,
                    subtitle=u.position or "colaborador",
                    link="/colaboradores",
                )
            )
            people_matches += 1
            if people_matches >= _PER_KIND:
                break

    return hits
