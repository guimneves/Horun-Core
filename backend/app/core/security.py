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


# Sem letras/dígitos que se confundem ao ditar ou copiar (0/O, 1/I/L).
_SETUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
SETUP_CODE_LENGTH = 8
SETUP_CODE_VALID_DAYS = 7


def generate_setup_code() -> str:
    """Código de primeiro acesso — dado por um coordenador a quem ele
    cadastra sem senha (seção "Criação sem senha"). Antes eram 6 hex (16,7
    milhões de valores, adivinhável por tentativa); agora 8 caracteres de
    31 símbolos (~850 bilhões), válido por SETUP_CODE_VALID_DAYS dias, com
    limite de tentativas em routes_auth."""
    return "".join(secrets.choice(_SETUP_CODE_ALPHABET) for _ in range(SETUP_CODE_LENGTH))


def normalize_setup_code(code: str) -> str:
    """Aceita o código digitado com minúsculas, espaços ou hífen."""
    return "".join(c for c in (code or "").upper() if c.isalnum())


def setup_code_matches(expected: str | None, given: str) -> bool:
    if not expected:
        return False
    return secrets.compare_digest(normalize_setup_code(expected), normalize_setup_code(given))


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd_context.verify(password, password_hash)


# Hash de uma senha qualquer, calculado uma vez: o login de um usuário que
# NÃO existe verifica contra ele, para gastar o mesmo tempo (bcrypt) de um
# usuário real — senão a diferença de tempo revela quais nomes existem.
_DUMMY_HASH = _pwd_context.hash(secrets.token_hex(16))


def burn_password_check(password: str) -> None:
    _pwd_context.verify(password, _DUMMY_HASH)


def create_session_token(user_id: int, session_version: int = 0) -> str:
    """`session_version` (User.session_version) entra no token: trocar a
    senha ou gerar novo código de acesso incrementa a versão e todas as
    sessões já abertas daquela pessoa deixam de valer."""
    return _serializer.dumps({"user_id": user_id, "epoch": _SESSION_EPOCH, "sv": session_version})


def read_session_token(token: str) -> tuple[int, int] | None:
    """(user_id, session_version) ou None se inválido/expirado."""
    if not token:
        return None
    try:
        data = _serializer.loads(token, max_age=settings.session_max_age_seconds)
    except (BadSignature, SignatureExpired):
        return None
    if data.get("epoch") != _SESSION_EPOCH or data.get("user_id") is None:
        return None
    return data["user_id"], int(data.get("sv", 0))
