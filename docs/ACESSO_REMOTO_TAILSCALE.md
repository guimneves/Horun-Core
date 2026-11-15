# Acessar o Horun de casa com o Tailscale

O Tailscale cria uma rede privada (VPN) só entre os seus aparelhos. O servidor
do Horun continua **invisível para a internet** — nenhuma porta é aberta no
roteador nem no firewall da UFRJ — e o notebook ou o tablet, de qualquer lugar,
enxergam o servidor como se estivessem no laboratório.

Antes de começar: vale um aviso à TIC do IQ/UFRJ (alguns setores preferem a VPN
institucional, se houver). O plano gratuito do Tailscale atende uso pessoal
(até 3 usuários).

## 1. Criar a conta

1. Abra <https://login.tailscale.com> e entre com uma conta Google, Microsoft ou
   GitHub. **Ligue a verificação em duas etapas nessa conta** — quem entra nela
   entra na sua rede.
2. Essa conta passa a ser a dona da rede (o "tailnet").

## 2. Instalar no servidor do Horun (Windows)

1. No servidor, baixe e instale: <https://tailscale.com/download/windows>.
2. No ícone do Tailscale (perto do relógio) → **Log in** → entre com a conta do passo 1.
3. **Rodar mesmo sem ninguém logado:** ícone → **Preferences** → marque **Run
   unattended** (sem isso, a conexão cai quando o usuário sai do Windows).
4. Confira que está ligado: ícone → deve aparecer **Connected**.

## 3. Ajustes no painel (no navegador, em <https://login.tailscale.com/admin/machines>)

1. **Nome do servidor**: na linha do servidor → `…` → **Edit machine name** →
   `horun-servidor`. Com o MagicDNS (ligado por padrão), dá para usar o nome em
   vez do número.
2. **Sem expiração**: `…` → **Disable key expiry**. Sem isso, a cada 180 dias o
   servidor sai da rede até alguém entrar de novo nele.
3. **Etiqueta**: `…` → **Edit ACL tags** → adicione `tag:horun` (se pedir, faça
   antes o passo 4 e volte aqui).

## 4. Regra de acesso: só o Horun (porta 443)

Painel → **Access controls** → substitua o conteúdo por:

```json
{
  "tagOwners": {
    "tag:horun": ["autogroup:admin"]
  },
  "acls": [
    // seus aparelhos acessam SÓ a página do Horun (HTTPS) no servidor
    {"action": "accept", "src": ["autogroup:member"], "dst": ["tag:horun:443"]}
  ]
}
```

→ **Save**. Assim, pela VPN, ninguém alcança o banco, o Docker nem as portas
do Agente (8001–8003) — essas só o PC do Rock-Eval usa, pela rede local, como
hoje.

## 5. Instalar no notebook e no tablet

- **Notebook** (Windows/Mac/Linux): <https://tailscale.com/download> → instale →
  **Log in** com a mesma conta.
- **Tablet/celular**: app **Tailscale** na App Store ou na Play Store → entre com
  a mesma conta → ligue a chave.

## 6. Entrar no Horun

Com o Tailscale ligado no aparelho, abra no navegador:

```
https://horun-servidor
```

(ou `https://100.x.y.z` — o número aparece no painel, na linha do servidor).
Vai aparecer o **mesmo aviso de certificado** da rede do laboratório (o
certificado do Horun é interno): **Avançado → continuar**. Depois, o login normal
do Horun. Os módulos (RE7S, GeoHorun, Financeiro…) funcionam igual.

## Quando não funcionar

| Sintoma | O que olhar |
|---|---|
| A página não abre | Tailscale ligado no aparelho? No painel, o servidor aparece **Connected**? (último contato recente) |
| Abria e parou depois de meses | A expiração da chave do servidor (passo 3.2) ficou ligada — entre no servidor e faça login de novo |
| Servidor some quando ninguém está logado | **Run unattended** (passo 2.3) |
| "Conexão recusada" | O Horun está de pé? No servidor: `docker compose ps` na pasta do Core |
| Erro só no nome, pelo número funciona | MagicDNS desligado: painel → **DNS** → ligue **MagicDNS** |

Teste rápido no notebook (Prompt de Comando): `tailscale ping horun-servidor`.

## Terminal do servidor de casa (SSH, sem AnyDesk)

O Windows já traz um servidor SSH (OpenSSH). Com ele, pelo Tailscale, você abre
o PowerShell do servidor de qualquer lugar: `ssh horun-servidor`. (O "Tailscale
SSH" não serve: não funciona em servidor Windows.)

### No servidor — PowerShell **como administrador**

1. Instalar e ligar o serviço (e deixar ligando sozinho):

   ```powershell
   Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
   Start-Service sshd
   Set-Service -Name sshd -StartupType Automatic
   ```

2. Aceitar conexão **só pela VPN** (endereços do Tailscale), não da rede do laboratório:

   ```powershell
   Set-NetFirewallRule -Name OpenSSH-Server-In-TCP -RemoteAddress 100.64.0.0/10
   ```

3. Abrir no PowerShell em vez do cmd:

   ```powershell
   New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force
   ```

### Entrar com chave em vez de senha

1. No **notebook** (PowerShell comum): `ssh-keygen -t ed25519` (Enter em tudo; se
   quiser, uma senha para a chave). A chave pública fica em
   `C:\Users\<você>\.ssh\id_ed25519.pub`.
2. No **servidor** (PowerShell como administrador), cole o conteúdo desse
   `.pub` no arquivo das chaves de administradores e acerte as permissões (o
   Windows recusa a chave se outros usuários puderem ler o arquivo):

   ```powershell
   notepad C:\ProgramData\ssh\administrators_authorized_keys
   icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant "Administradores:F" /grant "SYSTEM:F"
   ```

   (Windows em inglês: `"Administrators:F"`.) Se a conta do servidor **não** for
   administradora, a chave vai em `C:\Users\<conta>\.ssh\authorized_keys`.
3. Teste do notebook: `ssh <conta-do-windows>@horun-servidor` — deve entrar sem
   pedir a senha do Windows.
4. Funcionando com a chave, **desligue o login por senha**: no servidor, abra
   `C:\ProgramData\ssh\sshd_config` (Bloco de Notas como administrador), troque
   `#PasswordAuthentication yes` por `PasswordAuthentication no` e reinicie:
   `Restart-Service sshd`.

### Liberar a porta 22 só para você no Tailscale

Em **Access controls**, acrescente uma linha em `"acls"` (só o administrador da
rede — você — chega ao terminal):

```json
{"action": "accept", "src": ["autogroup:admin"], "dst": ["tag:horun:22"]}
```

### Usar

- **Notebook**: `ssh <conta>@horun-servidor` → `cd C:\Horun\PostRun-GeoHorun` →
  `git pull`, `docker compose up -d --build`, `docker compose logs -f`…
  Dica: o **VS Code** com a extensão *Remote - SSH* abre as pastas do servidor
  como se fossem locais.
- **Tablet**: app **Termius** (iOS/Android) → novo host `horun-servidor`, usuário
  da conta do Windows, e a chave (gere no próprio Termius e cole a pública no
  `administrators_authorized_keys`, como no passo 2).
- O Docker responde pelo SSH enquanto o Docker Desktop estiver aberto no
  servidor (ele sobe com o login do Windows).

## Dar acesso a outra pessoa

Painel → **Users** → **Invite users** (o plano gratuito tem até 3 usuários). Ela
instala o Tailscale, entra com a conta convidada e, pela regra do passo 4,
alcança só a página do Horun — dentro do Horun, o que ela vê continua sendo
decidido pelo login e pelo cargo dela no Core. Para um grupo maior de
colaboradores de fora, um túnel com login por e-mail (Cloudflare) fica mais
prático.

## Para tirar

Painel → servidor → `…` → **Remove**; no servidor, desinstale o Tailscale. Nada
no Horun muda.
