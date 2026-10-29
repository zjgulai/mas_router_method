#!/usr/bin/env python3
"""One-command Feishu onboarding for the Main app.

    python3 scripts/feishu-onboard.py

It prints a one-click authorization link, waits for the app owner to confirm,
then sets the event subscription to long-connection mode and adds
`im.message.receive_v1`. No Node TLS quirks, no console screenshot.

The app id/secret come from `.env` (or FEISHU_APP_ID / FEISHU_APP_SECRET).
"""

from __future__ import annotations

import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ACCOUNTS = "https://accounts.feishu.cn/oauth/v1/app/registration"
OPEN = "https://open.feishu.cn"

DEFAULT_SCOPES = [
    "im:message",
    "im:message:send_as_bot",
    "im:message.group_msg",
    "im:message.p2p_msg",
    "im:chat:readonly",
    "application:application:patch",
    "application:application:self_manage",
]
DEFAULT_EVENTS = ["im.message.receive_v1"]


def load_env() -> dict[str, str]:
    env = dict(os.environ)
    path = ROOT / ".env"
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env.setdefault(key.strip(), value.strip())
    return env


def post_form(url: str, data: dict[str, str]) -> dict[str, object]:
    body = urllib.parse.urlencode(data).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        # RFC 8628 uses HTTP 400 for authorization_pending / slow_down.
        return json.loads(error.read().decode("utf-8"))


def post_json(url: str, data: dict[str, object], token: str | None = None) -> dict[str, object]:
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers=headers,
        method="POST" if token is None else "PATCH",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return json.loads(error.read().decode("utf-8"))


def encode_addons(scopes: list[str], events: list[str]) -> str:
    payload = {
        "scopes": {"tenant": scopes, "user": []},
        "events": {"items": {"tenant": events, "user": []}},
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64_urlsafe(gzip.compress(raw))


def base64_urlsafe(raw: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def begin() -> dict[str, object]:
    return post_form(
        ACCOUNTS,
        {
            "action": "begin",
            "archetype": "PersonalAgent",
            "auth_method": "client_secret",
            "request_user_info": "open_id",
        },
    )


def build_url(result: dict[str, object], app_id: str) -> str:
    uri = str(result.get("verification_uri_complete") or result.get("verification_uri"))
    parts = urllib.parse.urlsplit(uri)
    query = dict(urllib.parse.parse_qsl(parts.query))
    query.update(
        {
            "from": "sdk",
            "source": "mas-main-agent",
            "tp": "sdk",
            "clientID": app_id,
            "addons": encode_addons(DEFAULT_SCOPES, DEFAULT_EVENTS),
        }
    )
    return urllib.parse.urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urllib.parse.urlencode(query), parts.fragment)
    )


def poll(device_code: str, interval: int, expires_in: int) -> dict[str, object]:
    deadline = time.time() + expires_in
    wait = max(2, interval)
    last_note = 0.0
    while time.time() < deadline:
        result = post_form(ACCOUNTS, {"action": "poll", "device_code": device_code})
        if result.get("client_id") and result.get("client_secret"):
            return result
        error = result.get("error")
        if error in {"access_denied", "expired_token"}:
            raise SystemExit(f"authorization failed: {error} {result.get('error_description', '')}")
        if error == "slow_down":
            wait += 5
        if time.time() - last_note > 20:
            print("waiting for confirmation in Feishu…", flush=True)
            last_note = time.time()
        time.sleep(wait)
    raise SystemExit("authorization link expired; run the script again")


def tenant_token(app_id: str, app_secret: str) -> str:
    result = post_json(
        f"{OPEN}/open-apis/auth/v3/tenant_access_token/internal",
        {"app_id": app_id, "app_secret": app_secret},
    )
    token = result.get("tenant_access_token")
    if not isinstance(token, str):
        raise SystemExit(f"tenant token failed: {result}")
    return token


def configure(app_id: str, token: str) -> None:
    result = post_json(
        f"{OPEN}/open-apis/application/v7/applications/{app_id}/config",
        {
            "event": {
                "subscription_type": "websocket",
                "add_events": ["im.message.receive_v1"],
            }
        },
        token=token,
    )
    if result.get("code") != 0:
        raise SystemExit(
            "event subscription update failed: "
            f"{result.get('code')} {result.get('msg')}\n"
            "Grant application:application:patch, then rerun:\n"
            f"  pnpm --filter @mas/bot-gateway configure"
        )
    print("✓ event subscription set to websocket; im.message.receive_v1 added")


def main() -> None:
    env = load_env()
    app_id = env.get("FEISHU_APP_ID", "")
    app_secret = env.get("FEISHU_APP_SECRET", "")
    if not app_id or not app_secret:
        raise SystemExit("FEISHU_APP_ID and FEISHU_APP_SECRET are required in .env")

    result = begin()
    url = build_url(result, app_id)
    device_code = str(result.get("device_code", ""))
    interval = int(result.get("interval", 5))
    expires_in = int(result.get("expires_in", 600))

    print("Open this link in Feishu and confirm the update for the existing app:\n")
    print(url)
    print(f"\nuser_code: {result.get('user_code')}")
    print(f"expires_in: {expires_in}s\n")

    authorized = poll(device_code, interval, expires_in)
    print("\n✓ authorization confirmed")

    # The flow returns the app credentials; the existing secret remains valid.
    client_secret = authorized.get("client_secret")
    secret = client_secret if isinstance(client_secret, str) and client_secret else app_secret
    token = tenant_token(app_id, secret)
    configure(app_id, token)

    print("\nNext:")
    print("  pnpm --filter @mas/bot-gateway check")
    print("  pnpm --filter @mas/bot-gateway dev")
    print("  Add the bot to a group, @ it, and ask a question.")


if __name__ == "__main__":
    main()
