# Prompt — Construir um módulo compatível com o Horun

> Cole este documento inteiro na conversa com o seu assistente de IA (Claude, ChatGPT, Gemini, etc.), junto com o manual/POP do equipamento para o qual você quer construir um módulo. Ele descreve o contrato completo que o código gerado precisa seguir para depois ser "plugado" na plataforma **Horun** (sistema de gestão do parque analítico do laboratório NQTR, IQ-UFRJ). Você não precisa ter acesso ao restante do código do Horun para seguir este documento — ele é autocontido.

## 1. Contexto

O Horun é uma plataforma modular: **um módulo por equipamento de laboratório** (ex. Rock-Eval, LECO TOC/TC). Cada módulo é um app web completo e independente — próprio backend, próprio banco de dados, próprio frontend — que roda sozinho durante o desenvolvimento e depois é "plugado" atrás de um gateway central (o **Horun Core**), que cuida de login único, permissões e visual consistente entre módulos.

**Seu trabalho é construir só o módulo**, seguindo a estrutura e as convenções abaixo, para que ele encaixe sem retrabalho quando for entregue ao mantenedor do Horun.

## 2. Antes de codificar — elicitação, não suposição

Siga o mesmo método já usado nos outros módulos do Horun: leia o manual/POP do equipamento fornecido, e para qualquer regra de negócio que não esteja 100% clara no documento (nomenclatura de posições, formato de arquivo de importação, fluxo de calibração, papéis de usuário, etc.), **pergunte ao usuário antes de implementar**, em vez de assumir. Não invente valores, campos ou regras que não estejam no manual ou confirmados pelo usuário.

## 3. Estrutura de pastas obrigatória

```
<nome-do-modulo>/
  README.md
  MODULE.md
  .gitignore
  .gitattributes          # *.sh text eol=lf
  docker-compose.yml
  deploy/
    backup/pg_backup.sh   # backup do Postgres (seção 9)
  backend/
    pyproject.toml
    Dockerfile
    .dockerignore
    app/
      __init__.py
      main.py
      core/
        __init__.py
        config.py
        identity.py
      api/
        __init__.py
        routes_*.py
      db/
        session.py        # engine + migração defensiva (seção 7)
    tests/
  frontend/
    package.json
    vite.config.ts
    index.html
    tsconfig.json / tsconfig.app.json / tsconfig.node.json
    vendor/
      horun-design-system/  # cópia do design-system do Core (seção 6), se usar
    src/
      main.tsx
      App.tsx
      index.css
      ...
```

O jeito mais rápido de começar com tudo isso certo é gerar o esqueleto a partir do Horun Core: `python create_horun_module.py` (usa o `module-template/`, já com banco, migração, testes, backup e design-system).

## 4. `MODULE.md` — manifesto do módulo

Arquivo texto simples na raiz, assim:

```markdown
# <Nome público do módulo>

- **id**: `<slug-minusculo-sem-espacos>`
- **nome público**: Horun · <Nome>
- **descrição**: <uma frase>
- **ícone**: <um emoji>
- **porta interna do backend**: 8000
- **health check**: `GET /health`
```

**Sem campo de codinome interno aqui.** Já aconteceu de módulos entregues incluírem uma linha "codinome interno: <nome>" neste arquivo por conta própria — remover se aparecer. O manifesto só leva o nome público (regra em `Prompt_Horun_Core.md`, seção 2).

## 5. Contrato de backend

**Stack**: Python 3.11+, FastAPI, SQLModel (SQLAlchemy), Pydantic. Banco: SQLite em desenvolvimento, PostgreSQL em produção (a URL de conexão vem de uma variável de ambiente, nunca hardcoded).

**Endpoint de saúde, sem autenticação** (`app/main.py`):
```python
@app.get("/health")
def health():
    return {"status": "ok", "module": "<id-do-modulo>"}
```

**Identidade do usuário — via cabeçalhos confiáveis, não login próprio** (`app/core/identity.py`). Em produção, o módulo roda atrás do gateway do Horun Core e nunca é exposto direto à rede — o Core já validou o login e repassa a identidade por cabeçalhos HTTP internos. Implemente exatamente este padrão:

```python
import os
from dataclasses import dataclass
from fastapi import Header, HTTPException, status

DEV_MODE = os.environ.get("HORUN_DEV_MODE", "false").lower() == "true"

@dataclass
class HorunIdentity:
    user_id: str
    username: str
    role: str

def get_identity(
    x_horun_user_id: str | None = Header(default=None),
    x_horun_user: str | None = Header(default=None),
    x_horun_role: str | None = Header(default=None),
) -> HorunIdentity:
    if DEV_MODE:
        return HorunIdentity(user_id="dev", username="dev", role="admin")
    if not x_horun_user_id or not x_horun_user or not x_horun_role:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Identidade não informada.")
    return HorunIdentity(user_id=x_horun_user_id, username=x_horun_user, role=x_horun_role)
```

Use `Depends(get_identity)` nas rotas que precisam saber quem é o usuário — **não implemente seu próprio sistema de login/senha/cookie de sessão**, isso é responsabilidade do Core, não do módulo. Com `HORUN_DEV_MODE=true` no ambiente, o módulo roda sozinho, sem o Core, com um usuário fixo — é assim que você desenvolve e testa localmente.

**O que cada cabeçalho significa**:

| Cabeçalho | Valor | Uso |
|---|---|---|
| `X-Horun-User-Id` | id numérico do usuário no Core | chave estável da pessoa (use este, não o nome, para guardar autoria) |
| `X-Horun-User` | nome de usuário (slug, sem espaço nem acento) | exibição, menções |
| `X-Horun-Role` | `admin` ou `user` | `admin` = coordenador ou administrador máximo do Core |
| `X-Horun-Level` | `1` a `5` | **opcional** — nível de permissão do Core: 1 administrador máximo, 2 coordenador, 3 pesquisador, 4 técnico, 5 iniciação científica (ou sem posição) |
| `X-Horun-Level-Name` | `admin`, `coordenador`, `pesquisador`, `tecnico` ou `ic` | **opcional** — o mesmo nível, por nome (sem acento) |

Os dois últimos existem desde 2026-10-01 e **não são obrigatórios**: um módulo que só olha `X-Horun-Role` continua funcionando igual. Use o nível só se o módulo quiser diferenciar, por exemplo, técnico de IC. Para lê-los, acrescente `x_horun_level`/`x_horun_level_name` ao `get_identity` (o `module-template` já traz os campos `level`/`level_name`, com 5/`ic` como padrão quando o cabeçalho não vem).

**Nomes reservados**: o Core descarta qualquer `X-Horun-User-Id`, `X-Horun-User`, `X-Horun-Role`, `X-Horun-Level` ou `X-Horun-Level-Name` que venha do navegador e injeta os verdadeiros. Outros cabeçalhos `X-Horun-*` do próprio módulo (ex. `X-Horun-Coordenador-Token` do Financeiro) passam normalmente. O cookie de sessão do Core (`horun_core_session`) **não** é repassado ao módulo. Isso só protege o módulo se ele **nunca for alcançável por fora do Core** — nenhuma porta publicada no host (regra do item 3).

**Dependências com versão EXATA** no `pyproject.toml` (`fastapi==0.141.1`, nunca `fastapi>=0.115`). O Dockerfile reinstala tudo do PyPI a cada `docker compose up --build` — com faixa aberta, cada rebuild pode trazer uma versão nova sem ninguém saber. Isso já derrubou o Horun Core em produção (uma versão nova do SQLModel mudou o tratamento de datas). Para atualizar uma dependência: mude a versão, rode a suíte de testes, só então suba. Use as mesmas versões do `module-template` do Horun Core.

**Segredos sem valor padrão**: nada de `os.environ.get("MODULE_SECRET_KEY", "dev-only-...")` que funcione em produção. Se a chave faltar (ou for a de exemplo) fora do modo dev, o módulo deve se recusar a subir — com uma chave conhecida, qualquer um forja sessões.

**`Dockerfile`** (mesmo padrão em todo módulo):
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir ".[postgres]"
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`pyproject.toml` deve ter um extra `postgres` com `psycopg[binary]>=3.1`, instalado só na imagem Docker (não necessário no `sqlite` local).

## 6. Contrato de frontend

**Stack**: React 19 + Vite + TypeScript + Tailwind CSS v4 (`@tailwindcss/vite`, importado via `@import "tailwindcss"` no CSS — não usa `tailwind.config.js` separado).

**Paleta e tema — use exatamente estes tokens** (três modos: claro/`dim`/escuro, controlados pelo atributo `data-theme` no `<html>`; azul-marinho `#15216F` ancorado no logo do laboratório NQTR):

```css
:root, [data-theme='light'] {
  --color-bg: #f5f7fc; --color-bg-elevated: #ffffff; --color-surface: #eef1f8;
  --color-border: #dde3f0; --color-text: #10162b; --color-text-muted: #4b5573;
  --color-primary: #15216f; --color-primary-hover: #1f2f8f; --color-primary-contrast: #ffffff;
}
[data-theme='dim'] {
  --color-bg: #1b2035; --color-bg-elevated: #232a47; --color-surface: #2a3257;
  --color-border: #3a4270; --color-text: #e8ebf5; --color-text-muted: #a8b0d0;
  --color-primary: #7c8cff; --color-primary-hover: #97a4ff; --color-primary-contrast: #0a0d1a;
}
[data-theme='dark'] {
  --color-bg: #0a0d1a; --color-bg-elevated: #12162b; --color-surface: #171c38;
  --color-border: #232a4d; --color-text: #f0f2fa; --color-text-muted: #8890b8;
  --color-primary: #6c7fff; --color-primary-hover: #8b9aff; --color-primary-contrast: #05070f;
}
body { font-family: system-ui, 'Segoe UI', Roboto, sans-serif; }
```

Use essas variáveis CSS (`var(--color-primary)` etc.) em vez de cores fixas nos componentes — isso é o que permite os três temas funcionarem sem reescrever nada. Se o módulo precisar de cores adicionais específicas do seu domínio (ex. cores de status de um equipamento), defina-as como novos tokens, sem alterar os tokens genéricos acima.

**Se você tem acesso ao Horun Core** (é o caso de quem mantém o Horun): em vez de colar os tokens acima, use o pacote `@horun/design-system` (tokens, `ThemeProvider`, `ThemeToggle`, `HorunFooter`) por **cópia dentro do módulo**: `python <Horun Core>/scripts/vendor_design_system.py <módulo>/frontend` gera `frontend/vendor/horun-design-system/` e aponta o `package.json` para `"file:./vendor/horun-design-system"` (`--check` avisa se a cópia ficou desatualizada). **Nunca** aponte para a pasta do Core (`"file:../../Horun Core/design-system"`): funciona na sua máquina e quebra o build Docker do servidor, que só enxerga o repositório do módulo. Não edite a cópia — mude no Core e rode o script de novo.

**Persistência do tema**: `localStorage`, chave `"horun-theme"` (mesma chave em todo módulo — assim a escolha de tema persiste ao navegar entre módulos, já que tudo roda na mesma origem através do Core). Detecta `prefers-color-scheme` do sistema operacional só no primeiro acesso (sem preferência salva ainda).

**Rodapé padrão**, em toda página: logo do laboratório (NQTR, IQ-UFRJ) + nome do módulo (formato "Horun · Nome") + autoria. **Nunca** exiba codinome interno — nem no rodapé, nem em lugar nenhum da interface (ver Prompt_Horun_Core.md, seção 2).

**Chamadas HTTP**: nenhuma configuração especial de CORS ou header de autenticação manual no cliente — quando plugado no Core, tudo roda na mesma origem, e a identidade chega ao backend via cabeçalho injetado pelo gateway, não pelo frontend. Em desenvolvimento standalone, o frontend fala direto com `http://localhost:8000`.

**Encaixe da interface dentro do Core — convenção validada (Prompt_Horun_Core.md, seção 8)**: em produção, o Core serve a sua SPA sob `/m/<id>/` (ex. `/m/amostras/`), e suas chamadas de API (que já devem começar com `/api/...`, ex. `/api/samples`) precisam sair com esse mesmo prefixo (`/m/amostras/api/samples`), porque é assim que o gateway do Core sabe pra qual módulo/backend encaminhar. Três ajustes cobrem isso, todos usando `import.meta.env.BASE_URL` (variável que o próprio Vite já preenche a partir do `--base` do build — nada de inventar uma env var nova):

```tsx
// main.tsx — o router precisa saber que vive sob um sub-caminho
<BrowserRouter basename={import.meta.env.BASE_URL}>
```

```ts
// lib/api.ts (ou onde estiver o API_BASE) — produção usa o mesmo prefixo
const API_BASE = import.meta.env.DEV
  ? "http://localhost:8000"
  : import.meta.env.BASE_URL.replace(/\/$/, "");
```

```dockerfile
# frontend/Dockerfile — o prefixo entra como build arg, não fica hardcoded
ARG VITE_BASE=/
...
RUN npm run build -- --base=$VITE_BASE
```

No `frontend/Dockerfile`, o healthcheck usa **`http://127.0.0.1:80/`**, nunca `localhost`: na imagem `nginx:alpine`, `localhost` resolve primeiro para IPv6 (`::1`) e o nginx padrão só escuta IPv4 — o container aparece "(unhealthy)" mesmo funcionando.

O `docker-compose.yml` do módulo passa `VITE_BASE=/m/<id>/` nesse build arg, e o serviço do frontend entra na `horun-network` com um `container_name` previsível (ex. `amostras-frontend`) — é esse nome que o administrador do Core cadastra como `internal_frontend_url` do módulo. Sem esses três ajustes, o módulo continua funcionando perfeitamente sozinho (`VITE_BASE` default `/`) — só não pode ser aberto de dentro do Core ainda.

## 7. Banco de dados — migração defensiva (obrigatório)

`SQLModel.metadata.create_all(engine)` **só cria tabela que não existe — nunca adiciona coluna a uma tabela que já existe**. Se um campo novo entra num modelo depois que o banco de produção já foi criado, toda consulta àquela tabela quebra com `UndefinedColumn` e o backend entra em loop de reinício. Já derrubou os módulos Amostras e Reagentes em produção mais de uma vez.

A migração precisa funcionar **no Postgres de produção**, não só no SQLite de desenvolvimento — o RE7S chegou a ter migrações que só rodavam no SQLite (usavam `PRAGMA` e saíam cedo fora dele). Use exatamente este padrão desde o primeiro commit (`app/db/session.py` — já pronto no `module-template`):

```python
from sqlalchemy import inspect

_PG_TYPES = {"DATETIME": "TIMESTAMP"}
_PG_BOOL_DEFAULTS = {"0": "FALSE", "1": "TRUE"}

def add_column_ddl(dialect, table, column, ddl_type, default_sql=None):
    quote = dialect.identifier_preparer.quote  # aspas: "user" é reservada no Postgres
    if dialect.name == "postgresql":
        if ddl_type.upper() == "BOOLEAN" and default_sql is not None:
            default_sql = _PG_BOOL_DEFAULTS.get(default_sql.strip(), default_sql)
        ddl_type = _PG_TYPES.get(ddl_type.upper(), ddl_type)
    stmt = f"ALTER TABLE {quote(table)} ADD COLUMN {quote(column)} {ddl_type}"
    return stmt + (f" DEFAULT {default_sql}" if default_sql is not None else "")

def _ensure_column(table, column, ddl_type, default_sql=None):
    inspector = inspect(engine)
    if not inspector.has_table(table):
        return  # tabela nova: o create_all já cria com todas as colunas
    if column in {c["name"] for c in inspector.get_columns(table)}:
        return
    with engine.begin() as conn:
        conn.exec_driver_sql(add_column_ddl(engine.dialect, table, column, ddl_type, default_sql))

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    # uma linha por coluna adicionada a um modelo depois do primeiro deploy:
    # _ensure_column("sample", "observacoes", "VARCHAR")
    # _ensure_column("sample", "conferida", "BOOLEAN", default_sql="0")
```

**Regra**: toda vez que somar um campo num modelo que já tem tabela em produção, some a linha de `_ensure_column` **no mesmo commit**. A migração roda no startup, em qualquer banco — só vale depois que o backend reinicia de verdade. Teste o SQL do Postgres sem precisar de um Postgres: `add_column_ddl(postgresql.dialect(), ...)` (exemplo em `module-template/backend/tests/test_migrations.py`).

## 8. O que entregar ao final

1. Código completo do backend e frontend seguindo a estrutura acima.
2. `README.md` explicando como rodar em modo standalone (`HORUN_DEV_MODE=true` + `uvicorn` + `npm run dev`), igual ao padrão dos módulos já existentes do Horun.
3. Testes automatizados do backend cobrindo a lógica de negócio principal (pytest), incluindo as migrações (seção 7).
4. Nenhuma senha, chave ou segredo real commitado — variáveis de ambiente com um `.env.example` de modelo.
5. `pyproject.toml` com versões exatas (seção 5).

Depois de pronto, o mantenedor do Horun (usando Claude Code, com acesso ao restante do projeto) cuida da parte de "plugar" — cadastrar o módulo no painel de Administração do Core (a partir dos dados do `MODULE.md`, com a URL interna do backend e do frontend, ex. `http://<id>-backend:8000` e `http://<id>-frontend:80`), configurar o `docker-compose.yml` do servidor, e validar permissões. Você não precisa se preocupar com essa parte.

## 9. Produção (quando o módulo for plugado no Core)

O mantenedor monta isso, mas o módulo precisa permitir:

- **Nenhuma porta publicada** (`ports:`) no compose de produção — backend e frontend só na rede `horun-network`, com `container_name` previsível (`<id>-backend`, `<id>-frontend`). A identidade por cabeçalho só é segura porque ninguém alcança o módulo sem passar pelo Core.
- No compose de **desenvolvimento** (com `HORUN_DEV_MODE=true`, que é "admin sem login"), portas só em `127.0.0.1` (`"127.0.0.1:8000:8000"`), nunca abertas para a rede do laboratório.
- **Postgres com volume nomeado** e **backup automático**: o serviço `db-backup` (mesma imagem `postgres:16-alpine`, roda `deploy/backup/pg_backup.sh`, já no `module-template`) faz um dump verificado por dia e guarda 30 dias em `BACKUP_DIR`, uma pasta fora do Docker:

```yaml
  db-backup:
    image: postgres:16-alpine
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      PGHOST: db
      PGUSER: <usuario>
      PGPASSWORD: ${POSTGRES_PASSWORD}
      PGDATABASE: <banco>
      BACKUP_PREFIX: <id>
      BACKUP_KEEP_DAYS: ${BACKUP_KEEP_DAYS:-30}
      BACKUP_INTERVAL_HOURS: ${BACKUP_INTERVAL_HOURS:-24}
    volumes:
      - ${BACKUP_DIR:-./backups}:/backups
      - ./deploy/backup/pg_backup.sh:/pg_backup.sh:ro
    entrypoint: ["/bin/sh", "/pg_backup.sh"]
```

- **`.gitattributes` com `*.sh text eol=lf`**: os scripts rodam dentro de containers Linux; no Windows, o git converteria para CRLF e o `sh` quebraria.

Restauração e detalhes: `Prompt_Horun_Core.md`, seção 9.4.
