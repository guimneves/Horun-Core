"""Gateway: encaminha requisições para dentro de um módulo, injetando a
identidade do usuário já autenticado no Core via cabeçalhos internos
confiáveis (Prompt_Horun_Core.md, seção 1 e 3 — mesmo contrato que
module-template/backend/app/core/identity.py espera).

Encaixe de interface (Prompt_Horun_Core.md, seção 8.1): `/m/{id}/*`
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
from app.core.permissions import LEVEL_SLUGS, is_coordinator_or_above, user_level
from app.core.security import SESSION_COOKIE_NAME
from app.db.models import Module, UserModuleAccess

router = APIRouter(tags=["proxy"])

# Cabeçalhos "hop-by-hop" — não devem ser repassados adiante nem de volta
# (RFC 7230 §6.1); repassar Host/Content-Length originais confundiria o
# servidor de destino.
_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length",
}

# Cabeçalhos de identidade que SÓ o Core escreve. Qualquer versão deles que
# venha do navegador é descartada antes de injetar a verdadeira — senão o
# módulo recebia os dois (o do cliente primeiro, porque o Starlette entrega
# os nomes em minúsculas e o Core escrevia com outra caixa) e lia o forjado:
# qualquer usuário logado virava admin ou outra pessoa dentro do módulo.
# Outros X-Horun-* (ex. X-Horun-Coordenador-Token do Financeiro, que o
# próprio frontend do módulo manda) continuam passando.
RESERVED_IDENTITY_HEADERS = {
    "x-horun-user-id",
    "x-horun-user",
    "x-horun-role",
    "x-horun-level",
    "x-horun-level-name",
}


def _without_core_session_cookie(cookie_header: str) -> str:
    """O cookie de sessão do Core não tem nada a fazer dentro de um módulo
    (a identidade vai pelos cabeçalhos) — só aumentaria o estrago se um
    módulo vazasse cabeçalhos. Os cookies do próprio módulo seguem."""
    kept = [
        part.strip()
        for part in cookie_header.split(";")
        if part.strip() and part.strip().split("=", 1)[0].strip() != SESSION_COOKIE_NAME
    ]
    return "; ".join(kept)


def build_forward_headers(incoming: dict[str, str], user) -> dict[str, str]:
    """Cabeçalhos repassados ao módulo: os do cliente, menos hop-by-hop,
    identidade forjável e o cookie do Core; mais a identidade verdadeira."""
    headers: dict[str, str] = {}
    for name, value in incoming.items():
        lower = name.lower()
        if lower in _HOP_BY_HOP or lower in RESERVED_IDENTITY_HEADERS:
            continue
        if lower == "cookie":
            value = _without_core_session_cookie(value)
            if not value:
                continue
        headers[name] = value
    level = user_level(user)
    headers["X-Horun-User-Id"] = str(user.id)
    headers["X-Horun-User"] = user.username
    # "admin" continua significando o mesmo de antes (administração geral do
    # Core = nível 1 ou 2), pra nenhum módulo existente mudar de comportamento.
    headers["X-Horun-Role"] = "admin" if is_coordinator_or_above(user) else "user"
    # Novos (opcionais para o módulo): nível 1-5 e o nome dele em ASCII.
    headers["X-Horun-Level"] = str(level)
    headers["X-Horun-Level-Name"] = LEVEL_SLUGS[level]
    return headers


def _has_access(session: SessionDep, user_id: int, sees_all: bool, module_id: str, module_public: bool) -> bool:
    if sees_all or module_public:
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

    if not _has_access(session, user.id, is_coordinator_or_above(user), module_id, module.public):
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

    forward_headers = build_forward_headers(dict(request.headers.items()), user)

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
