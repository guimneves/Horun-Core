#!/usr/bin/env python3
"""Copia o design-system do Core para dentro de um módulo (frontend/vendor/).

Por que copiar em vez de apontar para a pasta do Core: o build Docker de um
módulo só enxerga o próprio repositório (`context: ./frontend`). Um
`"file:../../Horun Core/design-system"` funciona na máquina de quem
desenvolve, mas quebra no `docker compose build` do servidor — foi o que
aconteceu com o Financeiro. Com a cópia dentro do módulo, o build tem tudo o
que precisa, sem rede e sem depender de onde o Core foi clonado.

A cópia leva um `HORUN_DESIGN_SYSTEM_VERSION` (versão do pacote + commit do
Core + data) para saber de onde veio. Atualizar = rodar de novo; conferir se
está desatualizada = `--check`.

Uso (a partir da pasta do Horun Core):
    python scripts/vendor_design_system.py "../Horun-Financeiro/frontend"
    python scripts/vendor_design_system.py "../Horun-Financeiro/frontend" --check
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

CORE = Path(__file__).resolve().parent.parent
SOURCE = CORE / "design-system"
VENDOR_REL = "vendor/horun-design-system"
STAMP = "HORUN_DESIGN_SYSTEM_VERSION"
PACKAGE = "@horun/design-system"
COPIED = ("package.json", "README.md", "src")


def _content_hash(root: Path) -> str:
    """Hash do conteúdo copiado (independe de data/commit) — é o que o
    `--check` compara."""
    digest = hashlib.sha256()
    for name in COPIED:
        base = root / name
        files = [base] if base.is_file() else sorted(p for p in base.rglob("*") if p.is_file())
        for f in files:
            digest.update(f.relative_to(root).as_posix().encode())
            digest.update(f.read_bytes().replace(b"\r\n", b"\n"))
    return digest.hexdigest()[:16]


def _core_commit() -> str:
    try:
        return subprocess.run(
            ["git", "-C", str(CORE), "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "desconhecido"


def vendor(frontend: Path) -> Path:
    target = frontend / VENDOR_REL
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    for name in COPIED:
        src = SOURCE / name
        if src.is_dir():
            shutil.copytree(src, target / name)
        elif src.exists():
            shutil.copy2(src, target / name)

    version = json.loads((SOURCE / "package.json").read_text(encoding="utf-8"))["version"]
    (target / STAMP).write_text(
        f"versao={version}\ncommit_core={_core_commit()}\ndata={date.today().isoformat()}\n"
        f"conteudo={_content_hash(target)}\n"
        "# Cópia gerada por Horun-Core/scripts/vendor_design_system.py — não edite aqui;\n"
        "# mude no Horun Core e rode o script de novo.\n",
        encoding="utf-8",
    )

    package_json = frontend / "package.json"
    data = json.loads(package_json.read_text(encoding="utf-8"))
    deps = data.setdefault("dependencies", {})
    wanted = f"file:./{VENDOR_REL}"
    if deps.get(PACKAGE) != wanted:
        deps[PACKAGE] = wanted
        package_json.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return target


def check(frontend: Path) -> int:
    target = frontend / VENDOR_REL
    if not target.exists():
        print(f"sem cópia do design-system em {target}")
        return 2
    if _content_hash(target) != _content_hash(SOURCE):
        print("desatualizada: o design-system do Core mudou — rode o script sem --check")
        return 1
    print("em dia com o design-system do Core")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("frontend", type=Path, help="pasta frontend/ do módulo")
    parser.add_argument("--check", action="store_true", help="só confere se a cópia está em dia")
    args = parser.parse_args()
    frontend = args.frontend.resolve()
    if not (frontend / "package.json").is_file():
        print(f"não achei {frontend / 'package.json'}", file=sys.stderr)
        return 2
    if args.check:
        return check(frontend)
    target = vendor(frontend)
    print(f"design-system copiado para {target}")
    print("próximo passo: npm install (atualiza o package-lock.json) e commitar a pasta vendor/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
