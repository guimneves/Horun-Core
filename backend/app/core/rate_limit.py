"""Limite de tentativas erradas no login e no primeiro acesso.

Sem isto, a senha de qualquer pessoa — e principalmente o código de primeiro
acesso de uma conta recém-criada — podia ser descoberta por tentativa e erro,
sem nenhum freio. Duas chaves por tentativa:

- por **usuário**: `MAX_PER_USER` erros em `WINDOW_SECONDS` bloqueiam aquele
  nome de usuário (vale de qualquer computador);
- por **IP**: `MAX_PER_IP` erros em `WINDOW_SECONDS` bloqueiam aquele
  computador (pega quem testa muitos nomes diferentes).

Um acerto zera o contador daquele usuário. Em memória, por processo: o
backend do Core roda com um worker só (ver backend/Dockerfile) — se um dia
tiver mais workers, isto precisa ir para o banco. Reiniciar zera os
contadores, o que é aceitável (o atacante perde o progresso também).
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

WINDOW_SECONDS = 15 * 60
MAX_PER_USER = 5
MAX_PER_IP = 20

_failures: dict[str, deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    """IP de quem está do outro lado. Atrás do Caddy, o IP direto é o do
    próprio proxy — o original vem em X-Forwarded-For (o backend não é
    alcançável por fora do Caddy, então esse cabeçalho é confiável aqui)."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "?"


def _recent(key: str, now: float) -> deque[float]:
    window = _failures[key]
    while window and now - window[0] > WINDOW_SECONDS:
        window.popleft()
    return window


def _keys(scope: str, username: str, ip: str) -> tuple[str, str]:
    return f"{scope}:user:{(username or '').strip().lower()}", f"{scope}:ip:{ip}"


def check(scope: str, username: str, request: Request) -> None:
    """Antes de conferir a senha/código: 429 se já passou do limite."""
    now = time.monotonic()
    user_key, ip_key = _keys(scope, username, client_ip(request))
    for key, limit in ((user_key, MAX_PER_USER), (ip_key, MAX_PER_IP)):
        window = _recent(key, now)
        if len(window) >= limit:
            wait_min = int((WINDOW_SECONDS - (now - window[0])) // 60) + 1
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Muitas tentativas erradas. Tente de novo em {wait_min} min.",
            )


def record_failure(scope: str, username: str, request: Request) -> None:
    now = time.monotonic()
    for key in _keys(scope, username, client_ip(request)):
        _recent(key, now).append(now)


def record_success(scope: str, username: str, request: Request) -> None:
    user_key, _ = _keys(scope, username, client_ip(request))
    _failures.pop(user_key, None)


def reset() -> None:
    """Só para testes."""
    _failures.clear()
