"""Gateway: encaminha requisições para dentro de um módulo, injetando a
identidade do usuário já autenticado no Core via cabeçalhos internos
confiáveis (Prompt_Horun_Core.md, seção 1 e 3 — mesmo contrato que
module-template/backend/app/core/identity.py espera).

Encaixe de interface (Prompt_Horun_Core.md, seção 8, item 1): `/m/{id}/*`
atende dois tipos de requisição, distinguidos pelo primeiro segmento do
caminho —
  - `api/...` → API do módulo, vai para `module.internal_base_url`;
  - qualquer outra coisa (`/`, `/fila`, `/assets/x.js`, ...) → estáticos
    da SPA do módulo, vai para `module.internal_frontend_url` (só existe
    se o módulo suportar o encaixe — senão, 404).
Em ambos os casos a permissão (`UserModuleAccess`) é checada antes —
inclusive pro HTML/JS da SPA, que só deve chegar a quem tem acesso.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.db.models import Module, UserModuleAccess

router = APIRouter(tags=["proxy"])

# Cabeçalhos "hop-by-hop" — não devem ser repassados adiante nem de volta
# (RFC 7230 §6.1); repassar Host/Content-Length originais confundiria o
# servidor de destino.
_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length",
}


def _has_access(session: SessionDep, user_id: int, is_super_admin: bool, module_id: str) -> bool:
    if is_super_admin:
        return True
    grant = session.exec(
        select(UserModuleAccess)
        .where(UserModuleAccess.module_id == module_id)
        .where(UserModuleAccess.user_id == user_id)
    ).first()
    return grant is not None


@router.get("/m/{module_id}")
def redirect_to_trailing_slash(module_id: str):
    """`/m/amostras` (sem barra final) não bate com a rota abaixo — o link
    de navegação sempre usa barra final, mas alguém pode digitar/colar sem
    ela. Redireciona em vez de dar 404."""
    return RedirectResponse(url=f"/m/{module_id}/")


@router.api_route(
    "/m/{module_id}/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
async def proxy(module_id: str, path: str, request: Request, user: CurrentUser, session: SessionDep):
    module = session.get(Module, module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Módulo não encontrado")

    if not _has_access(session, user.id, user.is_super_admin, module_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sem permissão para este módulo")

    is_api_call = path == "api" or path.startswith("api/")
    if is_api_call:
        upstream_base = module.internal_base_url
    else:
        if not module.internal_frontend_url:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                f"Módulo '{module_id}' não suporta interface embutida no Core ainda.",
            )
        upstream_base = module.internal_frontend_url

    target_url = upstream_base.rstrip("/") + "/" + path.lstrip("/")

    forward_headers = {
        k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    forward_headers["X-Horun-User-Id"] = str(user.id)
    forward_headers["X-Horun-User"] = user.username
    forward_headers["X-Horun-Role"] = "admin" if user.is_super_admin else "user"

    body = await request.body()

    async with httpx.AsyncClient(timeout=30.0) as http_client:
        try:
            upstream = await http_client.request(
                request.method,
                target_url,
                params=request.query_params,
                headers=forward_headers,
                content=body,
            )
        except httpx.HTTPError as exc:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, f"Módulo '{module_id}' inacessível: {exc}"
            ) from exc

    response_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=response_headers,
        media_type=upstream.headers.get("content-type"),
    )
