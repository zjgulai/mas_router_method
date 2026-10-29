#!/usr/bin/env python3
"""Privacy-preserving usage snapshot for the Main agent's Feishu group.

Reads group history through the Feishu IM API and writes aggregate metrics only:
counts, hashes, gaps, and daily volume. Raw message text and sender ids are never
written to the report. The optional `--inbox` file is local, gitignored, and
contains question text so a human can improve answers; do not attach it to a
public issue.

    python3 scripts/feishu-usage-snapshot.py --days 14
    python3 scripts/feishu-usage-snapshot.py --days 14 \
      --inbox .data/main-agent-question-inbox.jsonl
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import os
import statistics
from pathlib import Path

from feishu_history import (
    DEFAULT_BOT_OPEN_ID,
    DEFAULT_CHAT_ID,
    fetch_messages,
    load_env,
    mentions_bot,
    message_text,
    message_time,
    percentile,
    question_hash,
    sender_hash,
    tenant_token,
)


METHOD_KEYWORDS = [
    "agent",
    "eval",
    "指标",
    "标签",
    "归因",
    "看板",
    "口径",
    "流程",
    "playbook",
    "采集",
    "结论",
    "相关性",
    "打标",
    "测试",
    "prd",
    "prompt",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--max-messages", type=int, default=1200)
    parser.add_argument("--chat-id", default=os.environ.get("FEISHU_CHAT_ID", DEFAULT_CHAT_ID))
    parser.add_argument(
        "--bot-open-id",
        default=os.environ.get("MAIN_BOT_OPEN_ID", DEFAULT_BOT_OPEN_ID),
    )
    parser.add_argument("--out", default="docs/evals/main-agent-usage.md")
    parser.add_argument(
        "--inbox",
        default=None,
        help="Optional local JSONL for question text (gitignored). Do not commit it.",
    )
    args = parser.parse_args()

    env = load_env()
    app_id = env.get("FEISHU_APP_ID", "")
    app_secret = env.get("FEISHU_APP_SECRET", "")
    if not app_id or not app_secret:
        raise SystemExit("FEISHU_APP_ID / FEISHU_APP_SECRET missing in .env")

    now = dt.datetime.now()
    cutoff = now - dt.timedelta(days=args.days)
    token = tenant_token(app_id, app_secret)
    items = fetch_messages(token, args.chat_id, cutoff, args.max_messages)
    if not items:
        raise SystemExit("no messages in the requested window")

    user = [item for item in items if (item.get("sender") or {}).get("sender_type") == "user"]
    app = [item for item in items if (item.get("sender") or {}).get("id") == app_id]
    other = len(items) - len(user) - len(app)

    questions = [item for item in user if mentions_bot(item, args.bot_open_id)]
    question_hashes = [question_hash(message_text(item)) for item in questions]
    unique_questions = len(set(question_hashes))

    repeated = 0
    gaps: list[float] = []
    by_sender_question: dict[tuple[str, str], list[dt.datetime]] = collections.defaultdict(list)
    for item in questions:
        key = (sender_hash(item), question_hash(message_text(item)))
        by_sender_question[key].append(message_time(item))
    repeat_window = dt.timedelta(minutes=30)
    for times in by_sender_question.values():
        times.sort()
        for earlier, later in zip(times, times[1:]):
            if later - earlier <= repeat_window:
                gaps.append((later - earlier).total_seconds() / 60)
                repeated += 1

    paired: list[tuple[dict, dict, float]] = []
    for question in questions:
        question_time = message_time(question)
        candidates = [
            item
            for item in app
            if "【结论】" in message_text(item)
            and message_time(item) >= question_time
            and (message_time(item) - question_time).total_seconds() <= 600
        ]
        if candidates:
            answer = min(candidates, key=lambda item: message_time(item))
            paired.append(
                (question, answer, (message_time(answer) - question_time).total_seconds())
            )

    method_messages = [
        item
        for item in user
        if not mentions_bot(item, args.bot_open_id)
        and any(keyword in message_text(item).lower() for keyword in METHOD_KEYWORDS)
    ]
    user_questions = [
        item for item in user if "?" in message_text(item) or "？" in message_text(item)
    ]
    senders = collections.Counter((item.get("sender") or {}).get("id") for item in user)
    top_sender_share = (max(senders.values()) / len(user)) if user else 0.0
    latencies = [seconds for _, _, seconds in paired]
    daily = collections.Counter(message_time(item).strftime("%m-%d") for item in items)

    if args.inbox:
        write_inbox(Path(args.inbox), questions, paired)

    lines: list[str] = [
        "# Main Agent 真实群使用快照",
        "",
        f"**生成时间**：{dt.datetime.now().isoformat(timespec='seconds')}",
        f"**数据源**：飞书群 `{args.chat_id}` 的 IM 历史消息（最近 {args.days} 天）",
        f"**窗口**：{cutoff.strftime('%Y-%m-%d %H:%M')} → {now.strftime('%Y-%m-%d %H:%M')}",
        "**隐私**：只写聚合数、哈希与时间差；不写原始消息文本、不写发送者 id。",
        "",
        "## 结果",
        "",
        "| 指标 | 值 |",
        "|---|---|",
        f"| 消息总数 | {len(items)} |",
        f"| 用户消息 | {len(user)} |",
        f"| Main 消息 | {len(app)} |",
        f"| 其他/系统消息 | {other} |",
        f"| 活跃人类发送者 | {len(senders)} |",
        f"| 最大发送者占比 | {top_sender_share:.0%} |",
        f"| @Main 提问数 | {len(questions)} |",
        f"| 唯一问题数 | {unique_questions} |",
        f"| 复问次数（同一发送者+同一问题，30 分钟内） | {repeated} |",
        f"| 复问率 | {(repeated / len(questions)):.0%} |" if questions else "| 复问率 | n/a |",
        f"| 有可见回复的提问 | {len(paired)} |",
        f"| 回复中位延迟 | {statistics.median(latencies):.0f}s |" if latencies else "| 回复中位延迟 | n/a |",
        f"| 回复 p95 延迟 | {percentile(latencies, 0.95):.0f}s |" if latencies else "| 回复 p95 延迟 | n/a |",
        f"| 含方法关键词但未 @Main | {len(method_messages)} |",
        f"| 用户问句（含 ?） | {len(user_questions)} |",
        "",
        "## 每日消息量",
        "",
        "| 日期 | 消息数 |",
        "|---|---|",
    ]
    for day, count in sorted(daily.items()):
        lines.append(f"| {day} | {count} |")

    lines.extend(["", "## 解读", ""])
    if len(questions) < 10:
        lines.append("- 提问样本少于 10 条，**不能推断采用率**；这份快照只能当事件记录，不能当结论。")
    if repeated > 0:
        lines.append(
            f"- 已出现 {repeated} 次同一发送者的同题复问（中位间隔 {statistics.median(gaps):.0f} 分钟）；复问是“没解决/没看到”的代理信号，不是满意度。"
        )
    if len(paired) == 0:
        lines.append("- 没有可见的成功回复配对；先验证端到端链路，再谈采用率。")
    if method_messages:
        lines.append(
            f"- {len(method_messages)} 条消息含方法关键词但没有 @Main；这是“可服务但未触达”的上界，不是精确需求（关键词会误伤项目讨论）。"
        )
    if top_sender_share >= 0.5:
        lines.append(
            f"- 单个发送者占 {top_sender_share:.0%} 消息；当前是少数人驱动的小群，结论不能外推到全员。"
        )

    lines.extend(
        [
            "",
            "## 下一步",
            "",
            "1. 找 3–5 个真实用户各问一次方法问题，记录是否 @Main、是否复问、是否据此改动作。",
            "2. 每周重跑本快照；重点看复问率、无回复数、方法消息 @Main 比例。",
            "3. 样本达到 30 条提问后，再判断是“没人用”还是“入口不顺手”；不要用 2 条样本下结论。",
            "",
            "## 复现",
            "",
            "```bash",
            f"python3 scripts/feishu-usage-snapshot.py --days {args.days}",
            "# optional local inbox (gitignored; contains question text, do not commit)",
            f"python3 scripts/feishu-usage-snapshot.py --days {args.days} --inbox .data/main-agent-question-inbox.jsonl",
            "```",
        ]
    )

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(items)} messages, {len(questions)} questions, {len(paired)} replies)")
    if args.inbox:
        print(f"inbox: {args.inbox} (local only; do not commit)")


def write_inbox(
    path: Path,
    questions: list[dict],
    paired: list[tuple[dict, dict, float]],
) -> None:
    answers = {question["message_id"]: (answer, latency) for question, answer, latency in paired}
    existing: dict[str, dict] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            key = f"{record.get('hash')}@{record.get('createTime')}"
            existing[key] = record
    for item in questions:
        text = message_text(item)
        answer, latency = answers.get(item["message_id"], (None, None))
        record = {
            "hash": question_hash(text),
            "text": text,
            "createTime": message_time(item).isoformat(),
            "senderHash": sender_hash(item),
            "answered": answer is not None,
            "latencySec": None if latency is None else round(latency),
            "answerHash": None if answer is None else question_hash(message_text(answer)),
        }
        key = f"{record['hash']}@{record['createTime']}"
        existing[key] = record
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\n".join(json.dumps(record, ensure_ascii=False) for record in existing.values())
        + ("\n" if existing else ""),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
