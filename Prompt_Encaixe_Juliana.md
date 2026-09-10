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

## Depois de aplicar

1. Commit e push normalmente, cada repositório no seu próprio ritmo.
2. Me avisa quando estiver pronto — o Guilherme (ou eu) só precisa cadastrar o módulo no painel de Administração do Horun com dois endereços:
   - **URL interna (backend)**: `http://amostras-backend:8000` (já existia)
   - **URL interna (frontend)**: `http://amostras-frontend:80` (novo campo)
3. Depois de cadastrado e com permissão concedida, "Amostras" (ou "Reagentes") aparece sozinho na barra lateral de todo mundo que tiver acesso, como se fosse parte nativa do Horun.

Qualquer dúvida durante o patch, é só perguntar — nada aqui muda a lógica de negócio de nenhum dos dois módulos, só a "casca" de como eles são servidos quando plugados.
