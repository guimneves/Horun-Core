"""Gateway: encaminha requisições para dentro de um módulo, injetando a
identidade do usuário já autenticado no Core via cabeçalhos internos
confiáveis (Prompt_Horun_Core.md, seção 1 e 3 — mesmo contrato que
module-template/backend/app/core/identity.py espera).

Cobre hoje o encaminhamento de chamadas de API (`/m/{id}/api/...`). O
encaixe do *frontend* de um módulo dentro do mesmo caminho (a SPA do
módulo precisaria ser buildada com um base path correspondente) é um
próximo passo — ver Prompt_Horun_Core.md, seção 8. Por ora, o dashboard só
usa este proxy para health check e chamadas de API; abrir a interface de
um módulo ainda aponta para o endereço próprio dele.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Request, Response, status
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

    target_url = module.internal_base_url.rstrip("/") + "/" + path.lstrip("/")

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
