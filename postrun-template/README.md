# Horun · __MODULE_NAME__

PostRun de um equipamento do **Projeto Horun**: mostra os dados assim que saem
do equipamento, trata, liga cada corrida à amostra, valida e publica no
**Resultados**. Gerado pelo modelo de PostRun — leia `Prompt_Horun_PostRun.md`
(no Horun Core) antes de mudar qualquer coisa.

## O que é deste equipamento e o que é comum

| Arquivo | De quem é |
|---|---|
| `backend/app/equipment.py` | **deste equipamento** — leitor do arquivo bruto, parâmetros, tratamento |
| `frontend/src/App.tsx` | **deste equipamento** — o que a tela tem de próprio (`marks`, `detailExtras`) |
| `backend/sample_data/` | **deste equipamento** — arquivos de exemplo SINTÉTICOS para desenvolver e testar |
| `backend/app/postrun_core/` | comum (cópia) — NÃO edite |
| `frontend/src/postrun-core/` | comum (cópia) — NÃO edite |
| `backend/app/agent_server/` | servidor do Agente (cópia) — NÃO edite |

Mudar a parte comum = mudar em `Horun Core/postrun-core/` e copiar de novo para
todos os PostRuns:

```powershell
python "<Horun Core>\scripts\vendor_postrun_core.py" .           # atualiza
python "<Horun Core>\scripts\vendor_postrun_core.py" . --check   # só confere
```

## Desenvolvendo (sem o Core)

```powershell
# backend — lê backend/sample_data/ e guarda as publicações na fila
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
$env:HORUN_DEV_MODE = "true"
uvicorn app.main:app --reload

# frontend (outro terminal) — repassa /api para o backend
cd frontend
npm install
npm run dev
```

Outra pasta de arquivos: `$env:POSTRUN_DATA_DIR = "C:\caminho\dos\arquivos"`
(nunca versione arquivos reais). Testes: `cd backend; python -m pytest -q`.

## Trocando o equipamento de exemplo pelo seu

1. Em `equipment.py`: `technique`, `file_globs`, `agent_root`, `parse` (ou
   `parse_many`), `params`, `treat`, `result_fields`, `suggest_sample_code`.
2. Troque os arquivos de `sample_data/` por arquivos SINTÉTICOS no formato do
   seu equipamento e ajuste os números esperados em `tests/test_postrun_flow.py`.
3. Em `App.tsx`, se o gráfico precisar de marcas (janela de integração etc.).

## Produção (atrás do Core)

Variáveis do backend:

- `MODULE_DATABASE_URL` — Postgres do módulo (com o serviço `db-backup`, como nos outros módulos);
- `POSTRUN_AGENT_MODE=true` — arquivos pelo Agente Horun, pasta `agent_root` liberada no `config.json` dele;
- `POSTRUN_RESULTADOS_URL=http://resultados-backend:8000` e `POSTRUN_RESULTADOS_TOKEN`
  (o mesmo token em `POSTRUN_INGEST_TOKENS` do Resultados);
- opcionais: `POSTRUN_VALIDATE_MAX_LEVEL` (padrão 4 — até técnico valida e publica),
  `POSTRUN_UNPUBLISH_MAX_LEVEL` (padrão 2 — só a coordenação desvalida o que já foi publicado).

Rede, porta estreita do Agente e backup: `Prompt_Horun_Modulo.md`, seções 9 e 10.
