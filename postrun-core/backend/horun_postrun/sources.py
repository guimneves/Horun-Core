"""De onde vêm os arquivos brutos.

- `LocalFolderSource`: uma pasta deste computador — desenvolvimento e testes.
- `AgentSource`: a pasta do PC do equipamento, pelo Agente Horun (produção).
  Usa a cópia do servidor do Agente que todo módulo tem em
  `app/agent_server/` (Agent-Horun/scripts/vendor_server.py).
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from sqlmodel import Session


class SourceError(RuntimeError):
    """Falha de leitura da fonte (Agente fora, pasta inexistente...)."""


class FileSource(Protocol):
    description: str

    def list(self, session: Session, globs: list[str]) -> list[str]: ...

    def read(self, session: Session, path: str) -> bytes: ...


class LocalFolderSource:
    def __init__(self, folder: str | Path):
        self.folder = Path(folder)
        self.description = f"pasta local {self.folder}"

    def list(self, session: Session, globs: list[str]) -> list[str]:
        if not self.folder.is_dir():
            raise SourceError(f"Pasta de dados não encontrada: {self.folder}")
        found: set[str] = set()
        for pattern in globs:
            for p in self.folder.glob(pattern):
                if p.is_file():
                    found.add(p.relative_to(self.folder).as_posix())
        return sorted(found)

    def read(self, session: Session, path: str) -> bytes:
        target = (self.folder / path).resolve()
        if self.folder.resolve() not in target.parents:
            raise SourceError("Caminho fora da pasta de dados")
        try:
            return target.read_bytes()
        except OSError as exc:
            raise SourceError(f"Não foi possível ler {path}: {exc}") from exc


class AgentSource:
    """`root` = nome da pasta liberada no config.json do Agente (EquipmentPlugin.agent_root)."""

    def __init__(self, root: str, *, timeout: float | None = 8.0, chunk_size: int = 4 * 1024 * 1024):
        self.root = root
        self.timeout = timeout
        self.chunk_size = chunk_size
        self.description = f"Agente Horun (pasta '{root}')"

    @staticmethod
    def _bridge():
        try:
            from app.agent_server import bridge  # cópia dentro do módulo
        except ImportError as exc:  # pragma: no cover — módulo sem o servidor do Agente
            raise SourceError(
                "Este módulo não tem o servidor do Agente (app/agent_server) — rode "
                "Agent-Horun/scripts/vendor_server.py ou use POSTRUN_DATA_DIR em desenvolvimento."
            ) from exc
        return bridge

    def list(self, session: Session, globs: list[str]) -> list[str]:
        bridge = self._bridge()
        found: set[str] = set()
        try:
            for pattern in globs:
                found.update(bridge.list_files(session, self.root, pattern, timeout=self.timeout))
        except bridge.AgentTaskError as exc:
            raise SourceError(f"Agente Horun: {exc}") from exc
        return sorted(found)

    def read(self, session: Session, path: str) -> bytes:
        bridge = self._bridge()
        try:
            return bridge.read_bytes(session, self.root, path, timeout=self.timeout, chunk_size=self.chunk_size)
        except bridge.AgentTaskError as exc:
            raise SourceError(f"Agente Horun: {exc}") from exc
