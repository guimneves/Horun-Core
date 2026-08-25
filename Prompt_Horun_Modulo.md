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
  docker-compose.yml
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
    tests/
  frontend/
    package.json
    vite.config.ts
    index.html
    tsconfig.json / tsconfig.app.json / tsconfig.node.json
    src/
      main.tsx
      App.tsx
      index.css
      ...
```

## 4. `MODULE.md` — manifesto do módulo

Arquivo texto simples na raiz, assim:

```markdown
# <Nome público do módulo>

- **id**: `<slug-minusculo-sem-espacos>`
- **nome público**: Horun · <Nome>
- **codinome interno**: <um nome temático, ex. divindade associada ao domínio do equipamento — opcional>
- **descrição**: <uma frase>
- **ícone**: <um emoji>
- **porta interna do backend**: 8000
- **health check**: `GET /health`
```

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

**Persistência do tema**: `localStorage`, chave `"horun-theme"` (mesma chave em todo módulo — assim a escolha de tema persiste ao navegar entre módulos, já que tudo roda na mesma origem através do Core). Detecta `prefers-color-scheme` do sistema operacional só no primeiro acesso (sem preferência salva ainda).

**Rodapé padrão**, em toda página: logo do laboratório (NQTR, IQ-UFRJ) + nome do módulo (formato "Horun · Nome") + codinome interno + autoria.

**Chamadas HTTP**: nenhuma configuração especial de CORS ou header de autenticação manual no cliente — quando plugado no Core, tudo roda na mesma origem, e a identidade chega ao backend via cabeçalho injetado pelo gateway, não pelo frontend. Em desenvolvimento standalone, o frontend fala direto com `http://localhost:8000`.

## 7. O que entregar ao final

1. Código completo do backend e frontend seguindo a estrutura acima.
2. `README.md` explicando como rodar em modo standalone (`HORUN_DEV_MODE=true` + `uvicorn` + `npm run dev`), igual ao padrão dos módulos já existentes do Horun.
3. Testes automatizados do backend cobrindo a lógica de negócio principal (pytest).
4. Nenhuma senha, chave ou segredo real commitado — variáveis de ambiente com um `.env.example` de modelo.

Depois de pronto, o mantenedor do Horun (usando Claude Code, com acesso ao restante do projeto) cuida da parte de "plugar" — cadastrar o `MODULE.md` no Core, configurar o `docker-compose.yml` do servidor, e validar permissões. Você não precisa se preocupar com essa parte.
