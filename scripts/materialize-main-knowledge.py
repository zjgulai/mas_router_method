#!/usr/bin/env python3
"""Materialise the Markdown corpus into a portable JSON source bundle.

Why this exists: in this workspace, Markdown files are stored in a compressed
form that Node's fs reads as binary, while Python's open() returns the real UTF-8
text. The bot must not depend on that local quirk, so the build step reads the
source of truth with Python and writes one plain JSON bundle. The TypeScript
loader chunks that bundle; it never needs to read the compressed files.

Run from the repository root:
    python3 scripts/materialize-main-knowledge.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "packages" / "consult" / "data" / "sources.json"

ROOT_FILES = [
    "README.md",
    "ANB-README.md",
    "CLAUDE.md",
    "GLOSSARY.md",
    "PLAYBOOK.md",
    "SKILL-MAP.md",
]

CODE_FILES = [
    "packages/feishu/src/events.ts",
    "packages/feishu/src/verify.ts",
    "apps/bot-gateway/src/index.ts",
    "packages/core/src/run-agent.ts",
    "packages/core/src/tools/brand.ts",
    "packages/core/src/tools/result.ts",
]

EXTRA_FILES = [
    "apps/bot-gateway/README.md",
]

SKIP_DIRS = {
    ".git",
    ".turbo",
    ".next",
    ".data",
    "node_modules",
    "dist",
    "build",
    "site",
    "coverage",
    "__pycache__",
}


def read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        try:
            return path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None
    except OSError:
        return None


def walk_markdown(base: Path) -> list[Path]:
    if not base.exists():
        return []
    out: list[Path] = []
    for path in sorted(base.rglob("*.md")):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        out.append(path)
    return out


def walk_skills() -> list[Path]:
    base = ROOT / ".claude" / "skills"
    if not base.exists():
        return []
    out: list[Path] = []
    for entry in sorted(base.iterdir()):
        if not entry.is_dir():
            continue
        if not (entry.name.startswith("anb") or entry.name.startswith("native-agent-dev")):
            continue
        skill = entry / "SKILL.md"
        if skill.exists():
            out.append(skill)
    return out


def main() -> None:
    files: list[dict[str, str]] = []
    seen: set[str] = set()

    candidates: list[Path] = []
    for rel in ROOT_FILES:
        candidates.append(ROOT / rel)
    candidates.extend(walk_markdown(ROOT / "docs"))
    candidates.extend(walk_skills())
    candidates.extend(walk_markdown(ROOT / "work"))
    for rel in CODE_FILES:
        candidates.append(ROOT / rel)
    for rel in EXTRA_FILES:
        candidates.append(ROOT / rel)

    for path in candidates:
        if not path.exists() or not path.is_file():
            continue
        rel = str(path.relative_to(ROOT))
        if rel in seen:
            continue
        text = read_text(path)
        if text is None or text.strip() == "":
            continue
        seen.add(rel)
        files.append({"path": rel, "text": text})

    matrix_path = ROOT / "docs" / "product" / "matrix.json"
    matrix: Any = None
    if matrix_path.exists():
        try:
            matrix = json.loads(matrix_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"warning: could not read matrix.json: {exc}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "fileCount": len(files),
        "files": files,
        "matrix": matrix,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(files)} files ({sum(len(f['text']) for f in files)} chars) to {OUT}")


if __name__ == "__main__":
    main()
