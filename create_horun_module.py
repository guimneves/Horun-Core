#!/usr/bin/env python3
"""Gerador de módulo novo do Horun — copia module-template/ para uma pasta
nova, substituindo os placeholders (__MODULE_ID__, __MODULE_NAME__,
__MODULE_DESCRIPTION__) pelos valores
informados. Ver Prompt_Horun_Core.md (seção 3) para o contrato completo
que o módulo gerado segue.

Uso:
    python create_horun_module.py

Ou sem prompts interativos:
    python create_horun_module.py --id leco --name "Leco" \
        --description "Modulo do LECO 832 Series" \
        --dest "../Projeto Horun/Leco Horun Dev"

PostRun de um equipamento (Prompt_Horun_PostRun.md): `--template postrun`
copia postrun-template/ e a parte comum dos PostRuns (postrun-core/) e, se o
Agent-Horun estiver ao lado do Core, o servidor do Agente:
    python create_horun_module.py --template postrun --id postrun-chnso \
        --name "PostRun CHNSO" --dest "../Horun-PostRun-CHNSO"
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATES = {"padrao": HERE / "module-template", "postrun": HERE / "postrun-template"}
TEMPLATE_DIR = TEMPLATES["padrao"]
AGENT_REPO_CANDIDATES = [HERE.parent / "Horun Agent", HERE.parent / "Agent-Horun"]
DESIGN_SYSTEM_DIR = HERE / "design-system"

sys.path.insert(0, str(HERE / "scripts"))
from vendor_design_system import vendor as vendor_design_system  # noqa: E402
from vendor_postrun_core import vendor as vendor_postrun_core  # noqa: E402

PLACEHOLDERS = ["__MODULE_ID__", "__MODULE_NAME__", "__MODULE_DESCRIPTION__"]

# Extensões tratadas como texto — tudo no template hoje é texto, mas a
# lista evita tentar abrir um binário como UTF-8 se o template ganhar um
# arquivo assim no futuro.
TEXT_SUFFIXES = {
    ".py", ".toml", ".md", ".txt", ".json", ".ts", ".tsx", ".css", ".html",
    ".yml", ".yaml", ".gitignore", "",
}


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--template", choices=sorted(TEMPLATES), default="padrao",
        help="padrao (módulo comum) ou postrun (PostRun de um equipamento)",
    )
    parser.add_argument("--id", dest="module_id", help="Id do módulo (slug), ex.: leco")
    parser.add_argument("--name", dest="module_name", help="Nome público, ex.: Leco")
    parser.add_argument("--description", dest="description", help="Descrição curta")
    parser.add_argument(
        "--dest",
        dest="dest",
        help="Pasta de destino (padrão: ../Projeto Horun/<Nome> Horun Dev)",
    )
    return parser.parse_args()


def prompt(label: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{label}{suffix}: ").strip()
    return value or (default or "")


def collect_inputs(args: argparse.Namespace) -> dict[str, str]:
    module_name = args.module_name or prompt("Nome público do módulo (ex.: Leco)")
    if not module_name:
        sys.exit("Nome do módulo é obrigatório.")

    default_id = slugify(module_name)
    module_id = slugify(args.module_id or prompt("Id do módulo (slug)", default_id))

    description = args.description or prompt("Descrição curta do módulo", "")

    default_dest = str(HERE.parent / "Projeto Horun" / f"{module_name} Horun Dev")
    dest = args.dest or prompt("Pasta de destino", default_dest)

    return {
        "module_id": module_id,
        "module_name": module_name,
        "description": description or "(descrição a preencher)",
        "dest": dest,
    }


def replace_placeholders(text: str, values: dict[str, str]) -> str:
    text = text.replace("__MODULE_ID__", values["module_id"])
    text = text.replace("__MODULE_NAME__", values["module_name"])
    text = text.replace("__MODULE_DESCRIPTION__", values["description"])
    return text


def copy_and_fill(target_dir: Path, values: dict[str, str], template_dir: Path = TEMPLATE_DIR) -> None:
    for src_path in template_dir.rglob("*"):
        if "__pycache__" in src_path.parts or "node_modules" in src_path.parts or src_path.suffix in {".pyc", ".db"}:
            continue
        rel = src_path.relative_to(template_dir)
        dst_path = target_dir / rel

        if src_path.is_dir():
            dst_path.mkdir(parents=True, exist_ok=True)
            continue

        dst_path.parent.mkdir(parents=True, exist_ok=True)

        if src_path.suffix in TEXT_SUFFIXES or src_path.name == ".gitignore" or src_path.name == ".dockerignore":
            content = src_path.read_text(encoding="utf-8")
            content = replace_placeholders(content, values)
            dst_path.write_text(content, encoding="utf-8")
        else:
            shutil.copyfile(src_path, dst_path)


def main() -> None:
    args = parse_args()
    values = collect_inputs(args)

    target_dir = Path(values["dest"]).resolve()
    if target_dir.exists() and any(target_dir.iterdir()):
        sys.exit(f"Pasta de destino já existe e não está vazia: {target_dir}")

    target_dir.mkdir(parents=True, exist_ok=True)
    copy_and_fill(target_dir, values, TEMPLATES[args.template])
    # design-system por CÓPIA dentro do módulo (frontend/vendor/), não por
    # caminho relativo até o Core — o build Docker do módulo só enxerga o
    # próprio repositório (ver scripts/vendor_design_system.py)
    vendor_design_system(target_dir / "frontend")
    if args.template == "postrun":
        vendor_postrun_core(target_dir)
        agent_repo = next((p for p in AGENT_REPO_CANDIDATES if (p / "scripts" / "vendor_server.py").exists()), None)
        if agent_repo is not None:
            import subprocess

            subprocess.run(
                [sys.executable, str(agent_repo / "scripts" / "vendor_server.py"), str(target_dir / "backend")],
                check=True,
            )
        else:
            print("Aviso: Agent-Horun não encontrado ao lado do Core — rode depois "
                  "Agent-Horun/scripts/vendor_server.py <módulo>/backend (necessário em produção).")

    print()
    print(f"Módulo '{values['module_name']}' (id: {values['module_id']}) criado em:")
    print(f"  {target_dir}")
    print()
    print("Próximos passos:")
    print(f"  cd \"{target_dir}\\backend\" && python -m venv .venv && .venv\\Scripts\\activate && pip install -e \".[dev]\"")
    print(f"  cd \"{target_dir}\\frontend\" && npm install && npm run dev")
    print("  (o design-system foi copiado para frontend/vendor/ — para atualizar depois:")
    print(f"   python \"{HERE / 'scripts' / 'vendor_design_system.py'}\" \"{target_dir / 'frontend'}\")")
    print()
    print("Ver README.md gerado para o fluxo completo de desenvolvimento standalone.")


if __name__ == "__main__":
    main()
