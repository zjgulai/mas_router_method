# 只把 main.luteos.com 的 server block 插入共享网关 nginx.conf 的 http { } 内。
#
# 共享网关的配置是一个被 bind-mount 进容器的单文件，不 include conf.d，
# 所以不能把本文件复制成 conf.d/*.conf。执行顺序见 deploy/README.md：
# 备份 -> 生成候选 -> 容器内 nginx -t -> 替换 -> graceful reload。
#
#   python3 deploy/patch-ingress.py \
#     --base /opt/ai-video/deploy/lighthouse/nginx.conf \
#     --snippet deploy/main.luteos.com.conf \
#     --output /tmp/nginx.conf.candidate
#
# 这个脚本只生成候选，不写回原文件；写回和 reload 由 deploy.sh 控制。
from __future__ import annotations

import argparse
import re
from pathlib import Path

BEGIN_MARKER = "# BEGIN mas-router-site main.luteos.com"
END_MARKER = "# END mas-router-site main.luteos.com"
DOMAIN = "main.luteos.com"


def mask_comments_and_strings(source: str) -> str:
    """把注释和字符串替换成空格，只留下结构字符用来配对花括号。"""
    masked = list(source)
    quote: str | None = None
    escaped = False
    comment = False
    for index, char in enumerate(source):
        if comment:
            if char == "\n":
                comment = False
            else:
                masked[index] = " "
            continue
        if quote:
            if escaped:
                escaped = False
                masked[index] = " "
            elif char == "\\":
                escaped = True
                masked[index] = " "
            elif char == quote:
                quote = None
                masked[index] = " "
            else:
                masked[index] = " "
            continue
        if char == "#":
            comment = True
            masked[index] = " "
        elif char in {'"', "'"}:
            quote = char
            masked[index] = " "
    if quote:
        raise ValueError("unterminated quoted string in Nginx configuration")
    return "".join(masked)


def find_http_closing_brace(source: str) -> int:
    masked = mask_comments_and_strings(source)
    matches = list(re.finditer(r"(?m)^\s*http\s*\{", masked))
    if len(matches) != 1:
        raise ValueError(f"expected exactly one top-level http block, found {len(matches)}")
    opening = masked.find("{", matches[0].start(), matches[0].end())
    depth = 0
    for index in range(opening, len(masked)):
        if masked[index] == "{":
            depth += 1
        elif masked[index] == "}":
            depth -= 1
            if depth == 0:
                return index
            if depth < 0:
                break
    raise ValueError("unbalanced braces in Nginx http block")


def build_candidate(base: str, snippet: str, replace: bool = False) -> str:
    has_markers = BEGIN_MARKER in base or END_MARKER in base
    if has_markers and not replace:
        raise ValueError("deployment markers already exist in base config")
    if DOMAIN in base and not has_markers:
        raise ValueError(f"{DOMAIN} already exists in base config without deployment markers")
    if DOMAIN not in snippet:
        raise ValueError(f"snippet does not contain {DOMAIN}")
    if BEGIN_MARKER in snippet or END_MARKER in snippet:
        raise ValueError("snippet must not contain deployment markers")

    if has_markers:
        pattern = re.compile(
            r"(?m)^\s*" + re.escape(BEGIN_MARKER) + r".*?^\s*" + re.escape(END_MARKER) + r"[^\n]*\n",
            re.S,
        )
        base, count = pattern.subn("", base, count=1)
        if count != 1:
            raise ValueError("could not locate exactly one marked block to replace")

    closing = find_http_closing_brace(base)
    indented = "\n".join(f"    {line}" if line else "" for line in snippet.strip().splitlines())
    insertion = f"\n\n    {BEGIN_MARKER}\n{indented}\n    {END_MARKER}\n"
    return f"{base[:closing].rstrip()}{insertion}{base[closing:]}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--snippet", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--replace",
        action="store_true",
        help="replace an existing marked block instead of refusing",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.output.exists() or args.output.is_symlink():
        raise SystemExit(f"refusing to overwrite output: {args.output}")
    base = args.base.read_text(encoding="utf-8")
    snippet = args.snippet.read_text(encoding="utf-8")
    candidate = build_candidate(base, snippet, replace=args.replace)
    mode = "replaced" if args.replace and BEGIN_MARKER in base else "inserted"
    args.output.write_text(candidate, encoding="utf-8", newline="")
    print(f"wrote {args.output} with one marked mas-router-site server block {mode}")


if __name__ == "__main__":
    main()
