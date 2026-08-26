# Especificação Técnica — Horun Core (plataforma modular)

> Documento novo, um nível acima do `Prompt_Fase2.md` (`../Horun Fase 2/`). Aquele documento trata de **como um módulo** (o RE7S) sai do PC do equipamento e vai para o servidor dedicado. Este trata de **como vários módulos coexistem** no mesmo servidor: login único, cadastro de módulos, permissões, identidade visual compartilhada, e o mecanismo para desenvolver/plugar módulos novos — inclusive por terceiros, via outro chatbot.
>
> Referências: `../Horun Fase 2/Prompt_Fase2.md` (infraestrutura do PC dedicado, Docker, TLS), `../Projeto Horun/Rock Eval/Prompt_refinado.md` (seção 9 — identidade visual original, seção 7.3 — plano comercial multi-laboratório que motiva módulos desacoplados).

## 1. Decisão de arquitetura — serviços independentes atrás de um gateway

**Decisão fechada** (avaliadas duas opções em conversa — monólito modular vs. serviços independentes): cada módulo (RE7S, Leco, futuros — **um módulo por equipamento**) continua sendo um app completo e isolado, com seu próprio backend, banco de dados e container, exatamente como o RE7S já é hoje. O **Horun Core** é uma camada nova e fina na frente de todos eles.

```
Navegador ──▶ Horun Core (login único, cadastro de módulos, permissões, dashboard de status)
                  │
                  ├── /re7s/*  ──▶ container(s) do módulo RE7S (backend + banco próprios)
                  ├── /leco/*  ──▶ container(s) do módulo Leco (quando existir)
                  └── /xyz/*   ──▶ módulo novo, desenvolvido isolado e "plugado" depois
```

**Por quê**: bate com o que já existe (RE7S já é um app FastAPI+React+banco completo, sem rework necessário) e com o objetivo explícito de desenvolver módulos de forma independente — inclusive por terceiros usando outro chatbot — e só "implementar no Horun" quando prontos. Um módulo com bug/travamento não derruba os outros.

**Identidade entre Core e módulo**: o usuário loga uma vez no Core. O Core valida a sessão e repassa a identidade (usuário, papel) para dentro do módulo via cabeçalhos internos confiáveis (`X-Horun-User`, `X-Horun-Role`, `X-Horun-User-Id`) — o módulo nunca fica exposto direto à rede do laboratório, só alcançável através do Core (mesma disciplina já aplicada ao Postgres do RE7S: sem porta pro host, só rede interna do Docker). Ver seção 3 do template de módulo para o mecanismo exato.

## 2. Identidade visual compartilhada

Extraída do que o RE7S já implementa (`Rock Eval Horun Dev/frontend/src/index.css`, `theme/ThemeProvider.tsx`) para um pacote `design-system` reutilizável por todo módulo novo — ver `design-system/README.md` nesta pasta. Decisões herdadas (seção 9 do `Prompt_refinado.md` do RE7S), agora formalizadas como **padrão de toda a plataforma**, não só do RE7S:

- Paleta azul/branco ancorada no azul-marinho do logo do NQTR (`#15216F`).
- Três modos de tema — claro / semi-escuro (`dim`) / escuro —, não um toggle binário.
- Preferência de tema **compartilhada entre módulos** (mesma chave de `localStorage`, já que tudo roda sob a mesma origem via o gateway do Core) — trocar o tema num módulo já reflete nos outros.
- Tipografia: `system-ui, 'Segoe UI', Roboto, sans-serif` (sem fonte customizada carregada por rede — evita dependência externa e mantém consistência entre módulos sem esforço extra).
- Tokens de cor **genéricos** (fundo, superfície, borda, texto, primária) ficam no pacote compartilhado; tokens **específicos de um módulo** (ex. as cores de status do carrossel do RE7S) continuam no CSS do próprio módulo, estendendo os tokens compartilhados.

## 3. Contrato de módulo

Todo módulo compatível com o Horun deve fornecer:

- Um `MODULE.md` na raiz (manifesto: id, nome público, codinome, ícone/emoji, descrição curta, porta interna) — é isso que o Core lê para cadastrar o módulo no dashboard.
- Endpoint `GET /health` sem autenticação, respondendo `{"status": "ok"}` — usado pelo Core para o dashboard de status (seção 5).
- Backend que aceita identidade via cabeçalhos confiáveis do Core (produção) **ou** um modo de desenvolvimento standalone com usuário fixo (`HORUN_DEV_MODE=true`) — para permitir desenvolver isolado, sem o Core rodando.
- `Dockerfile` de backend e frontend seguindo o mesmo padrão do RE7S (`Rock Eval Horun Dev/backend/Dockerfile`, `deploy/Dockerfile`) — Python 3.11-slim + FastAPI/SQLModel no backend, Vite+React+Tailwind no frontend.
- Frontend importando o pacote `design-system` (tokens + `ThemeProvider` + `ThemeToggle`) em vez de recriar cores/tema do zero.
- Nenhuma porta exposta ao host além das que o Core expõe — módulo só alcançável via rede interna do Docker.

Template completo (esqueleto pronto pra copiar) em `module-template/`; script gerador em `create_horun_module.py`; versão em prosa autocontida para gerar um módulo a partir de outro chatbot em `Prompt_Horun_Modulo.md`.

## 4. Login e importação de usuários do Active Directory

**Decisão fechada**: importação de cadastro, senha própria do Horun (não SSO federado, pelo menos nesta rodada). Usuários do domínio `NQTRlab.INT` (via LDAP no `nqtrmaster`) são importados automaticamente para o banco do Horun Core (nome, login), mas cada um define sua própria senha no primeiro acesso ao Horun — login não depende do AD estar acessível depois do import inicial.

**[A DEFINIR]**:
- Mecanismo de sincronização: importação periódica agendada, ou só na primeira vez que um usuário do AD tenta logar (upsert sob demanda)?
- Conta de serviço no AD com permissão de **leitura** (bind LDAP) — ainda não existe, precisa ser criada por quem administra o `nqtrmaster`.
- Mapeamento de atributos AD → campos do Horun (`sAMAccountName` → username, `displayName` → nome, etc.).
- Novos usuários importados entram sem nenhum acesso a módulo por padrão (seção 6), ou com algum padrão mínimo?

## 5. Dashboard de status — visível a todos

Todo usuário autenticado no Core vê a lista de módulos cadastrados e seu status (operacional/offline, via `GET /health` de cada um), **independente de ter permissão de uso**. Clicar num módulo sem permissão mostra "sem acesso — solicite ao administrador", não o app do módulo. Um módulo sem container rodando aparece como "offline" no dashboard, não some da lista.

## 6. Permissões por módulo

- **Administrador máximo** (papel novo, do Horun Core — diferente do `admin` de cada módulo, que continua existindo dentro do módulo para as regras de negócio dele, ex. seção 8 do `Prompt_refinado.md` do RE7S) define, por usuário, quais módulos ele pode acessar.
- Tabela nova no banco do Core: `user_module_access` (usuário, módulo, concedido por, quando).
- **[A DEFINIR]**: permissão é só binária (acesso/sem acesso ao módulo) ou existe algum nível dentro disso (ex. "vê mas não edita")? A princípio os módulos já têm seus próprios papéis internos (usuário/admin, como no RE7S) — o Core só decide **se** a pessoa entra, o módulo decide **o que** ela pode fazer lá dentro.

## 7. Acesso a pastas do `nqtrmaster` como armazenamento paralelo

Pedido do usuário: o Horun (Core e/ou módulos específicos) deve conseguir gravar em compartilhamentos já existentes no `nqtrmaster` — fichas de utilização, dados de equipamento, tratamento de dados, aplicações. Compartilhamentos candidatos já vistos na listagem do servidor (seção 2 do `Prompt_Fase2.md`): `Dados Equipamentos`, `Registro de Utilização Etiquetas e Fichas de Identificação`, possivelmente outros.

**Desafio técnico a resolver**: os containers do backend rodam Linux (mesmo em Docker Desktop no Windows, via WSL2) — acessar um compartilhamento SMB do Windows a partir de um container Linux exige montar o compartilhamento (`cifs-utils`) dentro do container, ou montar no host Windows e expor a pasta montada ao container via bind mount. Ambos exigem uma **conta de serviço** com permissão de escrita nesses compartilhamentos específicos — ainda não existe.

**[A DEFINIR]**:
- Quais pastas exatamente, e com que estrutura de subpastas (ex. uma subpasta por módulo?).
- Criar a conta de serviço no AD (não usar o perfil `equipamento` compartilhado, mesmo raciocínio já aplicado ao agente do RE7S — seção 3 do `Prompt_Fase2.md`).
- Mecanismo técnico exato (mount SMB dentro do container Linux vs. bind mount de uma unidade de rede já mapeada no Windows host).

## 8. Estado atual e próximos passos

**Já construído e testado** (backend com 23 testes automatizados passando; frontend validado manualmente ponta a ponta — login, cadastro de módulo/usuário, concessão/revogação de permissão, bloqueio de `/admin` para usuário comum, dashboard mostrando status "offline" corretamente para um módulo não rodando):

- Backend do Core (`backend/`): login com sessão em cookie (mesmo padrão do RE7S), cadastro de módulos (`Module`), permissões usuário↔módulo (`UserModuleAccess`), dashboard agregando health check de cada módulo, proxy de API `/m/{id}/...` com injeção de cabeçalhos de identidade.
- Frontend do Core (`frontend/`): tela de login, dashboard de módulos (status + permissão), painel de administração (usuários, módulos, permissões) — usando o `design-system` compartilhado.
- Empacotamento Docker do Core (`deploy/Dockerfile`, `deploy/Caddyfile`, `docker-compose.yml`, `.env.example`) — mesmo padrão do RE7S: Postgres com volume nomeado, nenhuma porta exposta além da 443/80 do Caddy, TLS self-signed automático. Diferença do RE7S: o backend do Core também entra numa rede Docker externa (`horun-network`, criada manualmente com `docker network create horun-network` antes do primeiro `docker compose up`) — é por ela que o Core vai alcançar o backend de cada módulo pelo nome do container, já que cada um vive no seu próprio `docker-compose.yml`/repositório.
- **Deploy em produção validado de ponta a ponta em 2026-08-25**, na `DESKTOP-N6KR7DO` (ver `../Horun Fase 2/Prompt_Fase2.md`, seção 2): repositório publicado em `github.com/guimneves/Horun-Core`, `docker compose up -d --build` rodando os 3 serviços, login funcionando via `https://192.168.31.171`. Bug real corrigido no caminho: o `Caddyfile` precisava de `tls internal { on_demand }` — sem isso, o site catch-all (`:443`, sem hostname) não sabia gerar certificado na hora do handshake e todo cliente (curl, Chrome, um handshake TLS bruto em Python) recebia o alerta `internal_error`. Corrigido e já no repositório.

**Ainda não implementado**:

1. **Encaixe da interface (frontend) de um módulo dentro do Core** — hoje o botão "Abrir" no dashboard está desabilitado de propósito. O proxy de API (`/m/{id}/...`) já funciona, mas montar a *SPA* de um módulo sob esse mesmo prefixo exige que o build do módulo seja feito com um base path correspondente (`vite build --base=/m/<id>/`) — ainda não implementado nem no template nem no RE7S.
2. **Importação de usuários do AD** (seção 4) — falta a conta de serviço LDAP no `nqtrmaster` e o mecanismo de sincronização. Hoje todo usuário é criado manualmente pelo administrador máximo.
3. **Acesso a pastas do `nqtrmaster`** como armazenamento paralelo (seção 7) — falta decidir quais pastas e criar a conta de serviço.
4. **Conectar o RE7S à `horun-network`** — combinado que não mexeríamos no RE7S por enquanto; quando chegar a hora, é só adicionar a rede externa e um `container_name: re7s-backend` ao `docker-compose.yml` dele (mesmo mecanismo já usado no Core), sem tocar na lógica de negócio.
5. **Adaptar o RE7S para rodar atrás do Core de verdade** — o RE7S ainda tem seu próprio sistema de login (Fase 1/Fase 2 standalone); para funcionar como módulo do Core, ele precisaria aceitar identidade via cabeçalho (`X-Horun-User`/`X-Horun-Role`), como o `module-template` já faz, sem perder a capacidade de rodar sozinho.
