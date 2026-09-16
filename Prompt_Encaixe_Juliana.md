# Prompt — Plugar Amostras/Reagentes de verdade no Horun

> Oi Juliana! Cole este documento inteiro no seu assistente de IA, num repositório de cada vez (`Controle-Analitico` primeiro, depois `Controle-de-reagentes`) e peça pra ele aplicar as mudanças. É um patch pequeno e cirúrgico — não muda nada da sua lógica de negócio, só ensina o app a rodar sob um "sub-endereço" quando estiver plugado no Horun. Já testei esse exato patch numa cópia local do `Controle-Analitico` e confirmei que o build gera os caminhos certos, então pode aplicar com confiança.

## Contexto — o que mudou do lado do Core

O Horun Core agora sabe encaixar a interface de um módulo dentro dele mesmo: quando alguém abre `https://<horun>/m/amostras/`, o Core decide sozinho, pelo caminho da requisição, se deve encaminhar pro seu **backend** (chamadas que começam com `/api/...`) ou pro seu **frontend** (tudo o mais — HTML, JS, CSS). Pra isso funcionar, sua SPA precisa saber que vive sob esse prefixo (`/m/amostras/` ou `/m/reagentes/`, dependendo do repositório) em vez de na raiz do site.

Isso já está documentado no `Prompt_Horun_Modulo.md` (seção 6) do repositório `Horun-Core`, mas aqui vai o passo a passo direto, sem precisar ir atrás do contrato inteiro.

## As 4 mudanças

### 1. `frontend/src/main.tsx` — o router precisa saber do prefixo

Ache a linha do `<BrowserRouter>` e adicione a prop `basename`:

```tsx
// antes
<BrowserRouter>

// depois
<BrowserRouter basename={import.meta.env.BASE_URL}>
```

`import.meta.env.BASE_URL` é uma variável que o próprio Vite já preenche sozinho a partir do `--base` passado no build (próximo passo) — não precisa criar nada novo.

### 2. `frontend/src/lib/api.ts` — a chamada de API precisa sair com o mesmo prefixo

Ache a linha do `API_BASE` (no `Controle-Analitico` é a linha 5; no `Controle-de-reagentes`, a linha 4) e troque:

```ts
// antes (Amostras)
const API_BASE = import.meta.env.DEV ? "http://localhost:8000" : "";

// antes (Reagentes)
const API_BASE = import.meta.env.DEV ? "http://localhost:8001" : "";

// depois (os dois) — em dev não muda nada, só a parte de produção
const API_BASE = import.meta.env.DEV
  ? "http://localhost:8000" // (ou 8001 no Reagentes — mantém o que já tinha)
  : import.meta.env.BASE_URL.replace(/\/$/, "");
```

### 3. `frontend/Dockerfile` — o prefixo vira um argumento de build, não fica fixo

Ache a linha `RUN npm run build` e troque por:

```dockerfile
# antes
RUN npm run build

# depois
ARG VITE_BASE=/
RUN npm run build -- --base=$VITE_BASE
```

O `ARG VITE_BASE=/` pode entrar logo depois do `WORKDIR /app` (ou onde fizer mais sentido antes do `RUN npm install`, sem problema).

### 4. `docker-compose.yml` — adicionar o serviço de frontend (hoje comentado/ausente)

Vocês já tinham deixado uma nota "o encaixe ainda não está implementado do lado do Core" — pois já está! Adiciona isto ao `docker-compose.yml` (troque `amostras`/`8000` por `reagentes`/`8001` no repositório do Reagentes):

```yaml
  amostras-frontend:
    build:
      context: ./frontend
      args:
        VITE_BASE: /m/amostras/
    container_name: amostras-frontend
    networks:
      - horun-network
    restart: unless-stopped
```

(sem `ports:` — só o proxy do Core precisa alcançar esse container, nunca a rede do laboratório diretamente, mesma regra do backend)

## Opcional, mas recomendado: link de volta pro Horun

Sua `AppShell.tsx` tem a barra lateral própria do módulo (Fila/Solicitações/Membros, etc.), mas hoje não tem como voltar pro resto do Horun (Mural, Agenda, outros módulos). Um link simples tipo `<a href="/">← Voltar ao Horun</a>` no topo da barra lateral resolve — fica a seu critério o quanto quer investir nisso agora ou depois.

## Um detalhe: tirar o codinome interno do `MODULE.md`

Reparei que os dois `MODULE.md` (`Controle-Analitico` tem "codinome interno: Hermes", `Controle-de-reagentes` tem "codinome interno: Ossain") incluem uma linha de codinome. Esses codinomes são só uma brincadeira interna nossa de dar nome de divindade a cada módulo enquanto ele é desenvolvido — não devem aparecer em nenhum lugar que o pessoal do laboratório vá ler, nem documentação publicada no repositório. Pode tirar essa linha dos dois arquivos (o resto do manifesto — id, nome público, descrição, ícone, porta, health check — fica igual). Vou cadastrar os dois módulos no Horun só como "Amostras" e "Reagentes".

## Importante: os dois backends caíram em produção por falta de migração

Aconteceu de verdade hoje (2026-09-14): os dois backends (`Controle-Analitico` e `Controle-de-reagentes`) entraram em loop de reinício no servidor. Causa nos dois casos, idêntica: o modelo Python ganhou uma coluna nova (`Equipment.group` no Amostras; `Reagent.gas_full_pressure`/`gas_full_pressure_unit` no Reagentes) depois que o banco de produção já tinha sido criado uma vez — e `SQLModel.metadata.create_all(engine)` **só cria tabela que não existe, nunca adiciona coluna numa tabela que já existe**. Toda consulta em `Equipment`/`Reagent` quebrava com `UndefinedColumn` e o backend caía assim que tentava iniciar.

Resolvi manualmente por agora (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` direto no Postgres dos dois), mas isso vai acontecer de novo a cada campo novo que vocês adicionarem, a menos que o `create_db_and_tables()` (`app/core/db.py` nos dois repositórios) ganhe uma migração defensiva. É exatamente o mesmo problema que o Core já teve e resolveu — o padrão que uso lá (`backend/app/db/session.py` do `Horun-Core`) é assim, e serve pros dois repositórios de vocês do mesmo jeito:

```python
from sqlalchemy import inspect

def _ensure_column(engine, table: str, column: str, ddl_type: str) -> None:
    existing = {c["name"] for c in inspect(engine).get_columns(table)}
    if column in existing:
        return
    with engine.begin() as conn:
        conn.exec_driver_sql(f'ALTER TABLE "{table}" ADD COLUMN {column} {ddl_type}')

def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    # uma linha por coluna que já foi adicionada a um modelo depois do
    # primeiro deploy — cresce com o tempo, mas nunca quebra
    _ensure_column(engine, "equipment", "group", "VARCHAR")
    _ensure_column(engine, "reagent", "gas_full_pressure", "DOUBLE PRECISION DEFAULT 0")
    _ensure_column(engine, "reagent", "gas_full_pressure_unit", "VARCHAR DEFAULT 'bar'")
```

Cada repositório só precisa das linhas relevantes a ele. A partir de agora, sempre que adicionar um campo num modelo que já tem tabela em produção, é só somar uma chamada de `_ensure_column` — sem isso, todo `git pull` + rebuild no servidor tem chance de derrubar o módulo de novo.

## Aconteceu de novo (2026-09-16) — faltou só a linha do campo mais novo

Boa notícia primeiro: você já aplicou o padrão acima no `Controle-Analitico` (`app/core/db.py` já tem `_ensure_column` pra `equipment.group` e `sample.equipment_ids`, com direito a backfill — ficou bem feito). O problema agora é só que o campo **`observacoes`**, que entrou depois tanto em `Sample` quanto em `SampleRequest`, não ganhou a chamada correspondente ainda — o backend caiu em loop de reinício de novo com `UndefinedColumn: sample.observacoes`.

Fix: soma essas duas linhas dentro de `create_db_and_tables()`, junto das que já existem:

```python
_ensure_column("sample", "observacoes", "VARCHAR")
_ensure_column("samplerequest", "observacoes", "VARCHAR")
```

(Repare que sua própria `_ensure_column` já não recebe `engine` como parâmetro — ela usa o `engine` do módulo direto — então é só chamar `_ensure_column("tabela", "coluna", "TIPO")`, do jeito que as duas linhas que já existem fazem.)

Vale virar hábito: toda vez que somar um campo num modelo que já tem tabela em produção (`Sample`, `SampleRequest`, `Equipment`, `ModuleMembership`...), já soma a linha de `_ensure_column` no mesmo commit — evita esse mesmo susto de novo.

## Depois de aplicar

1. Commit e push normalmente, cada repositório no seu próprio ritmo.
2. Me avisa quando estiver pronto — o Guilherme (ou eu) só precisa cadastrar o módulo no painel de Administração do Horun com dois endereços:
   - **URL interna (backend)**: `http://amostras-backend:8000` (já existia)
   - **URL interna (frontend)**: `http://amostras-frontend:80` (novo campo)
3. Depois de cadastrado e com permissão concedida, "Amostras" (ou "Reagentes") aparece sozinho na barra lateral de todo mundo que tiver acesso, como se fosse parte nativa do Horun.

Qualquer dúvida durante o patch, é só perguntar — nada aqui muda a lógica de negócio de nenhum dos dois módulos, só a "casca" de como eles são servidos quando plugados.
