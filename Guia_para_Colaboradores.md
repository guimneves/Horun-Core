# Guia para colaboradores — Projeto Horun

Passo a passo para configurar sua máquina e começar a trabalhar no Horun junto com o resto da equipe. Se travar em algum passo, não force — pergunta antes de seguir.

## 1. O que é o Horun (contexto rápido)

O Horun é a plataforma de gestão do parque analítico do laboratório NQTR (IQ-UFRJ) — um "módulo" por equipamento (Rock-Eval, LECO, etc.), todos plugados numa camada central (**Horun Core**) que cuida de login único, permissões e identidade visual. Hoje existem dois repositórios ativos:

- **[Horun-Core](https://github.com/guimneves/Horun-Core)** — a plataforma em si: login, cadastro de módulos, permissões, dashboard, identidade visual compartilhada, template pra criar módulo novo. Comece lendo `Prompt_Horun_Core.md` (arquitetura) e `Prompt_Fase2.md` (infraestrutura do servidor).
- **[RE7S-Horun](https://github.com/guimneves/RE7S-Horun)** — o módulo do Rock-Eval 7S (codinome interno: Ogun). Comece lendo `Prompt_refinado.md`.

Cada repositório tem seu próprio `README.md` com instruções específicas — este guia cobre o que é comum aos dois: preparar sua máquina, e como a gente trabalha em equipe pra não pisar no trabalho um do outro.

## 2. O que instalar

| Ferramenta | Pra quê | Onde baixar |
|---|---|---|
| **Git** | Clonar os repositórios, versionar mudanças | [git-scm.com/download/win](https://git-scm.com/download/win) (Windows) |
| **Python 3.11+** | Rodar o backend (FastAPI) | [python.org/downloads](https://www.python.org/downloads/) — marque "Add python.exe to PATH" durante a instalação |
| **Node.js LTS** | Rodar o frontend (React/Vite) | [nodejs.org](https://nodejs.org/) (baixe a versão "LTS") |
| **Docker Desktop** | Só se for mexer em deploy/infraestrutura — não é necessário pra desenvolvimento normal do dia a dia | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **Editor de código** (recomendado: VS Code) | Editar o código | [code.visualstudio.com](https://code.visualstudio.com/) |
| **Claude Code** | Se for usar IA pra ajudar no desenvolvimento, do mesmo jeito que vem sendo usado no projeto | Peça as instruções de instalação pra quem já usa |

Depois de instalar Git, Python e Node, **feche e abra o terminal de novo** (PowerShell), e confirme que tudo foi reconhecido:

```powershell
git --version
python --version
node --version
npm --version
```

Cada um deve responder com um número de versão, não um erro de "comando não reconhecido".

## 3. Acesso ao GitHub

1. Se ainda não tiver, crie uma conta em [github.com](https://github.com/).
2. Você vai receber um convite por e-mail pra virar colaboradora dos repositórios `RE7S-Horun` e `Horun-Core` (ambos privados) — aceite o convite.
3. Configure seu nome e e-mail no Git (aparece em todo commit que você fizer):
   ```powershell
   git config --global user.name "Seu Nome"
   git config --global user.email "seu-email@exemplo.com"
   ```
4. Na primeira vez que você fizer `git push`, o Windows vai abrir uma janela pedindo pra logar no GitHub pelo navegador — é normal, só autorizar.

## 4. Clonar os repositórios

Escolha uma pasta pra guardar os projetos (ex. `Documentos\Horun`) e rode:

```powershell
git clone https://github.com/guimneves/Horun-Core.git
git clone https://github.com/guimneves/RE7S-Horun.git
```

Isso cria duas pastas, uma pra cada repositório, com todo o código e a documentação.

## 5. Rodando cada projeto localmente

### Horun-Core

```powershell
cd Horun-Core\backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
$env:CORE_BOOTSTRAP_ADMIN_USERNAME = "admin"
$env:CORE_BOOTSTRAP_ADMIN_PASSWORD = "escolha-uma-senha"
uvicorn app.main:app --reload --port 8100
```

Em outro terminal, pro frontend:
```powershell
cd Horun-Core\frontend
npm install
"VITE_API_BASE_URL=http://localhost:8100" | Out-File -Encoding utf8 .env.development.local
npm run dev
```

Acesse `http://localhost:5174` no navegador — deve aparecer a tela de login. Entre com o usuário/senha que você definiu acima (`CORE_BOOTSTRAP_ADMIN_USERNAME`/`PASSWORD`).

### RE7S-Horun

```powershell
cd RE7S-Horun\backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

Em outro terminal, pro frontend:
```powershell
cd RE7S-Horun\frontend
npm install
npm run dev
```

Acesse `http://localhost:5173`.

**Rodando testes** (backend, dos dois projetos):
```powershell
cd backend
.venv\Scripts\python -m pytest
```

## 6. Leitura recomendada antes de mexer em algo

Os dois repositórios têm documentos de especificação vivos — são atualizados conforme decisões vão sendo tomadas, e registram *por quê* as coisas foram feitas de um jeito e não de outro:

- `Horun-Core/Prompt_Horun_Core.md` — arquitetura da plataforma (módulos, login, permissões).
- `Horun-Core/Prompt_Fase2.md` — infraestrutura (servidor, Docker, rede).
- `Horun-Core/Prompt_Horun_Modulo.md` — o "contrato" que todo módulo novo precisa seguir.
- `RE7S-Horun/Prompt_refinado.md` — especificação completa do módulo do Rock-Eval.

Antes de implementar algo novo numa área que você não conhece ainda, vale a pena ler a seção relevante desses documentos — evita retrabalho e mantém tudo consistente. Se estiver usando Claude Code, pode simplesmente pedir pra ele ler o documento relevante antes de começar.

## 7. Como trabalhamos juntos (Git)

Pra evitar que o trabalho de uma pessoa sobrescreva o da outra, **nunca commitamos direto na branch `main`**. O fluxo é:

1. **Antes de começar algo novo**, atualize sua cópia local:
   ```powershell
   git checkout main
   git pull
   ```
2. **Crie uma branch nova** pra essa tarefa, com um nome descritivo:
   ```powershell
   git checkout -b seu-nome/o-que-voce-esta-fazendo
   ```
   Exemplo: `git checkout -b maria/importacao-usuarios-ad`
3. Trabalhe normalmente — edite código, rode testes, commite quando fizer sentido:
   ```powershell
   git add -A
   git commit -m "Descrição curta do que mudou"
   ```
4. **Envie sua branch** (não a `main`) pro GitHub:
   ```powershell
   git push -u origin seu-nome/o-que-voce-esta-fazendo
   ```
5. No GitHub, abra um **Pull Request** (PR) dessa branch pra `main` — o site mostra um botão "Compare & pull request" assim que você faz o push. Descreve o que mudou e por quê.
6. A outra pessoa revisa o PR (ou você mesma, se estiver sozinha numa parte isolada) e faz o merge quando estiver tudo certo.

Isso permite que vocês dois usem Claude Code em paralelo, cada um na sua branch, sem risco de uma sessão sobrescrever o que a outra fez — o Git é quem reconcilia as mudanças no momento do merge, mostrando claramente qualquer conflito.

## 8. Segredos — nunca commitar

Os dois projetos usam um arquivo `.env` (copiado de `.env.example`) pra guardar senhas e chaves — esse arquivo **nunca** é versionado (já está no `.gitignore` de cada repositório). Se em algum momento o Git avisar que você tem um `.env` "pra commitar", **não** força a adição — é sinal de que algo está configurado errado, chama alguém antes de prosseguir.

## 9. Dúvidas

Trava em qualquer passo acima, ou aparece um erro que não faz sentido — não tenta adivinhar. Chama o Guilherme, ou (se estiver usando Claude Code) descreve o erro completo pra ele antes de tentar resolver sozinha.
