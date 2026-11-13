#!/usr/bin/env python3
"""Copia a parte comum dos PostRuns para dentro de um módulo PostRun.

- backend:  postrun-core/backend/horun_postrun/ -> <módulo>/backend/app/postrun_core/
- frontend: postrun-core/frontend/              -> <módulo>/frontend/src/postrun-core/

Por que copiar: o build Docker do módulo só enxerga o próprio repositório
(mesma razão do design-system e do servidor do Agente). Cada cópia leva o
arquivo POSTRUN_CORE_VERSION (versão do pacote, commit do Core, data, hash do
conteúdo). Atualizar = rodar de novo; conferir se está desatualizada = --check
(sai com código 1 se estiver).

Uso (a partir da pasta do Horun Core):
    python scripts/vendor_postrun_core.py "../Horun-PostRun-CHNSO"
    python scripts/vendor_postrun_core.py "../Horun-PostRun-CHNSO" --check
"""

from __future__ import annotations

import argparse
import hashlib
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

CORE = Path(__file__).resolve().parent.parent
PARTS = {
    "backend": (CORE / "postrun-core" / "backend" / "horun_postrun", Path("backend") / "app" / "postrun_core", {".py"}),
    "frontend": (CORE / "postrun-core" / "frontend", Path("frontend") / "src" / "postrun-core", {".ts", ".tsx", ".css"}),
}
STAMP = "POSTRUN_CORE_VERSION"


def _files(root: Path, suffixes: set[str]) -> dict[str, Path]:
    return {
        p.relative_to(root).as_posix(): p
        for p in sorted(root.rglob("*"))
        if p.is_file() and p.suffix in suffixes and "__pycache__" not in p.parts and "node_modules" not in p.parts
    }


def _hash(root: Path, suffixes: set[str]) -> str:
    digest = hashlib.sha256()
    for rel, p in _files(root, suffixes).items():
        digest.update(rel.encode())
        digest.update(p.read_bytes().replace(b"\r\n", b"\n"))
    return digest.hexdigest()[:16]


def _version() -> str:
    text = (CORE / "postrun-core" / "backend" / "horun_postrun" / "__init__.py").read_text(encoding="utf-8")
    m = re.search(r'PACKAGE_VERSION\s*=\s*"([^"]+)"', text)
    return m.group(1) if m else "?"


def _commit() -> str:
    try:
        return subprocess.run(
            ["git", "-C", str(CORE), "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "desconhecido"


def vendor(module_dir: Path) -> None:
    for name, (source, target_rel, suffixes) in PARTS.items():
        target = module_dir / target_rel
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True)
        for rel, p in _files(source, suffixes).items():
            dst = target / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(p, dst)
        (target / STAMP).write_text(
            f"pacote={_version()}\ncore_commit={_commit()}\ndata={date.today().isoformat()}\n"
            f"hash={_hash(source, suffixes)}\n"
            "NÃO EDITE estes arquivos: mude em Horun Core/postrun-core e rode scripts/vendor_postrun_core.py\n",
            encoding="utf-8",
        )
        print(f"{name}: copiado para {target}")


def check(module_dir: Path) -> bool:
    ok = True
    for name, (source, target_rel, suffixes) in PARTS.items():
        target = module_dir / target_rel
        stamp = target / STAMP
        if not stamp.exists():
            print(f"{name}: sem cópia em {target}")
            ok = False
            continue
        recorded = re.search(r"^hash=(\w+)", stamp.read_text(encoding="utf-8"), flags=re.M)
        expected = _hash(source, suffixes)
        actual = _hash(target, suffixes)
        if actual != (recorded.group(1) if recorded else None):
            print(f"{name}: a cópia foi EDITADA dentro do módulo (não bate com o carimbo) — mova a mudança para o Core")
            ok = False
        elif actual != expected:
            print(f"{name}: desatualizada (Core mudou) — rode sem --check para atualizar")
            ok = False
        else:
            print(f"{name}: em dia")
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("module_dir", help="pasta do módulo PostRun (a que tem backend/ e frontend/)")
    parser.add_argument("--check", action="store_true", help="só conferir; código de saída 1 se desatualizada")
    args = parser.parse_args()
    module_dir = Path(args.module_dir).resolve()
    if not (module_dir / "backend").is_dir() or not (module_dir / "frontend").is_dir():
        sys.exit(f"Não parece um módulo (sem backend/ e frontend/): {module_dir}")
    if args.check:
        sys.exit(0 if check(module_dir) else 1)
    vendor(module_dir)


if __name__ == "__main__":
    main()
