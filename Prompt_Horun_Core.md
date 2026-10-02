# Especificação Técnica — Horun Core (plataforma modular)

> Documento de referência da plataforma: **como vários módulos coexistem** no mesmo servidor (login único, cadastro de módulos, permissões, identidade visual compartilhada), **onde e como ela roda** (seção 9 — servidor dedicado, Docker, TLS) e **o que já existe / o que falta** (seção 8). O contrato para construir um módulo novo está em [`Prompt_Horun_Modulo.md`](Prompt_Horun_Modulo.md).
>
> Referências externas: [`Prompt_refinado.md`](https://github.com/guimneves/RE7S-Horun/blob/main/Prompt_refinado.md) do RE7S (seção 9 — identidade visual original; seção 7 — arquitetura de Fase 2 e plano comercial multi-laboratório; seções 14-18 — Agente e ponte de identidade).
>
> Histórico detalhado (o passo a passo de cada entrega, com datas) fica no `git log` — inclusive as versões anteriores deste documento. Aqui fica só o que continua valendo.

## 1. Decisão de arquitetura — serviços independentes atrás de um gateway

**Decisão fechada** (avaliadas duas opções — monólito modular vs. serviços independentes): cada módulo (RE7S, Leco, futuros — **um módulo por equipamento**) é um app completo e isolado, com seu próprio backend, banco de dados e container. O **Horun Core** é uma camada fina na frente de todos eles.

```
Navegador ──▶ Horun Core (login único, cadastro de módulos, permissões, dashboard de status)
                  │
                  ├── /m/re7s/*  ──▶ container(s) do módulo RE7S (backend + banco próprios)
                  ├── /m/leco/*  ──▶ container(s) do módulo Leco (quando existir)
                  └── /m/xyz/*   ──▶ módulo novo, desenvolvido isolado e "plugado" depois
```

**Por quê**: bate com o que já existia (RE7S já era um app FastAPI+React+banco completo) e com o objetivo de desenvolver módulos de forma independente — inclusive por terceiros usando outro chatbot. Um módulo com bug/travamento não derruba os outros.

**Identidade entre Core e módulo**: o usuário loga uma vez no Core. O Core valida a sessão e repassa a identidade para dentro do módulo via cabeçalhos internos confiáveis (`X-Horun-User`, `X-Horun-Role`, `X-Horun-User-Id`). O módulo nunca fica exposto direto à rede do laboratório — só alcançável através do Core, pela rede interna do Docker (mesma disciplina do Postgres: sem porta pro host).

## 2. Identidade visual compartilhada

Extraída do RE7S para o pacote `design-system/` (ver [`design-system/README.md`](design-system/README.md)), **padrão de toda a plataforma**:

- Paleta azul/branco ancorada no azul-marinho do logo do NQTR (`#15216F`).
- Três modos de tema — claro / semi-escuro (`dim`) / escuro —, não um toggle binário.
- Preferência de tema **compartilhada entre módulos** (mesma chave de `localStorage`, `horun-theme` — tudo roda sob a mesma origem via o gateway).
- Tipografia: `system-ui, 'Segoe UI', Roboto, sans-serif` (sem fonte carregada por rede).
- Tokens **genéricos** (fundo, superfície, borda, texto, primária) no pacote compartilhado; tokens **específicos de um módulo** no CSS do próprio módulo, estendendo os genéricos.
- Marca: ícone do Horun como favicon e ao lado de "Horun" no canto superior esquerdo; logo do NQTR discreto (opacidade 70%) no canto superior direito. Rodapé padrão (`HorunFooter`): logo NQTR + "<módulo> — um projeto Horun — <autoria>". Ícones da interface do Core são SVG próprios (`frontend/src/icons.tsx`), nunca emoji.

**Codinomes internos — regra dura**: os codinomes de desenvolvimento (ex. "Ogun" pro RE7S) são **puramente internos** e **nunca** aparecem — em interface, resposta de API, `MODULE.md`, README, `pyproject`, rodapé, ou qualquer texto que um usuário do laboratório possa ver. Não há campo de codinome no modelo `Module`, nas respostas do backend, nos tipos do frontend, nem no `HorunFooter`.

## 3. Contrato de módulo

Todo módulo compatível com o Horun fornece (versão completa e autocontida em [`Prompt_Horun_Modulo.md`](Prompt_Horun_Modulo.md)):

- `MODULE.md` na raiz (manifesto: id, nome público, ícone, descrição curta, porta interna) — referência pro administrador cadastrar o módulo no Core (o cadastro em si é manual, em Administração → Módulos). Sem codinome.
- `GET /health` sem autenticação, respondendo `{"status": "ok"}` — usado pelo dashboard de status (seção 5).
- Backend que aceita identidade via cabeçalhos do Core (produção) **ou** modo standalone com usuário fixo (`HORUN_DEV_MODE=true`).
- `Dockerfile` de backend e frontend no padrão Python 3.11-slim + FastAPI/SQLModel; Vite+React+Tailwind.
- Frontend importando o `design-system` em vez de recriar cores/tema.
- SPA buildada sob `/m/<id>/` para poder ser aberta dentro do Core (`Prompt_Horun_Modulo.md`, seção 6).
- Nenhuma porta exposta ao host — só alcançável via `horun-network`.

Esqueleto pronto em `module-template/`; gerador em `create_horun_module.py`.

## 4. Login e usuários do Active Directory

**Decidido não fazer por ora** (usuário, 2026-09-16): a importação automática de usuários do domínio `NQTRlab.INT` foi descartada — o cadastro manual pelo administrador máximo é suficiente. Se voltar à pauta, a decisão de desenho que já havia sido tomada era: importar o cadastro via LDAP (nome, login) mas manter **senha própria do Horun** (não SSO), o que exigiria uma conta de serviço de leitura no `nqtrmaster`.

## 5. Dashboard de status — visível a todos

Todo usuário autenticado vê a lista de módulos cadastrados e seu status (operacional/offline, via `GET /health`), **independente de ter permissão de uso**. Clicar num módulo sem permissão mostra "sem acesso — solicite ao administrador". Módulo sem container rodando aparece como "offline", não some da lista. Exceção: módulo marcado `unlisted` some do catálogo pra quem não tem acesso (seção 6).

## 6. Papéis e permissões

**Níveis de permissão por posição** (decisão do usuário, 2026-10-01). O nível vem **só da posição** da pessoa (`User.position`), atribuída por um coordenador em Administração → Usuários. Não existe mais "tornar admin". Regra única em `backend/app/core/permissions.py`; as rotas usam as dependências de `deps.py` (`CoordinatorUser`, `ModuleAdminUser`, `EquipmentManagerUser`, `ModeratorUser`); o frontend recebe o resultado pronto em `user.can`.

| Nível | Quem | Pode |
|---|---|---|
| 1 · Administrador máximo | **só a conta original** (`User.is_protected`, nunca excluída nem rebaixada) | tudo, inclusive **cadastro e integração de módulos** (URLs internas, ícone, créditos) e a caixa de sugestões |
| 2 · Coordenador(a) | posição Coordenador(a) | tudo menos cadastro/integração de módulos: usuários e posições, permissões de módulo (inclusive público/oculto), grupos, equipamentos, moderação, telefones no diretório, acesso a todo módulo |
| 3 · Pesquisador(a) | posição Pesquisador(a) | moderação: fixar/editar/remover avisos e respostas de outros, eventos do laboratório, mover/editar reservas de outros, editar e **conferir** a ficha RUE. Não cria usuários, não dá permissões, não mexe em módulos nem em equipamentos |
| 4 · Técnico(a) | posição Técnico(a) | o mesmo do pesquisador **+ criar/editar equipamentos, áreas e tipos** |
| 5 · Iniciação Científica | posição IC **ou sem posição** (o mais restrito, de propósito) | uso básico: publicar, reservar, registrar uso, editar o que é seu |

- **Migração**: quem tinha sido promovido a administrador máximo (`is_super_admin` sem ser a conta original) virou Coordenador(a), e a flag foi zerada (`migrate_promoted_admins_to_coordinators` em `db/session.py`, idempotente). `is_super_admin` hoje é legado: só fica verdadeiro na conta original e não decide nada.
- **Grupos**: o admin interno de um grupo tem que ter nível 1 a 4 (quem já modera); criar/excluir grupo e trocar o admin interno é de coordenador.
- **Para os módulos**: `X-Horun-Role` continua `admin` (nível 1-2) ou `user`; os cabeçalhos novos `X-Horun-Level` (1-5) e `X-Horun-Level-Name` (`admin`/`coordenador`/`pesquisador`/`tecnico`/`ic`) são opcionais (`Prompt_Horun_Modulo.md`, seção 5).
- **Acesso a módulo**: tabela `user_module_access` (usuário, módulo, concedido por, quando). Binário — o Core decide **se** a pessoa entra; o módulo decide **o que** ela faz lá dentro.
- `Module.public` = todo autenticado tem acesso; `Module.unlisted` = some da listagem pra quem não tem acesso. As concessões individuais continuam guardadas por baixo — desligar o toggle volta a valer o que já existia.

## 7. Acesso a pastas do `nqtrmaster` como armazenamento paralelo

Pedido do usuário: o Horun (Core e/ou módulos) deve conseguir gravar em compartilhamentos existentes no `nqtrmaster` — fichas de utilização, dados de equipamento, tratamento de dados. Candidatos: `Dados Equipamentos`, `Registro de Utilização Etiquetas e Fichas de Identificação`.

**Desafio técnico**: os containers rodam Linux (WSL2) — acessar SMB exige montar o compartilhamento dentro do container (`cifs-utils`) ou montar no host Windows e expor via bind mount. Os dois exigem uma **conta de serviço** com escrita nesses compartilhamentos (não usar o perfil `equipamento` compartilhado).

**[A DEFINIR]**: quais pastas e com que estrutura (subpasta por módulo?); criar a conta de serviço no AD; mecanismo técnico (mount no container vs. bind mount).

## 8. Estado atual

### 8.1 O que existe hoje (por área)

Backend com **239 testes automatizados** (`backend/tests/`), todos passando; cada entrega também validada no navegador.

- **Gateway e módulos** — login com sessão em cookie; `Module` + `UserModuleAccess`; dashboard agregando `/health`. `/m/{id}/*` (`routes_proxy.py`) decide pelo primeiro segmento: `api/...` → `Module.internal_base_url`; qualquer outra coisa → `Module.internal_frontend_url` (estáticos da SPA) — checando permissão nos dois casos e injetando os cabeçalhos de identidade. A barra lateral lista os módulos com acesso e `embeddable=true` como `<a>` (cada módulo é uma SPA própria, carregamento de página real). **Plugados de verdade**: RE7S (com o Agente Horun no PC do equipamento — ver `Prompt_refinado.md` do RE7S, seções 14-18), Amostras e Reagentes.
- **Usuários e perfil** — `username` é slug obrigatório (`^[a-zA-Z0-9._-]{2,}$`, senão a `@menção` quebra no espaço); admin renomeia pela tabela. `position`/`qualification` de listas fixas (`POSITIONS`/`QUALIFICATIONS` em `models.py`, com marcador "(a)"), só coordenadores atribuem — **a posição define o nível de permissão** (seção 6). **Conta sem senha**: admin cria sem senha → `setup_code` (6 hex) mostrado uma vez → "Primeiro acesso" na tela de login (`POST /auth/set-password`); login numa conta sem senha retorna `428`; `POST /users/{id}/regenerate-setup-code` zera a senha. `POST /auth/change-password` troca a qualquer momento. Autoatendimento em `/perfil` (`PATCH /auth/me`): nome, e-mail, telefone, nome de exibição, data de nascimento (3 inteiros opcionais, ano opcional), foto (bytes no banco, ≤2 MB, `GET /users/{id}/photo`), preferência de e-mail. Modal de onboarding no 1º acesso (`User.onboarded`).
- **Colaboradores** (`/colaboradores`, `GET /users/directory`) — foto, nome, cargo, qualificação, e-mail públicos; **telefone só para coordenadores** (nível ≤ 2); `username`/papel nunca expostos.
- **Mural** (`/`) — avisos com anexo opcional (1 imagem/PDF ≤5 MB, `POST /posts` multipart); admin fixa; respostas em um nível; `@menção` com autocompletar (`GET /users/mentionable`); autor, admin máximo ou admin interno do grupo edita/remove. Escopo laboratório ou grupo (`Post.group_id`).
- **Notificações** — `Notification` (`mention`/`reply`/`birthday_week`), sininho com polling de 45 s; abrir o painel marca tudo como lido. Nunca notifica a si mesmo; menção vence resposta.
- **E-mail** — SMTP direto do backend (`app/core/email.py`, em thread; Gmail dedicado + senha de app). Inerte sem `SMTP_HOST/PORT/USER/PASS/FROM` no `.env`. Dispara em menção, resposta e digest semanal; `User.email_notifications` desliga por pessoa.
- **Agendador** — APScheduler em processo (`app/core/scheduler.py`): lembrete de aniversários seg 07:30 (America/Sao_Paulo), idempotente por semana via `AppState`; `POST /admin/reminders/weekly-birthdays` dispara na hora. Desligado nos testes (`CORE_SCHEDULER=0`).
- **Agenda** (`/agenda`) — `Equipment` + `Reservation` (sem sobreposição no mesmo equipamento); clicar abre edição, arrastar move (inclusive de dia/equipamento), borda de baixo redimensiona (snap 15 min), reversão se o servidor recusar. Legenda liga/desliga equipamentos (`localStorage`). `Event` separado de `Reservation` (sem conflito, pode ser dia inteiro): do laboratório só o admin máximo cria; de grupo, só o admin interno. Aniversários projetados dos perfis, sem tabela (29/02 → 28/02 em ano não bissexto). Reserva editável pelo criador ou admin; reserva/evento de admin, só admin.
- **Grupos** — `Group` + `GroupMembership` (`routes_groups.py`, visibilidade em `app/core/groups.py`). Só o admin máximo cria/exclui; o `internal_admin_id` tem que ser admin máximo, entra como membro e não sai sem reatribuir. Excluir grupo leva seus posts/eventos.
- **Busca global** (`GET /search`) — avisos, equipamentos, módulos e pessoas, respeitando escopo de grupo; nunca devolve dado privado.
- **Equipamentos** (`/equipamentos`, `/equipamentos/:id`) — `EquipmentArea` (onde fica) e `EquipmentType` (o que é) como filtros independentes; perfil com fabricante/modelo/série/patrimônio, voltagem (`EQUIPMENT_VOLTAGES`), foto, módulo vinculado (badge de status no card), AnyDesk (`anydesk:<id>`), pasta de POPs (**caminho copiável, nunca link** — `file://` não navega a partir de HTTPS). Página de detalhe em abas: **Ficha de utilização (RUE)** no formato da ficha de papel (`EquipmentLog`: objetivo `USAGE_PURPOSES`, código do experimento, início/fim, "conferido por" só pelo admin máximo; autor ou admin edita/remove), Agenda (mini-grade da semana) e Informações; QR code imprimível. `id` validado como slug; `POST /equipment/rename` corrige ids ruins (inclusive com "/"), reapontando reservas e fichas. Na Administração → Equipamentos, "renomear" troca só o **nome de exibição** (o id e o histórico ficam iguais; nome vazio é recusado) e "renomear id" troca o id.
- **Caixa de sugestões** — lâmpada flutuante em toda tela; qualquer um envia, só o administrador original lê (`routes_suggestions.py`).
- **Exclusões com histórico** — excluir usuário ou equipamento que tem histórico (aviso, reserva, ficha, evento) é **bloqueado com mensagem**; para "revogar" uma pessoa, gerar novo código de acesso em vez de excluir.

### 8.2 Lições aprendidas — regras para não repetir

1. **Toda coluna nova** num modelo com tabela em produção precisa de `_ensure_column` em `_run_migrations()` (`app/db/session.py`) — `create_all` nunca adiciona coluna a tabela existente — e o `_out()` da rota tem que tolerar `None` em linhas antigas. A migração só roda quando o backend **reinicia de verdade**.
2. **Dependências do backend têm versão exata travada** no `pyproject.toml`. Um rebuild sem trava já trouxe um SQLModel novo que quebrou produção. Atualizar deliberadamente, rodar a suíte, só então subir.
3. **Hora local é `NaiveDatetime`** (`start_at`/`end_at` de `Event`/`Reservation`; `occurred_at`/`ended_at`/`verified_at` de `EquipmentLog`); `created_at`/`granted_at`/`added_at` são tz-aware (`utcnow()`). O frontend manda limites com `toLocalIso` (`lib/datetime.ts`), nunca `toISOString()`.
4. **Todo id que vai em URL** precisa ser validado como slug na criação (+ `slugify` no formulário) e passar por `encodeURIComponent` no frontend. Um "/" no id não tem conserto pela URL — só por rota com o id no corpo. **Ainda falta aplicar a `Module.id`** (seção 8.3).
5. **Erro nunca vira "lista vazia"** — o frontend mostra a mensagem de erro de carregamento. Ações destrutivas sempre com confirmação e tratamento de erro visível.
6. **SQLite (dev) não reforça chave estrangeira; Postgres (produção) sim** — testar o caminho de exclusão com histórico.
7. **Tailwind v4 não escaneia `node_modules`** — por isso `@source "./*.tsx";` em `design-system/src/tokens.css`.
8. **`<img>` de rota autenticada** em dev cross-origin precisa de `crossOrigin="use-credentials"`; troca de foto usa cache-buster `?v=` (`userVersion` no `AuthContext`).
9. **Caddy catch-all `:443`** (sem hostname) precisa de `tls internal { on_demand }`, senão todo handshake falha com `internal_error`.
10. **O proxy nunca repassa identidade vinda do navegador** (`build_forward_headers` em `routes_proxy.py`). Até 2026-10-01 ele copiava os cabeçalhos do cliente e só depois acrescentava os `X-Horun-*` — o Starlette entrega os nomes em minúsculas, o Core escrevia com outra caixa, e o módulo recebia **os dois**, lendo o forjado: qualquer usuário logado virava admin ou outra pessoa dentro de qualquer módulo. Hoje os nomes de identidade são reservados (descartados na entrada, sem diferenciar maiúsculas) e o cookie de sessão do Core não segue para o módulo. Teste de regressão em `tests/test_proxy.py`. Todo cabeçalho de identidade novo entra em `RESERVED_IDENTITY_HEADERS`.
11. **Login endurecido (2026-10-02)** — `app/core/rate_limit.py`: 5 erros por usuário / 20 por IP em 15 min → 429 (login e primeiro acesso; usuário inexistente gasta o mesmo tempo de bcrypt). Código de primeiro acesso com 8 caracteres sem ambíguos (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), validade de 7 dias (`User.setup_code_expires_at`), comparação em tempo constante. `User.session_version` no token: trocar senha, coordenador definir senha ou "gerar novo acesso" derruba todas as sessões daquela pessoa (quem trocou a própria senha continua logado). Cookie `Secure` via `CORE_COOKIE_SECURE=true` (no compose). Middleware recusa POST/PUT/PATCH/DELETE com `Origin` de outro site. Caddy: `nosniff`, `X-Frame-Options SAMEORIGIN`, `Referrer-Policy`. O limitador é em memória — vale enquanto o backend tiver um worker só.
12. **Em produção, o Core não sobe com `CORE_SECRET_KEY` de exemplo ou com menos de 32 caracteres** (`config.check_production_settings`) — com a chave conhecida, qualquer um forja o cookie de sessão de qualquer pessoa.

### 8.3 Ainda não implementado

1. **Certificado confiável (fim do aviso self-signed)** — esperando alinhamento com a coordenação. Caminho preferido: domínio próprio barato (~R$ 40–70/ano) + DNS na Cloudflare + Let's Encrypt via **DNS-01** (sem abrir porta pra internet; registro A público `horun.<domínio>` → IP privado da caixa). Alternativas: `dedyn.io` grátis (deSEC), ou CA interna distribuída por GPO no `nqtrmaster`. Mudança só em `deploy/Dockerfile` (Caddy com plugin DNS via `xcaddy`), `deploy/Caddyfile` (site nomeado, IP como fallback) e 3 variáveis no `.env`. Rede: os PCs do laboratório (Wi-Fi) já alcançam a caixa; PC pessoal "de fora" é barrado por dispositivo no roteador.
2. **Pastas do `nqtrmaster`** (seção 7).
3. **Validação de `Module.id`** — mesmo bug latente já corrigido em `Equipment.id` (lição 4); não reproduzido ainda.
4. **E-mail de eventos da Agenda** — sem decisão de qual parte primeiro: (a) e-mail ao criar evento (uma chamada a mais em `routes_events.py`); (b) lembrete "faltam X min" (job novo no agendador, controlando quem já foi notificado).
5. **Descrição de evento no formulário** — `Event.description` já existe no backend; falta expor em `AgendaPage` (e no e-mail do item 4).
6. **Campos de perfil novos** — CPF, Lattes (proposto público), contato de emergência (nome + telefone), alergias/condições médicas, tipo sanguíneo (`<select>` de 8). Proposto (não confirmado): dados sensíveis visíveis só pra própria pessoa + admin máximo, nunca no diretório.
7. **Crachá automático** a partir do modelo NQTR (`Modelo 2.ai`): frente com foto circular, nome, cargo/qualificação, QR code (proposto: vCard); verso com contato, emergência, alergias, tipo sanguíneo. Depende do item 6.
8. **Anexos em respostas do Mural** — baixa prioridade.
9. **Equipamentos, Fase C** — sincronizar a ficha RUE do Core com o histórico interno de cada módulo; não desenhado.
10. **Achados da revisão de 2026-10-01 ainda abertos** (o mais grave, identidade forjada pelo proxy, já foi corrigido — lição 10):
    - ~~login/código sem limite de tentativas, sessões que não caíam, cookie sem `secure`, Caddy sem cabeçalhos, sem checagem de `Origin`, sem backup~~ — **resolvidos em 2026-10-02** (lições 11 e 12; backup na seção 9.4). O `428` do login continua revelando quais contas esperam código (necessário para a tela levar ao "Primeiro acesso"), agora com limite de tentativas e código forte;
    - anexo de aviso de grupo baixável por quem não é do grupo (`GET /posts/{id}/attachment`);
    - excluir módulo com permissões/créditos/equipamento vinculado dá 500 no Postgres;
    - a busca global mostra módulos `unlisted`; o dashboard checa a saúde dos módulos em série (bloqueia o servidor com módulos fora do ar);
    - `@nome.` com ponto final não notifica; ~25 `catch` silenciosos no frontend (contra a lição 5).

### 8.4 Descartado (não repropor sem motivo novo — usuário, 2026-09-16)

- Importação de usuários do AD (seção 4).
- Busca dentro dos módulos — a busca global do Core basta.
- Importar manualmente os dados antigos de Amostras/Reagentes.

## 9. Infraestrutura — servidor dedicado, Docker e TLS

### 9.1 Onde roda — servidor dedicado, não o `nqtrmaster`

O `nqtrmaster` (`192.168.31.2`) é o **controlador de domínio (AD DC)** do laboratório (`NETLOGON`/`SYSVOL` presentes, domínio `NQTRlab.INT`). **Decisão fechada**: nenhum serviço do Horun roda nele — app num DC aumenta a superfície de ataque e arrisca o domínio inteiro.

**Máquina atual**: `DESKTOP-N6KR7DO` — Windows 11 Pro 64 bits, 15,4 GB RAM, ~222 GB, AMD64, placa Gigabyte A520M K V2 (SVM Mode habilitado na BIOS). Ligada via **Wi-Fi**. (O primeiro candidato, `NQTR-PC37`, foi qualificado mas liberado pra outro uso.)

**IP fixo: `192.168.31.80`** (fixado pelo usuário em 2026-10-02). Acesso: `https://192.168.31.80`. Antes disso a máquina não tinha IP fixo: o combinado era `.171`, e em 2026-09-14 o DHCP trocou para `.117` sem aviso e o acesso parou (máquina e containers saudáveis — só o endereço mudou). Ao trocar de IP, atualizar também o `server_url` do `config.json` do Agente Horun no PC do equipamento. Se possível, cabo Ethernet em vez de Wi-Fi. Diagnóstico rápido: `ipconfig` na própria máquina.

**[A DEFINIR]**: nome DNS interno (ex. `horun.nqtrlab.int`, depende de criar registro no `nqtrmaster`); se a máquina entra no domínio (não obrigatório — o Horun tem login próprio).

### 9.2 Checklist de qualificação de um PC dedicado (reaplicar se trocar de máquina)

1. **Identificar** — `hostname` e `ipconfig` na máquina.
2. **Confirmar que não é DC** — `net view \\<hostname>`; se aparecer `NETLOGON`/`SYSVOL`, descartar.
3. **Reachability**, de outro PC da rede:
   ```powershell
   ping -n 2 <hostname-ou-IP>
   Resolve-DnsName <hostname>
   Test-NetConnection <hostname> -Port 445
   Test-NetConnection <hostname> -Port 3389
   ```
4. **Specs**, na máquina candidata — mínimo: Windows 10/11 **Pro** (não Home), RAM ≥ 8 GB, ≥ 20 GB livres, AMD64:
   ```powershell
   Get-CimInstance Win32_OperatingSystem | Select-Object Caption, OSArchitecture, Version, BuildNumber
   [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB,1)
   Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, @{N="TamanhoGB";E={[math]::Round($_.Size/1GB,1)}}, @{N="LivreGB";E={[math]::Round($_.FreeSpace/1GB,1)}}
   $env:PROCESSOR_ARCHITECTURE
   Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product
   ```
5. **Virtualização** — `Get-ComputerInfo -Property "HyperVRequirementVirtualizationFirmwareEnabled"` (ou Gerenciador de Tarefas → Desempenho → CPU). Se `False`: habilitar Intel VT-x / AMD SVM na BIOS (na Gigabyte A520M K V2: `M.I.T. → Advanced Frequency Settings → Advanced CPU Core Settings → SVM Mode`).
6. **Docker Desktop** — `wsl --install`, reiniciar, instalar o Docker Desktop (WSL 2), testar `docker run hello-world`.
7. **Rede compartilhada** (uma vez só) — `docker network create horun-network`.
8. **Código** — `git clone`, `.env.example` → `.env` com valores reais, `docker compose up -d --build` (ver [`README.md`](README.md)).

### 9.3 Deploy e TLS

- **Docker (`docker compose`)** — decisão fechada. Mitigações obrigatórias: (1) Postgres sempre em **volume nomeado**; (2) nenhuma porta exposta ao host além de 443/80 do proxy; (3) backup do Postgres como camada independente do Docker.
- **Arquivos**: `docker-compose.yml` (`db` Postgres 16, `backend`, `proxy`), `deploy/Dockerfile` (build do frontend + Caddy), `deploy/Caddyfile` (`/api/*` e `/m/*` → backend; `:80` → `:443`), `.env.example`. O backend do Core também entra na rede externa `horun-network`, por onde alcança o backend/frontend de cada módulo pelo nome do container.
- **TLS: self-signed** via `tls internal` do Caddy — aviso aceito uma vez por pessoa/PC. Migração para certificado confiável: seção 8.3, item 1.

### 9.4 Backup do Postgres e restauração

Cada projeto com banco (Core, RE7S — e todo módulo novo, ver `Prompt_Horun_Modulo.md`) tem um serviço **`db-backup`** no `docker-compose.yml`: mesma imagem `postgres:16-alpine` do banco, rodando `deploy/backup/pg_backup.sh`.

- Faz um `pg_dump -Fc` (formato custom, comprimido) **ao subir e a cada `BACKUP_INTERVAL_HOURS`** (padrão 24), confere que o arquivo abre (`pg_restore --list`) e só então o renomeia para `<prefixo>_AAAA-MM-DD_HHMM.dump` — um dump interrompido nunca parece válido.
- Apaga os dumps do próprio prefixo com mais de `BACKUP_KEEP_DAYS` (padrão 30).
- Grava em **`BACKUP_DIR`** (no `.env`), uma pasta do Windows **fora do volume do Docker e do repositório** — sobrevive a `docker compose down -v` e a um Docker corrompido. Sugestão: `C:/HorunBackups/core` e `C:/HorunBackups/re7s`, e copiar essa pasta para fora da máquina (OneDrive, HD externo, outro PC) — backup só na mesma máquina não protege contra perda do disco.
- Conferir que está rodando: `docker compose logs db-backup` (uma linha `ok: <arquivo> (<tamanho>)` por dump) e a pasta `BACKUP_DIR`.
- Forçar um dump agora: `docker compose run --rm -e BACKUP_ONCE=1 db-backup`.

**Restaurar** — a pasta de backup já está montada em `/backups` dentro do `db-backup` (que também já tem a senha do banco), então o `pg_restore` roda lá, sem copiar arquivo:

```powershell
# 1. parar quem escreve no banco
docker compose stop backend
# 2. ver os dumps disponíveis
docker compose exec db-backup ls -lh /backups
# 3. restaurar o escolhido por cima do banco atual
#    Core: -d horun_core   |   RE7S: -d horun_re7s
docker compose exec db-backup pg_restore --clean --if-exists --no-owner -d horun_core /backups/horun_core_2026-10-02_0300.dump
# 4. subir de novo
docker compose start backend
```

Vale testar uma restauração uma vez (num banco de teste ou numa cópia), antes de precisar de verdade.

### 9.5 Agente no PC do equipamento (padrão para módulos que gravam em arquivo local)

O site roda no servidor; quem escreve no disco do equipamento é um **agente local** instalado só no PC do equipamento. O agente **inicia a conexão pra fora** (não abre porta de entrada), autentica com **token próprio por instalação** (nunca o perfil compartilhado `equipamento`), escreve por substituição atômica, e o site marca gravações como "pendentes" quando o agente está offline, reenviando depois. Implementado no RE7S (`Prompt_refinado.md` do RE7S, seções 14-18). O **Leco** não tem caminho pra isso ainda — o Cornerstone do LECO 832 roda sem licença de rede.
