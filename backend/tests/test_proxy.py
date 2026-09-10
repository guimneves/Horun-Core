import app.api.routes_proxy as routes_proxy


class _FakeUpstreamResponse:
    def __init__(self, status_code=200, content=b'{"ok": true}', headers=None):
        self.status_code = status_code
        self.content = content
        self.headers = headers or {"content-type": "application/json"}


class _FakeAsyncClient:
    """Substitui httpx.AsyncClient nos testes — captura a chamada feita
    pelo proxy (método, URL, cabeçalhos) para os testes inspecionarem."""

    calls: list[dict] = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def request(self, method, url, params=None, headers=None, content=None):
        _FakeAsyncClient.calls.append(
            {"method": method, "url": url, "headers": headers, "content": content}
        )
        return _FakeUpstreamResponse()


def _register_module(client, module_id="re7s", frontend_url=""):
    return client.post(
        "/modules",
        json={
            "id": module_id,
            "display_name": "RE7S",
            "internal_base_url": "http://re7s-backend:8000",
            "health_path": "/health",
            "internal_frontend_url": frontend_url,
        },
    )


def test_proxy_404_for_unknown_module(user_a_client):
    r = user_a_client.get("/m/inexistente/api/whoami")
    assert r.status_code == 404


def test_proxy_403_without_access(super_admin_client, user_a_client):
    _register_module(super_admin_client)
    r = user_a_client.get("/m/re7s/api/whoami")
    assert r.status_code == 403


def test_proxy_forwards_api_call_with_identity_headers(super_admin_client, user_a_client, user_a, monkeypatch):
    _register_module(super_admin_client)
    super_admin_client.post("/modules/re7s/access", json={"user_id": user_a.id})

    _FakeAsyncClient.calls.clear()
    monkeypatch.setattr(routes_proxy.httpx, "AsyncClient", _FakeAsyncClient)

    r = user_a_client.get("/m/re7s/api/whoami")
    assert r.status_code == 200

    assert len(_FakeAsyncClient.calls) == 1
    call = _FakeAsyncClient.calls[0]
    # "api/whoami" vai pro backend (internal_base_url), não pro frontend.
    assert call["url"] == "http://re7s-backend:8000/api/whoami"
    assert call["headers"]["X-Horun-User"] == "usuario-a"
    assert call["headers"]["X-Horun-User-Id"] == str(user_a.id)
    assert call["headers"]["X-Horun-Role"] == "user"


def test_proxy_reports_super_admin_role(super_admin_client, monkeypatch):
    _register_module(super_admin_client)

    _FakeAsyncClient.calls.clear()
    monkeypatch.setattr(routes_proxy.httpx, "AsyncClient", _FakeAsyncClient)

    super_admin_client.get("/m/re7s/api/whoami")
    assert _FakeAsyncClient.calls[0]["headers"]["X-Horun-Role"] == "admin"


def test_proxy_returns_502_when_module_unreachable(super_admin_client):
    _register_module(super_admin_client)
    # Sem mock: internal_base_url não resolve de verdade no ambiente de
    # teste, então o proxy deve reportar 502 em vez de deixar a exceção
    # de rede vazar como erro 500.
    r = super_admin_client.get("/m/re7s/api/whoami")
    assert r.status_code == 502


def test_proxy_frontend_path_404_when_module_not_embeddable(super_admin_client):
    _register_module(super_admin_client)  # sem internal_frontend_url
    r = super_admin_client.get("/m/re7s/")
    assert r.status_code == 404


def test_proxy_forwards_frontend_request_to_frontend_url(super_admin_client, monkeypatch):
    _register_module(super_admin_client, frontend_url="http://re7s-frontend:80")

    _FakeAsyncClient.calls.clear()
    monkeypatch.setattr(routes_proxy.httpx, "AsyncClient", _FakeAsyncClient)

    r = super_admin_client.get("/m/re7s/assets/index.js")
    assert r.status_code == 200
    assert _FakeAsyncClient.calls[0]["url"] == "http://re7s-frontend:80/assets/index.js"


def test_proxy_frontend_root_request(super_admin_client, monkeypatch):
    _register_module(super_admin_client, frontend_url="http://re7s-frontend:80")

    _FakeAsyncClient.calls.clear()
    monkeypatch.setattr(routes_proxy.httpx, "AsyncClient", _FakeAsyncClient)

    r = super_admin_client.get("/m/re7s/")
    assert r.status_code == 200
    assert _FakeAsyncClient.calls[0]["url"] == "http://re7s-frontend:80/"


def test_proxy_without_trailing_slash_redirects(super_admin_client):
    _register_module(super_admin_client, frontend_url="http://re7s-frontend:80")
    r = super_admin_client.get("/m/re7s", follow_redirects=False)
    assert r.status_code in (302, 307)
    assert r.headers["location"] == "/m/re7s/"
