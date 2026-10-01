# Horun Core

Plataforma de gestão do parque analítico do laboratório NQTR (IQ-UFRJ): um **módulo por equipamento** (Rock-Eval, Amostras, Reagentes...), todos plugados nesta camada central, que cuida de login único, permissões, identidade visual, Mural, Agenda, Equipamentos e Colaboradores.

## Documentação

| Arquivo | Pra quê |
|---|---|
| este `README.md` | Configurar a máquina, rodar, fazer deploy, como a equipe trabalha |
| [`Prompt_Horun_Core.md`](Prompt_Horun_Core.md) | Arquitetura, decisões, o que já existe, lições aprendidas, pendências e infraestrutura do servidor (seção 9) |
| [`Prompt_Horun_Modulo.md`](Prompt_Horun_Modulo.md) | Contrato de módulo, autocontido — cole em outro chatbot pra construir um módulo novo |
| [`design-system/README.md`](design-system/README.md) | Pacote visual compartilhado entre os módulos |
| [`module-template/`](module-template/) | Esqueleto de módulo novo (usado por `create_horun_module.py`) |

Repositórios relacionados: [RE7S-Horun](https://github.com/guimneves/RE7S-Horun) (módulo do Rock-Eval 7S — comece por `Prompt_refinado.md` e pelo README de lá).

Antes de mexer numa área que você não conhece, leia a seção relevante do `Prompt_Horun_Core.md` — em especial a **8.2 (lições aprendidas)**. Se estiver usando Claude Code, peça pra ele ler antes de começar.

## Estrutura

```
backend/          API FastAPI + SQLModel — auth, módulos, permissões, proxy, mural, agenda...
frontend/         React + Vite + Tailwind — login, mural, agenda, equipamentos, administração
design-system/    Identidade visual compartilhada com todos os módulos
module-template/  Esqueleto padrão para criar um módulo novo
deploy/           Dockerfile do proxy (Caddy) + Caddyfile
create_horun_module.py   Gerador de módulo (usa module-template/)
```

## 1. Preparar a máquina

| Ferramenta | Pra quê | Onde baixar |
|---|---|---|
| **Git** | Clonar e versionar | [git-scm.com/download/win](https://git-scm.com/download/win) |
| **Python 3.11+** | Backend | [python.org/downloads](https://www.python.org/downloads/) — marque "Add python.exe to PATH" |
| **Node.js LTS** | Frontend | [nodejs.org](https://nodejs.org/) |
| **Docker Desktop** | Só pra deploy/infraestrutura | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **VS Code** (recomendado) | Editor | [code.visualstudio.com](https://code.visualstudio.com/) |

Feche e abra o PowerShell e confira que todos respondem com uma versão: `git --version`, `python --version`, `node --version`, `npm --version`.

**GitHub**: aceite o convite de colaborador (os repositórios são privados) e configure seu nome no Git — `git config --global user.name "Seu Nome"` e `git config --global user.email "seu-email@exemplo.com"`. No primeiro `git push` o Windows abre o login do GitHub no navegador.

## 2. Rodando localmente (desenvolvimento)

```powershell
git clone https://github.com/guimneves/Horun-Core.git

# backend
cd Horun-Core\backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
$env:CORE_BOOTSTRAP_ADMIN_USERNAME = "admin"
$env:CORE_BOOTSTRAP_ADMIN_PASSWORD = "escolha-uma-senha"
uvicorn app.main:app --reload --port 8100

# frontend (outro terminal)
cd Horun-Core\frontend
npm install
# aponta o front pro backend na porta 8100 (padrão do client.ts é 8000)
"VITE_API_BASE_URL=http://localhost:8100" | Out-File -Encoding utf8 .env.development.local
npm run dev
```

Acesse `http://localhost:5174` e entre com o usuário/senha de bootstrap. Essa conta é o **administrador original** (`Prompt_Horun_Core.md`, seção 6) — cadastra módulos, usuários e concede permissões.

**Testes** (backend):
```powershell
cd backend
.venv\Scripts\python -m pytest
```

## 3. Deploy em produção (Docker)

No PC dedicado (qualificado pelo checklist do `Prompt_Horun_Core.md`, seção 9.2):

```powershell
# uma vez só, antes do primeiro deploy de qualquer projeto Horun nesta máquina
docker network create horun-network

git clone https://github.com/guimneves/Horun-Core.git
cd Horun-Core
copy .env.example .env
notepad .env   # POSTGRES_PASSWORD, CORE_SECRET_KEY, credenciais do admin, SMTP_* (opcional)

docker compose up -d --build
```

Acesse `https://<IP-da-máquina>` (aceite o certificado self-signed uma vez). Para atualizar: `git pull` + `docker compose up -d --build` — e lembre que a migração automática de colunas só roda quando o backend **reinicia de verdade** (`Prompt_Horun_Core.md`, 8.2).

## 4. Como trabalhamos juntos (Git)

Ninguém da equipe commita direto na `main` — cada tarefa vira uma branch e um Pull Request:

```powershell
git checkout main
git pull
git checkout -b seu-nome/o-que-voce-esta-fazendo   # ex. maria/campos-de-perfil
# ... edita, roda testes ...
git add -A
git commit -m "Descrição curta do que mudou"
git push -u origin seu-nome/o-que-voce-esta-fazendo
```

No GitHub, abra o Pull Request pra `main` (botão "Compare & pull request"), descrevendo o que mudou e por quê. Assim duas pessoas (ou duas sessões de Claude Code) trabalham em paralelo sem sobrescrever uma à outra — o Git mostra qualquer conflito no merge.

**Segredos**: o `.env` (copiado de `.env.example`) **nunca** é versionado — já está no `.gitignore`. Se o Git oferecer um `.env` pra commitar, pare e chame alguém.

**Dúvidas**: travou num passo ou apareceu um erro sem sentido — não adivinhe. Chame o Guilherme, ou descreva o erro completo pro Claude Code antes de tentar resolver.
