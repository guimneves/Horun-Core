"""Tabelas comuns de todo PostRun (prefixo `postrun_`).

Colunas novas numa versão futura do pacote entram em `MIGRATIONS`, que o
`session.py` do módulo aplica com `_ensure_column` (mesma regra de todo
módulo do Horun — Prompt_Horun_Modulo.md).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# status da corrida
NOVA = "nova"
TRATADA = "tratada"
VALIDADA = "validada"
PUBLICADA = "publicada"


class PostrunFile(SQLModel, table=True):
    """Cada arquivo bruto já visto. Um caminho conhecido não é lido de novo
    a cada varredura (pelo Agente isso custa caro); para reler, use
    "reler arquivo" na corrida ou "tentar de novo" num arquivo com erro."""

    __tablename__ = "postrun_file"

    id: Optional[int] = Field(default=None, primary_key=True)
    path: str = Field(index=True, unique=True)
    content_hash: str = ""
    size: int = 0
    read_at: datetime = Field(default_factory=utcnow)
    run_count: int = 0
    error: str = ""  # vazio = lido sem erro


class PostrunRun(SQLModel, table=True):
    __tablename__ = "postrun_run"

    id: Optional[int] = Field(default=None, primary_key=True)
    # caminho do arquivo + "#chave" quando o arquivo tem várias corridas —
    # identifica a corrida para sempre (vai no `source_key` do Resultados)
    source_key: str = Field(index=True, unique=True)
    source_path: str = Field(index=True)
    run_key: str = ""
    content_hash: str = ""
    sample_label: str = Field(default="", index=True)
    acquired_at: Optional[datetime] = Field(default=None, index=True)
    read_at: datetime = Field(default_factory=utcnow)
    # sinais, metadados e valores do arquivo (JSON) — ver service.raw_to_json
    data_json: str = "{}"
    # o arquivo mudou depois que a corrida já estava validada: os dados novos
    # foram guardados, mas a validação/publicação continua sendo da leitura anterior
    source_changed: bool = False

    status: str = Field(default=NOVA, index=True)
    treatment_id: Optional[int] = None

    sample_code: str = Field(default="", index=True)
    project_code: str = ""
    linked_by: str = ""
    linked_at: Optional[datetime] = None

    validated_by: str = ""
    validated_at: Optional[datetime] = None

    published_version: int = 0  # última versão enviada (ou na fila) ao Resultados


class PostrunTreatment(SQLModel, table=True):
    """Histórico de tratamentos — nunca apagado; a corrida aponta o atual."""

    __tablename__ = "postrun_treatment"

    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="postrun_run.id", index=True)
    params_json: str = "{}"
    values_json: str = "[]"
    created_by: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class PostrunOutbox(SQLModel, table=True):
    """Fila de saída para o Resultados: cada publicação ou retirada é uma
    linha; quem não foi entregue é reenviado depois (publish.retry_pending)."""

    __tablename__ = "postrun_outbox"

    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="postrun_run.id", index=True)
    source_key: str = Field(index=True)
    version: int
    retracted: bool = False
    payload_json: str = "{}"
    state: str = Field(default="pendente", index=True)  # pendente | enviado
    answer: str = ""  # stored | ignored | retracted (resposta do Resultados)
    attempts: int = 0
    last_error: str = ""
    created_by: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    sent_at: Optional[datetime] = None


# (tabela, coluna, tipo SQL, default) — colunas adicionadas depois da 0.1.0
MIGRATIONS: list[tuple[str, str, str, str | None]] = []
