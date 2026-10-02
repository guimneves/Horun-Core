# Horun · __MODULE_NAME__

Módulo do **Projeto Horun**. Gerado a partir do template padrão — ver `../Prompt_Horun_Core.md` (arquitetura da plataforma) e `../Prompt_Horun_Modulo.md` (contrato completo de módulo).

## Estrutura

```
backend/    API FastAPI + SQLModel, própria deste módulo
frontend/   React + Vite + Tailwind, usa @horun/design-system para tema/identidade visual
MODULE.md   Manifesto lido pelo Horun Core (nome, ícone, porta, health check)
```

## Desenvolvendo de forma independente (sem o Horun Core rodando)

```powershell
# backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
$env:HORUN_DEV_MODE = "true"
uvicorn app.main:app --reload

# frontend (outro terminal)
cd frontend
npm install
npm run dev
```

Com `HORUN_DEV_MODE=true`, o backend usa um usuário fixo (admin de desenvolvimento) em vez de exigir os cabeçalhos de identidade que só o Core injeta em produção — dá pra desenvolver e testar o módulo inteiro isolado.

## Plugando no Horun (quando estiver pronto)

1. Remover `HORUN_DEV_MODE` do ambiente de produção — o backend passa a exigir identidade vinda do Core.
2. Adicionar o serviço deste módulo ao `docker-compose.yml` do servidor (backend sem porta exposta ao host — só alcançável pelo Core, mesma regra do RE7S).
3. O administrador cadastra o módulo no painel de Administração do Core, a partir dos dados do `MODULE.md` (o cadastro é manual — o Core não lê o arquivo sozinho).

## Regras que já vêm prontas neste esqueleto (não desfaça)

- **Dependências com versão exata** em `backend/pyproject.toml` — para atualizar, mude a versão, rode `pytest`, só então suba.
- **Migração defensiva** em `backend/app/db/session.py`: todo campo novo num modelo que já tem tabela em produção ganha uma linha de `_ensure_column` em `_run_migrations`, **no mesmo commit**.
- **Design-system por cópia** em `frontend/vendor/horun-design-system/` — não edite; para atualizar, rode `python <Horun Core>/scripts/vendor_design_system.py frontend` (com `--check` só confere).
- **Backup do Postgres** em produção: serviço `db-backup` com `deploy/backup/pg_backup.sh` (ver `Prompt_Horun_Modulo.md`, seção 9).
- Portas do compose de desenvolvimento só em `127.0.0.1` (o modo dev não tem login).
