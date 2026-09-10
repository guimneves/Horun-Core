# Especificação Técnica — Horun Core (plataforma modular)

> Documento novo, um nível acima do [`Prompt_Fase2.md`](Prompt_Fase2.md) (mesmo repositório). Aquele documento trata de **como um módulo** (o RE7S) sai do PC do equipamento e vai para o servidor dedicado. Este trata de **como vários módulos coexistem** no mesmo servidor: login único, cadastro de módulos, permissões, identidade visual compartilhada, e o mecanismo para desenvolver/plugar módulos novos — inclusive por terceiros, via outro chatbot.
>
> Referências: [`Prompt_Fase2.md`](Prompt_Fase2.md) (infraestrutura do PC dedicado, Docker, TLS), [`Prompt_refinado.md`](https://github.com/guimneves/RE7S-Horun/blob/main/Prompt_refinado.md) do RE7S (seção 9 — identidade visual original, seção 7.3 — plano comercial multi-laboratório que motiva módulos desacoplados).

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
- **Deploy em produção validado de ponta a ponta em 2026-08-25**, na `DESKTOP-N6KR7DO` (ver [`Prompt_Fase2.md`](Prompt_Fase2.md), seção 2): repositório publicado em `github.com/guimneves/Horun-Core`, `docker compose up -d --build` rodando os 3 serviços, login funcionando via `https://192.168.31.171`. Bug real corrigido no caminho: o `Caddyfile` precisava de `tls internal { on_demand }` — sem isso, o site catch-all (`:443`, sem hostname) não sabia gerar certificado na hora do handshake e todo cliente (curl, Chrome, um handshake TLS bruto em Python) recebia o alerta `internal_error`. Corrigido e já no repositório.
- **Redesenho da interface + Mural e Agenda (2026-09-09)** — mockup aprovado antes de implementar (fluxo do `design` skill), depois construído de verdade:
  - **Mural** (`/`, nova home): feed estilo Facebook/Teams — qualquer usuário publica um aviso; administrador máximo fixa/desafixa; autor ou admin remove. Widgets na lateral (status de módulos, agenda de hoje). Backend: `Post` (`app/db/models.py`), `routes_posts.py`.
  - **Agenda** (`/agenda`): calendário semanal compartilhado (estilo Google Agenda) para reserva de uso de equipamentos — cadastro de `Equipment` (cor própria na legenda) e `Reservation` (não permite sobreposição de horário no mesmo equipamento). Backend: `routes_equipment.py`, `routes_reservations.py`.
  - **Módulos** (`/modulos`): a antiga tela de dashboard, sem mudança de lógica, só de lugar na navegação.
  - **Administração**: painel com abas (Usuários, Módulos, Equipamentos, Permissões) em vez de seções empilhadas.
  - Barra lateral de navegação nova em `App.tsx` (`SideNav`), ícones SVG próprios do Core em `frontend/src/icons.tsx` (nunca emoji), `Avatar` compartilhado em `frontend/src/components/Avatar.tsx`.
  - **Bugs reais encontrados e corrigidos durante a validação em navegador** (todos cobertos por teste ou verificados manualmente depois): (1) Tailwind v4 não escaneia `node_modules` por padrão — as classes usadas nos componentes do `design-system` (`HorunFooter`, `ThemeToggle`) nunca eram geradas, fazendo o logo do rodapé renderizar em tamanho real (enorme); corrigido com `@source "./*.tsx";` em `design-system/src/tokens.css` (herdado por todo consumidor do pacote). (2) `list_reservations` comparava datetime "aware" (query string, com timezone) com "naive" (gravado no banco) e derrubava com 500 ao filtrar por intervalo — corrigido normalizando o parâmetro antes de comparar. (3) O frontend mandava os limites do filtro de intervalo via `toISOString()` (UTC), desalinhado da hora local gravada — trocado por um helper `toLocalIso` (`frontend/src/lib/datetime.ts`).
  - 19 testes novos no backend (mural + agenda), todos passando (42 no total).

- **Encaixe da interface (frontend) de um módulo dentro do Core — implementado em 2026-09-09** (era o item 1 daqui, agora fechado): `/m/{id}/*` no backend do Core decide sozinho, pelo primeiro segmento do caminho, se é uma chamada de API (`api/...` → `Module.internal_base_url`) ou um pedido de estáticos da SPA (qualquer outra coisa → `Module.internal_frontend_url`, novo campo, opcional) — checando permissão antes nos dois casos. `Caddyfile` ganhou uma rota `handle /m/*` (faltava — hoje caía no fallback errado, servindo o próprio site do Core). A barra lateral (`App.tsx`) passou a listar dinamicamente os módulos com acesso e `embeddable=true`, como link de navegação real (`<a>`, não `<Link>` — cada módulo é uma SPA própria, carregamento de página de verdade). Convenção do lado do módulo documentada e **validada de ponta a ponta no build** (não só em teoria) em `Prompt_Horun_Modulo.md`, seção 6: `vite build --base=/m/<id>/` (via `ARG VITE_BASE` no Dockerfile), `<BrowserRouter basename={import.meta.env.BASE_URL}>`, e `API_BASE` derivado do mesmo `BASE_URL`. Aplicado também ao `module-template` (novo `frontend/Dockerfile` + `nginx.conf`, `docker-compose.yml` com serviço de frontend).

- **Mural: respostas e menções — implementado em 2026-09-10**: thread de respostas por post (`PostReply`, um nível só), autor ou admin máximo remove; autocompletar de `@usuário` ao digitar (`GET /users/mentionable`, aberto a qualquer autenticado — lista mínima, sem papel/status, diferente de `GET /users`), com a menção destacada no texto renderizado. Componente `MentionTextarea` reaproveitado no composer principal e nas respostas.
- **Agenda: arrastar para reagendar — implementado em 2026-09-10**: `PATCH /reservations/{id}` (mesma checagem de conflito do create, excluindo a própria reserva) + interação de arrastar na grade via Pointer Events nativos (sem biblioteca), com snap de 15 minutos, mudança de dia E de equipamento (arrastar pra outra coluna), e reversão automática se o servidor recusar (ex. conflito). Clique sem arrastar continua cancelando (comportamento antigo preservado). Validado de ponta a ponta no navegador (arrastar de verdade, conferido que persistiu no banco).
- 15 testes novos (7 respostas/menções, 5 reagendamento), 60 no total, todos passando.

- **Perfil de usuário: posição/qualificação, foto, conta sem senha, autoatendimento — implementado em 2026-09-10**:
  - `User` ganhou `position`/`qualification` (strings validadas contra listas fixas — `POSITIONS`/`QUALIFICATIONS` em `app/db/models.py`, sempre com marcador de gênero "(a)" no fim, ex. `Pesquisador(a)`, `Doutorando(a)`) — atribuídas só pelo administrador máximo (na criação ou inline na tabela de `AdminPage.tsx`), a pessoa não edita as próprias.
  - **Conta sem senha + primeiro acesso**: administrador pode criar um usuário sem senha (`password` omitido) — o backend gera um `setup_code` (6 caracteres hex maiúsculos) mostrado uma vez no painel de admin. A pessoa usa usuário + código em "Primeiro acesso" (novo modo na `LoginPage.tsx`, `POST /auth/set-password`) pra escolher a própria senha e já entra logada. Login contra uma conta sem senha retorna `428 Precondition Required` — a tela de login detecta isso e leva direto pro fluxo de primeiro acesso. Administrador pode gerar um novo código a qualquer momento (`POST /users/{id}/regenerate-setup-code` — zera a senha atual, útil se a pessoa perdeu o código ou esqueceu a senha).
  - **Foto de perfil**: guardada como bytes no banco (`User.photo`/`photo_content_type`, não em volume/arquivo — evita mais um recurso pra gerenciar no deploy), até 2 MB, JPEG/PNG/WEBP. Servida em rota separada (`GET /users/{id}/photo`, exige sessão) pra nunca pesar a listagem de usuários. Autoatendimento: `POST`/`DELETE /auth/me/photo`, nova seção em `pages/ProfilePage.tsx` (`/perfil`, aberta clicando no próprio cartão na barra lateral). `Avatar.tsx` tenta a foto e cai pras iniciais se der 404/erro.
    - **Bug real encontrado e corrigido**: o `<img>` do avatar não mandava o cookie de sessão em requisição cross-origin (front `:5174`/back `:8000` em dev) — a rota, autenticada, respondia 401 e o navegador bloqueava a resposta com `ERR_BLOCKED_BY_ORB` (silencioso, sem cair no `onError`). Corrigido com `crossOrigin="use-credentials"` no `<img>` (inofensivo em produção, mesma origem via Caddy).
    - **Segundo bug corrigido**: depois de trocar/remover a foto, o avatar continuava mostrando a imagem antiga (cache do navegador — a URL do endpoint não muda). Corrigido com um cache-buster (`?v=`) alimentado por um contador `userVersion` no `AuthContext`, incrementado a cada `refreshUser()`/login — qualquer `<Avatar>` da própria pessoa (barra lateral, `/perfil`) recebe `cacheBust={userVersion}` e atualiza sem precisar recarregar a página.
  - **Dados pessoais por autoatendimento**: nome completo, e-mail, telefone e nome de exibição editáveis pela própria pessoa em `/perfil` (`PATCH /auth/me`) — nunca papel/posição/qualificação, que continuam exclusivos do administrador máximo.
  - 19 testes novos (`tests/test_profile.py`) cobrindo criação sem senha, primeiro acesso (código certo/errado/reuso/curto demais), validação de posição/qualificação, autoatendimento de perfil, upload/remoção/404 de foto, regeneração de código (inclusive bloqueio na conta protegida) — 79 no total, todos passando.

- **Notificações — implementado em 2026-09-10**: o sininho do topo (antes decorativo) agora funciona. É o que faz o `@menção` do Mural valer a pena — sem isto, ninguém vê que foi marcado.
  - Modelo `Notification` (`user_id` destinatário, `kind` "mention"/"reply", `text` pronto, `link`, `actor_id`, `read`). Tabela nova → `create_all` cobre, sem migração.
  - Geração em `routes_posts.py` (`_fan_out_notifications`, chamado no `create_post`/`create_reply`): uma notificação por pessoa mencionada (`@usuario`, mesma regex do `MentionTextarea`), mais o autor do post quando é uma resposta. Nunca notifica a si mesmo; menção do mesmo texto duas vezes = uma notificação; menção vence "reply" quando os dois se aplicam.
  - `routes_notifications.py`: `GET /notifications` (as suas, 50 mais recentes, com `actor_display_name` resolvido na hora), `GET /notifications/unread-count` (o badge), `POST /notifications/mark-read` (marca todas como lidas).
  - Frontend: `components/NotificationsBell.tsx` no `Shell` (`App.tsx`) — badge com a contagem, polling de 45s, painel com clique-fora pra fechar. Abrir o painel marca tudo como lido (padrão GitHub: "novidades desde a última vez"). Clicar numa notificação navega pro `link`. `timeAgo` movido de `MuralPage.tsx` para `lib/datetime.ts` (reaproveitado).
  - 10 testes novos (`tests/test_notifications.py`), 89 no total. Validado de ponta a ponta no navegador (menção e resposta gerando notificação, badge, marcar como lida, navegação).

**Ainda não implementado**:

1. **Plugar de verdade os módulos da Juliana (Amostras, Reagentes)** — ela precisa aplicar os 3 ajustes de `Prompt_Horun_Modulo.md` seção 6 (patch pequeno, já validado localmente pelo Guilherme numa cópia do `Controle-Analitico`) e adicionar o serviço de frontend ao `docker-compose.yml` dela (hoje comentado/ausente); depois é só registrar os dois módulos no Core (`internal_base_url` + `internal_frontend_url`) e conceder acesso.
2. **Importação de usuários do AD** (seção 4) — falta a conta de serviço LDAP no `nqtrmaster` e o mecanismo de sincronização. Hoje todo usuário é criado manualmente pelo administrador máximo.
3. **Acesso a pastas do `nqtrmaster`** como armazenamento paralelo (seção 7) — falta decidir quais pastas e criar a conta de serviço.
4. **Conectar o RE7S à `horun-network`** — combinado que não mexeríamos no RE7S por enquanto; quando chegar a hora, é só adicionar a rede externa e um `container_name: re7s-backend` ao `docker-compose.yml` dele (mesmo mecanismo já usado no Core), sem tocar na lógica de negócio.
5. **Adaptar o RE7S para rodar atrás do Core de verdade** — o RE7S ainda tem seu próprio sistema de login (Fase 1/Fase 2 standalone); para funcionar como módulo do Core, ele precisaria aceitar identidade via cabeçalho (`X-Horun-User`/`X-Horun-Role`), como o `module-template` já faz, sem perder a capacidade de rodar sozinho.
6. **Certificado confiável (fim do aviso self-signed)** — decisão em aberto, esperando alinhamento com a coordenação (2026-09-10). Caminho preferido ("A2"): domínio próprio barato (`.org`/`.com`/`.com.br`, ~R$ 40–70/ano) + DNS na Cloudflare + certificado Let's Encrypt via desafio **DNS-01** (sem abrir porta pra internet, só saída HTTPS da caixa; registro A público `horun.<domínio>` → `192.168.31.171`, IP privado em DNS público é ok). Alternativa sem custo: `dedyn.io` grátis da deSEC. Alternativa "correta pra domínio Windows": CA interna distribuída por GPO no `nqtrmaster` (1 registro DNS + 1 GPO). O frontend não muda (já é same-origin `/api`); a mudança é `deploy/Dockerfile` (Caddy com plugin de DNS via `xcaddy`) + `deploy/Caddyfile` (site nomeado, mantendo o IP como fallback self-signed) + 3 variáveis no `.env`.
   - **Rede**: os PCs do dia a dia do laboratório (todos no Wi-Fi) **já alcançam** `192.168.31.171` — não há isolamento de clientes global. Um PC pessoal "de fora" no mesmo Wi-Fi é barrado individualmente (controle de acesso por dispositivo no roteador); acesso de aparelho pessoal é ajuste de roteador, separado e opcional.
7. **Busca de verdade** — a caixa de busca do topo é placeholder. Buscar no Mural, equipamentos, módulos e pessoas.
8. **Diretório de colaboradores** (`/colaboradores`) — lista com foto/posição/qualificação/contato, aproveitando os dados de perfil. Pequeno, alto retorno.
9. **Anexos no Mural** (imagem/PDF num aviso) — mesmo padrão do upload de foto de perfil.
10. **Onboarding no 1º login** — "complete seu perfil (foto, telefone)" logo após definir a senha, pra o diretório (#8) não nascer vazio.
