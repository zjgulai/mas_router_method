#!/usr/bin/env python3
"""Live acceptance check for the Main agent in a Feishu group.

Finds recent @Main questions, pairs each with the bot's reply burst, and verifies
the answer contract (【结论】【定位】【下一步】【证据】), latency, and duplicate
replies. Raw text is never written; only hashes and timings are reported.

    # Check the last 15 minutes
    python3 scripts/feishu-live-check.py

    # Wait for a human to send a message, then check
    python3 scripts/feishu-live-check.py --wait 120

Exit codes: 0 pass, 1 fail, 2 no question in the window.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
from pathlib import Path

from feishu_history import (
    DEFAULT_BOT_OPEN_ID,
    DEFAULT_CHAT_ID,
    fetch_messages,
    load_env,
    mentions_bot,
    message_text,
    message_time,
    question_hash,
    tenant_token,
)


CONTRACT = ["【结论】", "【定位】", "【下一步】", "【证据】"]
ANNOUNCEMENT_MARKERS = [
    "已发布",
    "已修复",
    "已上线",
    "事件订阅",
    "请再 @Main",
    "事件链路自检",
]


def is_announcement(text: str) -> bool:
    return any(marker in text for marker in ANNOUNCEMENT_MARKERS)


def collect_rows(
    items: list[dict],
    app_id: str,
    bot_open_id: str,
    timeout_sec: int,
) -> list[dict]:
    user = [item for item in items if (item.get("sender") or {}).get("sender_type") == "user"]
    bot = [
        item
        for item in items
        if (item.get("sender") or {}).get("id") == app_id
        and not is_announcement(message_text(item))
    ]
    questions = [item for item in user if mentions_bot(item, bot_open_id)]
    rows: list[dict] = []
    for question in questions:
        q_time = message_time(question)
        candidates = [
            item
            for item in bot
            if 0 <= (message_time(item) - q_time).total_seconds() <= timeout_sec
        ]
        candidates.sort(key=message_time)
        bursts: list[list[dict]] = []
        for item in candidates:
            if not bursts or (message_time(item) - message_time(bursts[-1][-1])).total_seconds() > 5:
                bursts.append([item])
            else:
                bursts[-1].append(item)
        if not bursts:
            rows.append(
                {
                    "hash": question_hash(message_text(question)),
                    "askedAt": q_time.isoformat(timespec="seconds"),
                    "answeredAt": None,
                    "latency": None,
                    "sections": [],
                    "missing": CONTRACT,
                    "duplicate": False,
                    "pass": False,
                    "reason": "no visible answer",
                }
            )
            continue
        first = bursts[0]
        text = "\n".join(message_text(item) for item in first)
        answered_at = message_time(first[0])
        missing = [section for section in CONTRACT if section not in text]
        latency = (answered_at - q_time).total_seconds()
        duplicate = len(bursts) > 1
        passed = not missing and not duplicate
        rows.append(
            {
                "hash": question_hash(message_text(question)),
                "askedAt": q_time.isoformat(timespec="seconds"),
                "answeredAt": answered_at.isoformat(timespec="seconds"),
                "latency": round(latency, 1),
                "sections": [section for section in CONTRACT if section in text],
                "missing": missing,
                "duplicate": duplicate,
                "pass": passed,
                "reason": "ok"
                if passed
                else ("duplicate replies" if duplicate else f"missing {', '.join(missing)}"),
            }
        )
    return rows


def render(rows: list[dict], window_start: dt.datetime, window_end: dt.datetime) -> str:
    passed = sum(1 for row in rows if row["pass"])
    lines = [
        "# Main Agent 真实群 Live Check",
        "",
        f"**生成时间**：{dt.datetime.now().isoformat(timespec='seconds')}",
        f"**窗口**：{window_start.isoformat(timespec='seconds')} → {window_end.isoformat(timespec='seconds')}",
        "**隐私**：只写问题哈希与时间；不写原始消息文本。",
        "",
        "## 结果",
        "",
        f"- 提问数：{len(rows)}",
        f"- 通过：{passed}",
        f"- 失败：{len(rows) - passed}",
        "",
        "| # | 问题哈希 | 提问时间 | 回复时间 | 延迟(s) | 缺失段落 | 重复回复 | 结果 |",
        "|---|---|---|---|---:|---|---|---|",
    ]
    for index, row in enumerate(rows, 1):
        lines.append(
            "| {index} | `{hash}` | {asked} | {answered} | {latency} | {missing} | {duplicate} | {result} |".format(
                index=index,
                hash=row["hash"],
                asked=row["askedAt"][11:19],
                answered=(row["answeredAt"] or "-")[11:19],
                latency="-" if row["latency"] is None else row["latency"],
                missing=", ".join(row["missing"]) or "-",
                duplicate="yes" if row["duplicate"] else "no",
                result="PASS" if row["pass"] else "FAIL",
            )
        )
    lines.extend(["", "## 失败时的下一步", ""])
    lines.extend(
        [
            "1. 有 `ws event received` 但没有 `question received`：查 mention open_id / 事件订阅。",
            "2. 有 `question received` 但没有回复：查网关日志的 `answer failed`、回复权限和幂等键。",
            "3. 有回复但缺段落：查回答是否被截断、是否拆分成了多条。",
            "4. 同一问题多个回复 burst：查幂等和重试；这是重复回复。",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--minutes", type=int, default=15)
    parser.add_argument("--wait", type=int, default=0, help="Poll for a question for N seconds.")
    parser.add_argument("--timeout", type=int, default=180, help="Max answer latency in seconds.")
    parser.add_argument("--chat-id", default=os.environ.get("FEISHU_CHAT_ID", DEFAULT_CHAT_ID))
    parser.add_argument(
        "--bot-open-id",
        default=os.environ.get("MAIN_BOT_OPEN_ID", DEFAULT_BOT_OPEN_ID),
    )
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    env = load_env()
    app_id = env.get("FEISHU_APP_ID", "")
    app_secret = env.get("FEISHU_APP_SECRET", "")
    if not app_id or not app_secret:
        print("FEISHU_APP_ID / FEISHU_APP_SECRET missing in .env", file=sys.stderr)
        return 1

    deadline = time.time() + args.wait
    token = None
    while token is None:
        try:
            token = tenant_token(app_id, app_secret)
        except RuntimeError as exc:
            if time.time() >= deadline:
                print(f"auth failed: {exc}", file=sys.stderr)
                return 1
            print(f"temporary auth error: {exc}; retrying...", file=sys.stderr)
            time.sleep(5)
    now = dt.datetime.now()
    cutoff = now - dt.timedelta(minutes=args.minutes)
    while True:
        now = dt.datetime.now()
        cutoff = now - dt.timedelta(minutes=args.minutes)
        try:
            items = fetch_messages(token, args.chat_id, cutoff, 300)
        except RuntimeError as exc:
            if time.time() >= deadline:
                print(f"history fetch failed: {exc}", file=sys.stderr)
                return 1
            print(f"temporary history error: {exc}; retrying...", file=sys.stderr)
            time.sleep(5)
            continue
        rows = collect_rows(items, app_id, args.bot_open_id, args.timeout)
        pending = any(row["reason"] == "no visible answer" for row in rows)
        if rows and not pending:
            break
        if time.time() >= deadline:
            break
        if rows:
            print("question seen, waiting for the answer...", file=sys.stderr)
        else:
            print("waiting for an @Main question...", file=sys.stderr)
        time.sleep(5)

    report = render(rows, cutoff, now)
    if args.out and rows:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(report + "\n", encoding="utf-8")
        print(f"wrote {out}")
    print(report)
    if not rows:
        print(
            "NO_QUESTION: no @Main question in the window. Send one in the group and rerun.",
            file=sys.stderr,
        )
        return 2
    return 0 if all(row["pass"] for row in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
