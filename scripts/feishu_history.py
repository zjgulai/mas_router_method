"""Shared Feishu history helpers for the Main agent scripts.

Standard library only. The scripts run from the repo root, so `.env` is read
relative to the current directory. Nothing here writes raw message text.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_CHAT_ID = "oc_b7b7d26f970f614d018c76d8eb557847"
DEFAULT_BOT_OPEN_ID = "ou_8c8df9040fc29b80edf1f5761b146a3e"


def load_env(path: Path = Path(".env")) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def _request_json(request: urllib.request.Request, attempts: int = 3) -> dict:
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(
                request, context=ssl.create_default_context(), timeout=20
            ) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
            if attempt + 1 < attempts:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(
        f"Feishu request failed after {attempts} attempts: {last}"
    ) from last


def tenant_token(app_id: str, app_secret: str) -> str:
    payload = json.dumps({"app_id": app_id, "app_secret": app_secret}).encode()
    request = urllib.request.Request(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    body = _request_json(request)
    if body.get("code") != 0:
        raise RuntimeError(f"tenant token failed: {body.get('code')} {body.get('msg')}")
    return body["tenant_access_token"]


def message_time(item: dict) -> dt.datetime:
    return dt.datetime.fromtimestamp(int(item["create_time"]) / 1000)


def message_text(item: dict) -> str:
    try:
        body = json.loads((item.get("body") or {}).get("content") or "{}")
    except (TypeError, ValueError):
        return ""
    if not isinstance(body, dict):
        return ""
    if isinstance(body.get("text"), str):
        return body["text"]
    if isinstance(body.get("content"), list):
        parts: list[str] = []
        for row in body["content"]:
            for segment in row if isinstance(row, list) else []:
                if isinstance(segment, dict) and segment.get("tag") == "text":
                    parts.append(segment.get("text") or "")
        return "".join(parts)
    title = body.get("title")
    return title if isinstance(title, str) else ""


def fetch_messages(
    token: str, chat_id: str, cutoff: dt.datetime, max_messages: int
) -> list[dict]:
    items: list[dict] = []
    page_token: str | None = None
    while len(items) < max_messages:
        query = {
            "container_id_type": "chat",
            "container_id": chat_id,
            "sort_type": "ByCreateTimeDesc",
            "page_size": 50,
        }
        if page_token:
            query["page_token"] = page_token
        url = "https://open.feishu.cn/open-apis/im/v1/messages?" + urllib.parse.urlencode(
            query
        )
        request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        body = _request_json(request)
        if body.get("code") != 0:
            raise RuntimeError(
                f"message history failed: {body.get('code')} {body.get('msg')}"
            )
        data = body.get("data") or {}
        page = data.get("items") or []
        items.extend(page)
        page_token = data.get("page_token")
        if not page or not data.get("has_more") or page_token is None:
            break
        oldest = min(int(item["create_time"]) / 1000 for item in page)
        if dt.datetime.fromtimestamp(oldest) < cutoff:
            break
    return [item for item in items if message_time(item) >= cutoff][:max_messages]


def normalize(text: str) -> str:
    return "".join(
        char.lower() for char in text if char.strip() and char not in "@_<>"
    )


def question_hash(text: str) -> str:
    return hashlib.sha256(normalize(text).encode("utf-8")).hexdigest()[:12]


def sender_hash(item: dict) -> str:
    sender_id = (item.get("sender") or {}).get("id") or ""
    return hashlib.sha256(sender_id.encode("utf-8")).hexdigest()[:10]


def mentions_bot(item: dict, bot_open_id: str) -> bool:
    for mention in item.get("mentions") or []:
        mention_id = mention.get("id")
        if isinstance(mention_id, dict):
            mention_id = mention_id.get("open_id") or mention_id.get("user_id")
        if mention_id == bot_open_id:
            return True
    return False


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * fraction)))
    return ordered[index]
