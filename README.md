# Horun Core

Login único, cadastro de módulos, permissões e gateway da plataforma **Horun** — ver [`Prompt_Horun_Core.md`](Prompt_Horun_Core.md) para a arquitetura completa.

## Estrutura

```
backend/          API FastAPI + SQLModel — auth, módulos, permissões, proxy
frontend/         React + Vite + Tailwind — login, dashboard, administração
design-system/    Identidade visual compartilhada com todos os módulos
module-template/  Esqueleto padrão para criar um módulo novo
create_horun_module.py   Script gerador (usa module-template/)
Prompt_Horun_Modulo.md   Contrato de módulo, autocontido, para colar em outro chatbot
```

## Rodando localmente (desenvolvimento)

```powershell
# backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
$env:CORE_BOOTSTRAP_ADMIN_USERNAME = "admin"
$env:CORE_BOOTSTRAP_ADMIN_PASSWORD = "escolha-uma-senha"
uvicorn app.main:app --reload --port 8100

# frontend (outro terminal)
cd frontend
npm install
# aponta o front pro backend na porta 8100 (padrão do client.ts é 8000)
"VITE_API_BASE_URL=http://localhost:8100" | Out-File -Encoding utf8 .env.development.local
npm run dev
```

Acesse `http://localhost:5174` e entre com o usuário/senha de bootstrap. A conta criada assim é o **administrador máximo** (seção 6 do `Prompt_Horun_Core.md`) — só ela cadastra módulos, usuários e concede permissões.

## Deploy em produção (Docker)

No PC dedicado (ver `../Horun Fase 2/Prompt_Fase2.md`, seção 2.1 para qualificar a máquina):

```powershell
# uma vez só, antes do primeiro deploy de qualquer projeto Horun nesta máquina
docker network create horun-network

git clone https://github.com/guimneves/Horun-Core.git
cd Horun-Core
copy .env.example .env
notepad .env   # preencher POSTGRES_PASSWORD, CORE_SECRET_KEY, credenciais do admin

docker compose up -d --build
```

Acesse `https://<IP-da-máquina>` no navegador (vai pedir pra aceitar o certificado self-signed — ver `Prompt_Fase2.md`, seção 4) e entre com o usuário/senha de bootstrap definidos no `.env`.

## Testes

```powershell
cd backend
.venv\Scripts\python -m pytest
```

## Estado atual (ver seção 8 do `Prompt_Horun_Core.md` para a lista completa)

Implementado: login com sessão em cookie, cadastro de módulos, permissões por usuário↔módulo, dashboard de status (health check agregado), proxy de API com injeção de identidade (`/m/{id}/...`).

Ainda não implementado: importação automática de usuários do AD, acesso a pastas do `nqtrmaster`, e o encaixe da *interface* de um módulo dentro do Core (hoje o dashboard mostra status/permissão, mas "Abrir" ainda não navega pra dentro do módulo — falta resolver o base path da SPA de cada módulo).
