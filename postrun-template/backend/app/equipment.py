"""O que é PRÓPRIO deste equipamento — o único arquivo que muda de um
PostRun para outro (Prompt_Horun_PostRun.md, seção 2).

Este é o EQUIPAMENTO DE EXEMPLO do modelo: lê um CSV sintético
(`sample_data/`) com uma curva sinal × tempo e a temperatura do forno, e
integra o pico numa janela. Troque pelo leitor e pelo tratamento do seu
equipamento: `parse` (ou `parse_many`, se um arquivo tiver várias
corridas), `params`, `treat`, `result_fields` e, se precisar,
`suggest_sample_code`.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from app.postrun_core.plugin import EquipmentPlugin, Param, RawRun, ResultField, ResultValue, Signal


def _header(lines: list[str], key: str) -> str:
    for line in lines:
        m = re.match(rf"#\s*{key}\s*:\s*(.*)$", line, flags=re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return ""


class ExemploEquipment(EquipmentPlugin):
    id = "__MODULE_ID__"
    name = "__MODULE_NAME__"
    technique = "exemplo"
    file_globs = ["**/*.csv"]
    agent_root = "__MODULE_ID__"

    params = [
        Param("t_ini", "Início da integração", "number", 60.0, unit="s"),
        Param("t_fim", "Fim da integração", "number", 540.0, unit="s"),
        Param("baseline", "Linha de base", "choice", "linear", choices=["linear", "minimo", "nenhuma"],
              help="linear: reta entre o início e o fim da janela; mínimo: o menor sinal da janela"),
    ]
    result_fields = [
        ResultField("area", "Área", "sinal·s", 1),
        ResultField("altura", "Altura do pico", "sinal", 1),
        ResultField("t_pico", "Tempo do pico", "s", 0),
        ResultField("T_pico", "Temperatura do pico", "°C", 0),
    ]

    def parse(self, path: str, content: bytes) -> RawRun:
        text = content.decode("utf-8-sig", errors="replace")
        lines = text.splitlines()
        header = [ln for ln in lines if ln.startswith("#")]
        rows = [ln for ln in lines if ln.strip() and not ln.startswith("#")]
        if not rows or not rows[0].lower().startswith("tempo"):
            raise ValueError("cabeçalho 'tempo_s;sinal;temperatura_c' não encontrado")
        t, y, temp = [], [], []
        for ln in rows[1:]:
            parts = [p.strip().replace(",", ".") for p in ln.split(";")]
            t.append(float(parts[0]))
            y.append(float(parts[1]))
            temp.append(float(parts[2]) if len(parts) > 2 and parts[2] else float("nan"))
        acquired = _header(header, "data")
        return RawRun(
            run_key="",
            sample_label=_header(header, "amostra"),
            acquired_at=datetime.fromisoformat(acquired) if acquired else None,
            signals=[
                Signal("sinal", t, y, "tempo (s)", "sinal"),
                Signal("temperatura", t, temp, "tempo (s)", "temperatura (°C)", secondary=True),
            ],
            metadata={"operador": _header(header, "operador"), "massa_mg": _header(header, "massa_mg")},
        )

    def treat(self, run: RawRun, params: dict[str, Any]) -> list[ResultValue]:
        sig = next(s for s in run.signals if s.name == "sinal")
        temp = next((s for s in run.signals if s.name == "temperatura"), None)
        t0, t1 = float(params["t_ini"]), float(params["t_fim"])
        if t1 <= t0:
            raise ValueError("o fim da integração precisa ser depois do início")
        idx = [i for i, x in enumerate(sig.x) if t0 <= x <= t1]
        if len(idx) < 2:
            raise ValueError("a janela de integração tem menos de 2 pontos")
        xs = [sig.x[i] for i in idx]
        ys = [sig.y[i] for i in idx]
        if params["baseline"] == "linear":
            slope = (ys[-1] - ys[0]) / (xs[-1] - xs[0])
            base = [ys[0] + slope * (x - xs[0]) for x in xs]
        elif params["baseline"] == "minimo":
            base = [min(ys)] * len(ys)
        else:
            base = [0.0] * len(ys)
        net = [y - b for y, b in zip(ys, base)]
        area = sum((net[i] + net[i + 1]) / 2 * (xs[i + 1] - xs[i]) for i in range(len(xs) - 1))
        k = max(range(len(net)), key=net.__getitem__)
        t_peak = xs[k]
        T_peak = temp.y[idx[k]] if temp else None
        return [
            ResultValue("area", area, "sinal·s", "Área"),
            ResultValue("altura", net[k], "sinal", "Altura do pico"),
            ResultValue("t_pico", t_peak, "s", "Tempo do pico"),
            ResultValue("T_pico", T_peak, "°C", "Temperatura do pico"),
        ]

    def suggest_sample_code(self, sample_label: str) -> str:
        # exemplo de regra: "HP300N-A_2" (réplica 2) -> "HP300N-A"
        return re.sub(r"_\d+$", "", sample_label.strip())


EQUIPMENT = ExemploEquipment()
