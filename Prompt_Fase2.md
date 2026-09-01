# Especificação Técnica — Horun, Fase 2 (rede interna do laboratório)

> Documento novo, separado do `Prompt_refinado.md` de cada módulo (que cobre a Fase 1 — protótipo local). Aqui entra o que é **comum a todos os módulos do Horun** (RE7S, Leco, e futuros) na Fase 2: como o site sai do PC do equipamento e vira um serviço acessível pela rede do laboratório. Segue o mesmo formato dos outros documentos do projeto, para uso como briefing de desenvolvimento.
>
> Referências: [`Prompt_refinado.md`](https://github.com/guimneves/RE7S-Horun/blob/main/Prompt_refinado.md) do RE7S (seção 2 — visão de fases; seção 7 — arquitetura proposta para Fase 2, já com boa parte das decisões abaixo herdadas de lá) e `Prompt_refinado_Leco.md` do Leco (ainda não versionado em git — ver `Projeto Horun/Leco/` local).

## 1. Escopo desta fase

- **RE7S**: único módulo com caminho técnico pronto para Fase 2 hoje — Fase 1 já funciona localmente no PC do Rock-Eval (ver [`RE7S-Horun/README.md`](https://github.com/guimneves/RE7S-Horun)). É o candidato natural para migrar primeiro.
- **Leco**: **não é candidato à Fase 2 ainda** — o Cornerstone do LECO 832 roda sem licença de rede (Remote Query/Remote Control/Data Transmit), então não existe hoje um canal nativo do fabricante para ler/escrever dados remotamente. Fica em Fase 1 até isso mudar (ver seção 3 de `Prompt_refinado_Leco.md`).
- Este documento trata da infraestrutura de servidor que vai hospedar o(s) backend(s) — pensada para servir o RE7S agora e qualquer módulo futuro que chegue à Fase 2, sem re-arquitetar a cada módulo novo.

## 2. Decisão de topologia — servidor dedicado, não o `nqtrmaster`

**Descoberta**: `nqtrmaster` (`nqtrmaster.NQTRlab.INT`, `192.168.31.2`) não é um servidor de aplicações genérico — é o **controlador de domínio (AD DC)** do laboratório. Confirmado por:
- Compartilhamentos `NETLOGON` e `SYSVOL` presentes (exclusivos de DCs).
- Portas 135 (RPC), 445 (SMB), 3389 (RDP) e 5985 (WinRM) abertas, TTL=128 (Windows).
- Hostname resolve dentro do domínio `NQTRlab.INT`.

**Decisão fechada**: a stack do Horun (backend FastAPI, PostgreSQL, frontend) **não deve rodar no `nqtrmaster`**. Instalar serviços de aplicação num DC é contra a prática recomendada (Microsoft e segurança em geral) — aumenta superfície de ataque e risco de instabilidade do domínio inteiro do laboratório por causa de um serviço não relacionado a AD/DNS.

**Alternativa escolhida**: usar um **PC extra/ocioso já existente no laboratório**, dedicado a rodar a aplicação Horun, na mesma rede (`NQTRlab.INT`), fisicamente separado do `nqtrmaster`. O `nqtrmaster` continua fazendo só o que já faz (AD, DNS, arquivos) — nenhuma mudança nele.

**PC dedicado — histórico de troca**: o primeiro candidato (`NQTR-PC37`, `192.168.31.86`) foi qualificado com sucesso (Windows 11 Pro, Docker funcionando) mas **precisou ser liberado para outro uso** antes de o deploy ser finalizado. Nenhum dado foi perdido (nada tinha ido além de testes).

**PC dedicado atual — qualificado**: `DESKTOP-N6KR7DO`, IP `192.168.31.171` (mesma sub-rede `192.168.31.x` do `nqtrmaster`) — máquina diferente do `NQTR-PC37`, mas do mesmo lote de compra do laboratório, com specs idênticas: Windows 11 Pro 64 bits (build 26200), 15,4 GB RAM, ~222 GB de disco, AMD64, placa-mãe Gigabyte A520M K V2. Checklist da seção 2.1 aplicado com sucesso: não é controlador de domínio (`net view` sem `NETLOGON`/`SYSVOL`), reachability confirmada, virtualização (SVM Mode) habilitada na BIOS pelo mesmo caminho do `NQTR-PC37`, Docker Desktop instalado e funcionando (`docker run hello-world` ok).

**[A DEFINIR]**: se está no domínio `NQTRlab.INT` ou não (não bloqueante, ver seção 4) — hostname padrão do Windows (`DESKTOP-N6KR7DO`) sugere instalação nova, ainda não configurada/nomeada pelo laboratório.

### 2.1 Checklist de qualificação de um PC dedicado (reaplicar para a próxima máquina)

Passos, na ordem, para qualificar qualquer PC candidato — é exatamente o que foi feito com o `NQTR-PC37` a primeira vez, generalizado para reaplicar sem precisar redescobrir cada coisa do zero:

1. **Identificar a máquina** — hostname e IP (`hostname` e `ipconfig` rodados nela, ou levantados por quem administra a rede).
2. **Confirmar que NÃO é um controlador de domínio** — `net view \\<hostname>`; se aparecerem os compartilhamentos `NETLOGON`/`SYSVOL`, é um DC (como o `nqtrmaster`) e está descartada (seção 2).
3. **Confirmar reachability a partir de outra máquina da rede** (rodar de qualquer PC já na rede do laboratório):
   ```powershell
   ping -n 2 <hostname-ou-IP>
   Resolve-DnsName <hostname>
   Test-NetConnection <hostname> -Port 445   # SMB
   Test-NetConnection <hostname> -Port 3389  # RDP
   ```
4. **Levantar specs, rodado na própria máquina candidata**:
   ```powershell
   Get-CimInstance Win32_OperatingSystem | Select-Object Caption, OSArchitecture, Version, BuildNumber
   [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB,1)   # RAM
   Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, @{N="TamanhoGB";E={[math]::Round($_.Size/1GB,1)}}, @{N="LivreGB";E={[math]::Round($_.FreeSpace/1GB,1)}}
   $env:PROCESSOR_ARCHITECTURE   # precisa ser AMD64, não ARM64
   Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product   # útil pra saber o caminho exato da BIOS, se precisar
   ```
   Mínimo recomendado (o que o `NQTR-PC37` tinha e era suficiente): Windows 10/11 **Pro** (não Home — Home não faz Hyper-V/domínio), qualquer RAM ≥ 8 GB, ≥ 20 GB livres em disco, arquitetura AMD64.
5. **Verificar se a virtualização está habilitada**:
   ```powershell
   Get-ComputerInfo -Property "HyperVRequirementVirtualizationFirmwareEnabled"
   ```
   Se vier `False`: reiniciar, entrar na BIOS/UEFI (tecla varia por fabricante — `Del`/`F2` mais comuns), habilitar **Intel VT-x** ou **AMD SVM Mode** (no `NQTR-PC37`, Gigabyte A520M K V2, ficava em `M.I.T. → Advanced Frequency Settings → Advanced CPU Core Settings → SVM Mode`), salvar e sair. Conferir de novo depois de voltar ao Windows — pode usar o Gerenciador de Tarefas → Desempenho → CPU → "Virtualização" como atalho mais rápido que o comando acima.
6. **Instalar o Docker Desktop**:
   ```powershell
   wsl --install
   ```
   Reiniciar. Baixar e instalar o Docker Desktop (docker.com/products/docker-desktop), deixando "Use WSL 2 instead of Hyper-V" marcado (padrão). Testar:
   ```powershell
   docker run hello-world
   ```
7. **Criar a rede Docker compartilhada** (uma vez só, antes do primeiro `docker compose up` de qualquer projeto):
   ```powershell
   docker network create horun-network
   ```
8. **Levar o código pra lá** — `git clone` do(s) repositório(s) (`Horun Core` primeiro, ver [`README.md`](README.md)), copiar `.env.example` → `.env` preenchendo valores reais, `docker compose up -d --build`.

Itens **[A DEFINIR]** de sempre, independente da máquina: nome de rede/DNS (seção 4) e se entra ou não no domínio `NQTRlab.INT` (opcional, seção 4).

## 3. Arquitetura geral (herdada da seção 7.1 do `Prompt_refinado.md` do RE7S)

Fluxo já decidido para o RE7S, que serve de modelo para qualquer módulo futuro em Fase 2:

1. Usuário acessa o site (rodando no novo servidor dedicado) pelo navegador, de qualquer máquina da rede do laboratório.
2. Usuário monta/edita amostras ou ciclos no site.
3. Ao gravar, o servidor envia os dados para um **agente local** instalado só no PC do equipamento (RE7S, e futuramente outros), via chamada HTTPS autenticada — o agente inicia a conexão para fora, não abre porta de entrada.
4. O agente escreve o arquivo local correspondente por substituição atômica e responde sucesso/erro.
5. Se o agente estiver offline, o site marca a gravação como "pendente" e reenvia quando ele reconectar.

**Autenticação do agente**: credencial de serviço própria por instalação (token de API gerado pelo backend), não o perfil de rede compartilhado `equipamento` usado por outros instrumentos do laboratório (evita acoplar a segurança do sistema a um login que outras pessoas/equipamentos também usam).

## 4. Stack e deploy — a definir

Herdado da seção 7.2 do `Prompt_refinado.md` do RE7S como ponto de partida (backend FastAPI, banco PostgreSQL na Fase 2, frontend web servido pelo backend). Decisões:

- **Deploy: via Docker (containers)** — decisão fechada. Docker Desktop (backend WSL2) instalado e **confirmado funcionando** no PC dedicado (`docker run hello-world` ok). Backend, PostgreSQL e reverse proxy rodam como containers via `docker compose`, em vez de Windows Service + IIS nativo.
  - Nota de instalação: essa placa-mãe (Gigabyte A520M K V2, AMD) veio com a virtualização (SVM Mode) desabilitada na BIOS por padrão — precisou ser habilitada manualmente em `BIOS → M.I.T. → Advanced Frequency Settings → Advanced CPU Core Settings → SVM Mode` antes do Docker Desktop conseguir iniciar. Útil registrar caso o PC seja reconfigurado/trocado no futuro.
  - **Mitigações obrigatórias, dado os riscos de Docker levantados em conversa**: (1) PostgreSQL deve usar **volume nomeado** desde o primeiro `docker compose up` — nunca dados só dentro do container, sob risco de perda do histórico imutável ao recriar o container; (2) `docker-compose.yml` não deve mapear nenhuma porta além da 443 (proxy) para fora do host — Postgres e backend só acessíveis entre containers, na rede interna do compose; (3) manter a rotina de backup do Postgres (seção "Preparar o servidor" abaixo) como camada independente do Docker.
- **TLS: self-signed** — decisão fechada. Aviso de "conexão não segura" no navegador, aceito manualmente uma vez por pessoa/PC. Pode migrar para CA interna do AD depois, sem mudar a arquitetura. Implementação via **Caddy** como reverse proxy (em vez de nginx/IIS): a diretiva `tls internal` do Caddy gera e gerencia o certificado self-signed automaticamente, sem passos manuais de `openssl`.
- **[A DEFINIR]** Nome de rede do site (ex. registro DNS interno tipo `horun.nqtrlab.int` apontando para o PC dedicado — depende de acesso para criar registro DNS no `nqtrmaster`, já que ele é o DC).
- **[A DEFINIR]** Se o PC dedicado deve entrar no domínio `NQTRlab.INT` ou ficar fora dele (workgroup) — tecnicamente possível (Windows 11 Pro suporta), mas não obrigatório: a aplicação Horun tem login próprio, independente do Windows.

## 5. Arquivos Docker — criados

Escritos no repositório [`RE7S-Horun`](https://github.com/guimneves/RE7S-Horun) (mesmo onde já vive o backend/frontend da Fase 1):

- `backend/Dockerfile` — imagem Python do backend, instala o pacote com o extra `postgres` (novo, adicionado a `backend/pyproject.toml`) para ter o driver do PostgreSQL. Endpoint `/health` usado como healthcheck.
- `deploy/Dockerfile` — build em duas etapas: builda o frontend (Node/Vite) e copia o resultado estático para uma imagem do **Caddy**, que serve tanto o site quanto o proxy da API.
- `deploy/Caddyfile` — `:443` com `tls internal` (self-signed automático); `/api/*` vai para o backend (prefixo removido antes de chegar lá — as rotas do FastAPI não usam `/api`, então o front foi buildado com `VITE_API_BASE_URL=/api` e tudo fica em mesma origem, sem CORS); `:80` redireciona para `:443`.
- `docker-compose.yml` (raiz do repo) — três serviços: `db` (Postgres 16, volume nomeado `horun_pgdata`, sem porta exposta ao host), `backend` (sem porta exposta ao host), `proxy` (Caddy, único serviço que expõe `443`/`80`).
- `.env.example` (raiz do repo) — modelo dos segredos (`POSTGRES_PASSWORD`, `RE7S_SECRET_KEY`, credenciais do admin bootstrap); copiar para `.env` no PC dedicado e preencher valores reais (já coberto pelo `.gitignore` existente).

**Como subir no PC dedicado** (depois de `git clone` do repositório lá e copiar/preencher o `.env`):
```powershell
docker compose up -d --build
```

**Limitação importante — ainda não é a Fase 2 completa**: essa infraestrutura sobe o site, o login e as telas que só dependem do banco de dados (biblioteca de amostras, histórico, etc.). As telas que gravam no equipamento (`TABSAMPLE.txt`/`savecycle`) **não funcionam ainda**, porque o backend continua com a lógica da Fase 1 (escreve direto num caminho de disco local, que no PC dedicado não existe) — isso só passa a funcionar de verdade quando o **agente** (seção 3, passo 3 abaixo) for construído e o backend for adaptado para falar com ele em vez de escrever localmente.

## 6. Próximos passos

1. ~~Escolher e qualificar o novo PC dedicado~~ — feito: `DESKTOP-N6KR7DO` (seção 2), Docker confirmado funcionando.
2. ~~Criar a rede compartilhada e trazer o código do `Horun Core` pra essa máquina~~ — feito: repositório publicado em `github.com/guimneves/Horun-Core`, clonado e rodando na `DESKTOP-N6KR7DO`.
3. ~~Testar o `docker compose up -d --build` de fato no novo PC e validar login/dashboard~~ — **feito e confirmado em 2026-08-25**: site acessível via `https://192.168.31.171`, login funcionando com a conta de administrador máximo. Bug real encontrado e corrigido no caminho: o `Caddyfile` precisava de `tls internal { on_demand }` (site catch-all `:443` sem hostname não conseguia gerar certificado sozinho — dava erro `internal_error` no handshake TLS para qualquer cliente). Ver seção 8 do [`Prompt_Horun_Core.md`](Prompt_Horun_Core.md).
4. Fechar nome de rede (DNS) — único item ainda **[A DEFINIR]** na seção 4 (TLS já resolvido, self-signed funcionando de verdade em produção).
5. Definir migração de dados SQLite → PostgreSQL (schema já existe da Fase 1; migração deve preservar o histórico imutável — só relevante se algum dia precisar importar dados já existentes de uma instalação Fase 1 real; instalação nova no Postgres não precisa disso, `create_all` já cria o schema atual).
6. Adaptar o backend para falar com o agente em vez de escrever arquivos localmente (endpoints de comando/status — ver seção 3), e construir o agente do RE7S (Windows Service, token de instalação, fila de retry) — ver seção 7.1/7.2 do [`Prompt_refinado.md`](https://github.com/guimneves/RE7S-Horun/blob/main/Prompt_refinado.md) original.
7. Testes de ponta a ponta (site → agente → gravação real) e rollout para os PCs do laboratório.
