import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.api.deps import get_session
from app.core.security import hash_password
from app.db.models import User
from app.main import app


@pytest.fixture()
def db_engine():
    # StaticPool: um único SQLite em memória compartilhado entre todas as
    # conexões deste engine — sem isso, cada Session(db_engine) abriria um
    # banco em memória *diferente* e as tabelas "sumiriam" entre chamadas.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture()
def app_with_overrides(db_engine):
    def _get_session_override():
        with Session(db_engine) as s:
            yield s

    app.dependency_overrides[get_session] = _get_session_override
    yield app
    app.dependency_overrides.clear()


@pytest.fixture()
def client(app_with_overrides):
    with TestClient(app_with_overrides) as c:
        yield c


def _create_user(db_engine, username: str, password: str, is_super_admin: bool = False, is_protected: bool = False) -> User:
    with Session(db_engine) as s:
        user = User(
            username=username,
            password_hash=hash_password(password),
            display_name=username,
            is_super_admin=is_super_admin,
            is_protected=is_protected,
        )
        s.add(user)
        s.commit()
        s.refresh(user)
        return user


def _login(app_with_overrides, username: str, password: str) -> TestClient:
    # Cada cliente "logado" tem seu próprio cookie jar — importante para
    # testes que comparam permissões entre dois usuários diferentes.
    c = TestClient(app_with_overrides)
    r = c.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture()
def super_admin_user(db_engine) -> User:
    return _create_user(db_engine, "superadmin", "senha-super", is_super_admin=True, is_protected=True)


@pytest.fixture()
def super_admin_client(app_with_overrides, super_admin_user):
    return _login(app_with_overrides, "superadmin", "senha-super")


@pytest.fixture()
def user_a(db_engine) -> User:
    return _create_user(db_engine, "usuario-a", "senha-a")


@pytest.fixture()
def user_a_client(app_with_overrides, user_a):
    return _login(app_with_overrides, "usuario-a", "senha-a")


@pytest.fixture()
def user_b(db_engine) -> User:
    return _create_user(db_engine, "usuario-b", "senha-b")


@pytest.fixture()
def user_b_client(app_with_overrides, user_b):
    return _login(app_with_overrides, "usuario-b", "senha-b")
