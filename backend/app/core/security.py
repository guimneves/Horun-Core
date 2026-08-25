"""Hash de senha e sessão assinada (cookie HTTPOnly) — mesmo padrão do
RE7S (app/core/security.py), salt/nome de cookie próprios do Core para não
colidir se algum dia rodarem no mesmo domínio/porta durante o
desenvolvimento."""

from __future__ import annotations

import secrets

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from passlib.context import CryptContext

from app.core.config import settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
_serializer = URLSafeTimedSerializer(settings.secret_key, salt="horun-core-session")

SESSION_COOKIE_NAME = "horun_core_session"

# Gerado uma vez por processo — reiniciar o backend invalida sessões
# antigas (mesmo raciocínio do RE7S: reiniciar é o que acontece a cada
# deploy/atualização do Core).
_SESSION_EPOCH = secrets.token_hex(8)


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd_context.verify(password, password_hash)


def create_session_token(user_id: int) -> str:
    return _serializer.dumps({"user_id": user_id, "epoch": _SESSION_EPOCH})


def read_session_token(token: str) -> int | None:
    if not token:
        return None
    try:
        data = _serializer.loads(token, max_age=settings.session_max_age_seconds)
    except (BadSignature, SignatureExpired):
        return None
    if data.get("epoch") != _SESSION_EPOCH:
        return None
    return data.get("user_id")
