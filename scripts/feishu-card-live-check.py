#!/usr/bin/env python3
"""Live acceptance for the Feishu card callback path (PMO Stage 2).

Sends an interactive card with the three recipe review buttons, then waits for
the gateway to write a `card_actions` row. The gateway must be running with
`card.action.trigger` subscribed and `MAIN_AGENT_TELEMETRY_DB` pointing at the
same file this script reads.

    python3 scripts/feishu-card-live-check.py --wait 180
    python3 scripts/feishu-card-live-check.py --dry-run

Exit codes: 0 a click was recorded, 1 timeout, 2 configuration/API failure.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import ssl
import sys
import time
import urllib.request
from pathlib import Path

from feishu_history import DEFAULT_CHAT_ID, load_env, tenant_token


def card(recipe_id: str) -> dict:
    return {
        "config": {"wide_screen_mode": True},
        "header": {
            "template": "blue",
            "title": {"tag": "plain_text", "content": "Main 卡片回调验收"},
        },
        "elements": [
            {
                "tag": "markdown",
                "content": (
                    "这条卡片用于验证 Stage 2 的按钮回调。\n"
                    "请点击任意一个按钮；网关应写入一行 card_actions 并回 toast。\n"
                    f"recipe_id: `{recipe_id}`"
                ),
            },
            {
                "tag": "action",
                "actions": [
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "采纳"},
                        "type": "primary",
                        "value": {"action_id": "recipe.adopt", "recipe_id": recipe_id},
                    },
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "要改"},
                        "value": {"action_id": "recipe.revise", "recipe_id": recipe_id},
                    },
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "不用"},
                        "type": "danger",
                        "value": {"action_id": "recipe.reject", "recipe_id": recipe_id},
                    },
                ],
            },
        ],
    }


def send_card(token: str, chat_id: str, payload: dict) -> str:
    body = json.dumps(
        {
            "receive_id": chat_id,
            "msg_type": "interactive",
            "content": json.dumps(payload, ensure_ascii=False),
        }
    ).encode()
    request = urllib.request.Request(
        "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
        data=body,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, context=ssl.create_default_context(), timeout=20) as response:
        result = json.load(response)
    if result.get("code") != 0:
        raise RuntimeError(f"send failed: {result.get('code')} {result.get('msg')}")
    return result["data"]["message_id"]


def wait_for_action(db: Path, recipe_id: str, since_ms: int, timeout: int) -> tuple[str, int] | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if db.exists():
            try:
                with sqlite3.connect(db) as conn:
                    row = conn.execute(
                        "SELECT action_id, created_at FROM card_actions "
                        "WHERE recipe_id = ? AND created_at >= ? "
                        "ORDER BY id DESC LIMIT 1",
                        (recipe_id, since_ms),
                    ).fetchone()
                if row is not None:
                    return str(row[0]), int(row[1])
            except sqlite3.Error:
                pass
        time.sleep(3)
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chat", default=DEFAULT_CHAT_ID)
    parser.add_argument("--db", default=None)
    parser.add_argument("--wait", type=int, default=180)
    parser.add_argument("--recipe-id", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    recipe_id = args.recipe_id or f"live-check-{int(time.time())}"
    env = load_env()
    db = Path(args.db or env.get("MAIN_AGENT_TELEMETRY_DB") or ".data/main-agent-telemetry.db")
    payload = card(recipe_id)

    if args.dry_run:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    app_id = env.get("FEISHU_APP_ID")
    app_secret = env.get("FEISHU_APP_SECRET")
    if not app_id or not app_secret:
        print("missing FEISHU_APP_ID / FEISHU_APP_SECRET in .env", file=sys.stderr)
        return 2

    try:
        token = tenant_token(app_id, app_secret)
        started_ms = int(time.time() * 1000)
        message_id = send_card(token, args.chat, payload)
    except Exception as exc:  # noqa: BLE001 - the CLI reports the API failure verbatim
        print(f"card send failed: {exc}", file=sys.stderr)
        return 2

    print(f"card sent: message_id={message_id} chat={args.chat} recipe_id={recipe_id}")
    print(f"evidence db: {db}")
    print(f"waiting up to {args.wait}s for a button click...")

    found = wait_for_action(db, recipe_id, started_ms, args.wait)
    if found is None:
        print(
            "no card action recorded. Check: (1) the app subscribes to card.action.trigger, "
            "(2) the gateway is running this code with the same MAIN_AGENT_TELEMETRY_DB, "
            "(3) the click reached this gateway instance.",
            file=sys.stderr,
        )
        return 1

    action_id, created_at = found
    print(f"ok — {action_id} recorded after {round((created_at - started_ms) / 1000, 1)}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
