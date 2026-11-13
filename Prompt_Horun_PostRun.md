# Horun · PostRun — um módulo por equipamento

Decisão de 13/11/2026 (revisão crítica da arquitetura do Horun). Complementa
`Prompt_Horun_Modulo.md` (contrato de todo módulo) — aqui está só o que é
próprio dos PostRuns.

## 1. Papel de cada peça

```
Equipamento ──(Agente)──► PostRun do equipamento ──(resultado tratado)──► Resultados
                          • vê os dados assim que saem                     • só leitura
                          • trata (integração, calibração…)                • correlaciona técnicas,
                          • valida e gerencia os resultados                   amostras e projetos
                          • liga cada corrida à amostra                    • acervo do laboratório
```

- **PostRun** (um módulo por equipamento: `postrun-chnso`, `postrun-leco`,
  `postrun-rockeval`…): é a ÚNICA fonte da verdade de um resultado. Lê o
  arquivo bruto, mostra, trata, liga à amostra, valida e publica.
- **Resultados**: recebe resultados já tratados e validados. Não altera
  valores — mostra, filtra, correlaciona e exporta. Corrigir um resultado =
  corrigir no PostRun, que publica de novo (nova versão substitui a anterior).
- **Módulos de operação** (ex.: RE7S — fila, carrossel, TABSAMPLE) continuam
  sendo exceções do equipamento; o pós-corrida sai deles para o PostRun.

## 2. Como um PostRun é feito

| Peça | Onde mora | Vai para o módulo como |
|---|---|---|
| Pacote comum `horun_postrun` (backend) | `Horun Core/postrun-core/backend/horun_postrun/` | cópia em `backend/app/postrun_core/` |
| Interface comum (frontend) | `Horun Core/postrun-core/frontend/` | cópia em `frontend/src/postrun-core/` |
| Modelo do módulo | `Horun Core/postrun-template/` | gerado por `create_horun_module.py --template postrun` |
| Específico do equipamento | `backend/app/equipment.py` do módulo | escrito à mão |

A parte comum é **copiada** (como o design system e o servidor do Agente):
o build Docker do módulo só enxerga o próprio repositório. A cópia leva um
carimbo de versão; `scripts/vendor_postrun_core.py <módulo> --check` diz se
está desatualizada. **Nunca edite a cópia** — mude em `postrun-core/` e
copie de novo para todos os PostRuns.

### O que o equipamento precisa escrever (`equipment.py`)

Uma subclasse de `EquipmentPlugin`:

- `id`, `name`, `technique` (ex.: `chnso`) e `file_globs` (ex.: `["**/*.csv"]`);
- `parse(path, content) -> RawRun`: lê o arquivo bruto — chave da corrida,
  data, rótulo da amostra como veio no arquivo, sinais (curvas x/y) e
  metadados. Uma corrida por arquivo, ou várias (`parse_many`);
- `params`: parâmetros do tratamento (número, escolha, sim/não) — a tela
  monta o formulário sozinha;
- `treat(run, params) -> list[ResultValue]`: o tratamento. Sem tratamento
  (o arquivo já traz os valores), devolve os valores do próprio arquivo;
- `result_fields`: nome, rótulo, unidade e casas decimais de cada valor.

Todo o resto — leitura pelo Agente, banco, lista de corridas, gráfico,
tratamento, vínculo, validação, publicação, reenvio — vem do pacote comum.

## 3. Ciclo de vida de uma corrida

```
nova ──tratar──► tratada ──validar──► validada ──publicar──► publicada
  ▲                 │ ▲                   │                      │
  └── reprocessar ──┘ └──── desvalidar ───┴──────────────────────┘
```

- **nova**: arquivo lido (pelo Agente ou de uma pasta local, em desenvolvimento).
  O mesmo arquivo com o mesmo conteúdo não é lido de novo; conteúdo diferente
  com o mesmo caminho vira nova leitura da mesma corrida.
- **tratada**: valores calculados com os parâmetros escolhidos (histórico de
  todos os tratamentos fica guardado).
- **validada**: alguém confirmou os valores e a amostra. Trava o tratamento.
- **publicada**: enviada ao Resultados. Desvalidar uma corrida publicada
  manda ao Resultados a **retirada** do resultado; ao validar e publicar de
  novo, vai uma versão nova.

**Vínculo com a amostra**: o arquivo traz um rótulo (como o operador digitou);
o PostRun sugere o código da amostra e a pessoa confirma. O código é o da
amostra no laboratório (hoje, o código usado no Resultados; quando o cadastro
central de amostras existir no Core, o código de lá). Projeto é opcional.

**Permissões** (padrão, ajustável por módulo em `POSTRUN_*_MAX_LEVEL`):
ver e tratar — todos com acesso ao módulo; validar e publicar — níveis 1–4
(até técnico); desvalidar o que já foi publicado — níveis 1–2.

## 4. Contrato PostRun → Resultados (`horun.postrun.result/1`)

`POST http://<resultados-backend>/api/internal/postrun/results`, pela
`horun-network` (nunca pelo gateway), com `Authorization: Bearer <token>`.
O token é por módulo: o Resultados guarda `POSTRUN_INGEST_TOKENS`
(`postrun-chnso:<token>,postrun-leco:<token>`) e confere que o `module` do
corpo é o dono do token.

```json
{
  "schema": "horun.postrun.result/1",
  "module": "postrun-chnso",
  "equipment": "CHNSO",
  "technique": "chnso",
  "source_key": "postrun-chnso:2026-11-13/run_0042.csv#3",
  "version": 2,
  "retracted": false,
  "sample_code": "HP300N-A",
  "project_code": "Hidropirolise",
  "sample_label": "hp300na",
  "acquired_at": "2026-11-13T14:02:00Z",
  "validated_at": "2026-11-13T16:10:00Z",
  "validated_by": "fulano",
  "values": [
    {"name": "C", "label": "Carbono", "value": 71.25, "unit": "%", "uncertainty": null}
  ],
  "treatment": {"params": {"baseline": "linear"}, "postrun_core": "0.1.0"},
  "link": "/m/postrun-chnso/?run=42"
}
```

- `source_key` identifica a corrida para sempre; reenviar com `version` maior
  **substitui**; versão igual ou menor é ignorada (reenvio repetido não duplica).
- `retracted: true` (com `source_key` e `version`) tira o resultado do acervo.
- Resposta `200 {"status": "stored" | "ignored" | "retracted"}`; qualquer
  outra coisa = falha, e o PostRun tenta de novo sozinho (fila de saída com
  nova tentativa a cada 5 minutos) e mostra "envio pendente" na corrida.

## 5. Ordem de implantação

1. Pacote comum + modelo + equipamento de exemplo (dados sintéticos). ✅ 13/11/2026
2. Rota de recebimento no Resultados (só leitura para o que vem de PostRun).
3. Primeiro PostRun real: um equipamento simples (CHNSO ou LECO), movendo o
   leitor dele do Resultados para o PostRun.
4. PostRun Rock-Eval: o PostRun que hoje está dentro do RE7S migra para o modelo.
5. Os demais leitores do Resultados migram, um equipamento por vez; o
   Resultados deixa de importar arquivo bruto.
