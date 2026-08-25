from __future__ import annotations

from fastapi import FastAPI

from app.api import routes_example

app = FastAPI(title="Horun · __MODULE_NAME__", version="0.1.0")

app.include_router(routes_example.router)


@app.get("/health")
def health():
    # Sem autenticação — usado pelo Horun Core para o dashboard de status
    # (Prompt_Horun_Core.md, seção 5). Não expor aqui nada além do status.
    return {"status": "ok", "module": "__MODULE_ID__"}
