"""O que cada equipamento implementa (`backend/app/equipment.py` do módulo).

Um PostRun só precisa saber LER o arquivo bruto do seu equipamento e, se
houver, TRATAR os dados. Todo o resto (banco, lista, gráfico, vínculo,
validação, publicação) é comum — ver `service.py` e `routes.py`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal


@dataclass
class Signal:
    """Uma curva da corrida (ex.: sinal × tempo). `x`/`y` do mesmo tamanho."""

    name: str
    x: list[float]
    y: list[float]
    x_label: str = "tempo (s)"
    y_label: str = "sinal"
    # curva auxiliar com eixo à direita (ex.: rampa de temperatura × tempo)
    secondary: bool = False


@dataclass
class ResultValue:
    name: str  # chave estável (ex.: "C", "S2", "area")
    value: float | None
    unit: str = ""
    label: str = ""  # nome para pessoas (ex.: "Carbono")
    uncertainty: float | None = None


@dataclass
class RawRun:
    """Uma corrida lida do arquivo bruto."""

    run_key: str  # único dentro do arquivo (ex.: número da posição); "" se o arquivo é uma corrida só
    sample_label: str  # como o operador digitou no equipamento
    acquired_at: datetime | None = None
    signals: list[Signal] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    # valores que o próprio equipamento já calculou (usados pelo `treat` padrão)
    values: list[ResultValue] = field(default_factory=list)


@dataclass
class Param:
    """Parâmetro do tratamento — a interface monta o formulário sozinha."""

    name: str
    label: str
    kind: Literal["number", "choice", "bool"] = "number"
    default: Any = None
    unit: str = ""
    choices: list[str] = field(default_factory=list)
    help: str = ""


@dataclass
class ResultField:
    name: str
    label: str
    unit: str = ""
    decimals: int = 2


class EquipmentPlugin:
    """Base de todo equipamento. Sobrescreva o que precisar."""

    id: str = "equipamento"
    name: str = "Equipamento"
    technique: str = "tecnica"
    file_globs: list[str] = ["**/*"]
    # pasta liberada no config.json do Agente para este módulo
    agent_root: str = "dados"
    # data/hora SEM fuso no arquivo = hora local do laboratório (Brasília,
    # sem horário de verão desde 2019)
    local_utc_offset_hours: float = -3.0
    params: list[Param] = []
    result_fields: list[ResultField] = []

    def parse_many(self, path: str, content: bytes) -> list[RawRun]:
        """Arquivo -> corridas. Padrão: uma corrida por arquivo (`parse`)."""
        return [self.parse(path, content)]

    def parse(self, path: str, content: bytes) -> RawRun:
        raise NotImplementedError("o equipamento precisa implementar parse() ou parse_many()")

    def treat(self, run: RawRun, params: dict[str, Any]) -> list[ResultValue]:
        """Padrão: os valores que o próprio arquivo já traz."""
        return list(run.values)

    def suggest_sample_code(self, sample_label: str) -> str:
        """Sugestão de código da amostra a partir do rótulo do arquivo —
        sobrescreva com a regra do equipamento (ex.: tirar sufixo de réplica)."""
        return sample_label.strip()

    def default_params(self) -> dict[str, Any]:
        return {p.name: p.default for p in self.params}

    def describe(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "technique": self.technique,
            "params": [p.__dict__ for p in self.params],
            "result_fields": [f.__dict__ for f in self.result_fields],
        }
