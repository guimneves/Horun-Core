"""Pacote comum dos PostRuns do Horun — um módulo por equipamento
(Prompt_Horun_PostRun.md, no Horun Core).

Peças:
- `plugin`   — o que cada equipamento implementa (EquipmentPlugin, RawRun,
               Signal, ResultValue, Param, ResultField);
- `models`   — tabelas (corrida, tratamento, publicação), prefixo `postrun_`;
- `sources`  — de onde vêm os arquivos: pasta local (desenvolvimento) ou
               Agente Horun (produção);
- `service`  — leitura, tratamento, vínculo, validação e publicação;
- `publish`  — envio ao Resultados (contrato `horun.postrun.result/1`) com
               fila de saída e nova tentativa;
- `routes`   — `build_router(...)`: a API /postrun usada pela interface comum.

NÃO EDITE a cópia dentro de um módulo (`backend/app/postrun_core/`): mude no
Horun Core (`postrun-core/backend/horun_postrun/`) e rode
`scripts/vendor_postrun_core.py` de novo.
"""

PACKAGE_VERSION = "0.1.0"
RESULT_SCHEMA = "horun.postrun.result/1"
