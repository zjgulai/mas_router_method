#!/usr/bin/env python3
"""Generate a Feishu one-click authorization link for the existing Main app.

Why not use the Node SDK's registerApp: in this environment Node's fetch rejects
the accounts.feishu.cn certificate chain, while Python's SSL stack accepts it.
The flow is the same RFC 8628 device-authorization flow; this script stops after
printing the link, so the operator can open it in Feishu.

Usage:
    python3 scripts/feishu-authorize-link.py
    python3 scripts/feishu-authorize-link.py --app-id cli_xxx --no-scopes
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import urllib.parse
import urllib.request

ACCOUNTS = "https://accounts.feishu.cn/oauth/v1/app/registration"

DEFAULT_APP_ID = "cli_aa68b5b3f8799cf6"

# Minimal scopes for a group-answering bot, plus self-management so the event
# subscription can be configured by the CLI afterwards.
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


def begin() -> dict[str, object]:
    body = urllib.parse.urlencode(
        {
            "action": "begin",
            "archetype": "PersonalAgent",
            "auth_method": "client_secret",
            "request_user_info": "open_id",
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        ACCOUNTS,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def encode_addons(scopes: list[str], events: list[str]) -> str:
    payload = {
        "scopes": {"tenant": scopes, "user": []},
        "events": {"items": {"tenant": events, "user": []}},
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    compressed = gzip.compress(raw)
    return base64.urlsafe_b64encode(compressed).decode("ascii").rstrip("=")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-id", default=DEFAULT_APP_ID)
    parser.add_argument("--no-scopes", action="store_true", help="Do not request scopes")
    parser.add_argument("--no-events", action="store_true", help="Do not request events")
    args = parser.parse_args()

    result = begin()
    uri = str(result.get("verification_uri_complete") or result.get("verification_uri"))
    if not uri:
        raise SystemExit(f"no verification URI in response: {result!r}")

    parts = urllib.parse.urlsplit(uri)
    query = dict(urllib.parse.parse_qsl(parts.query))
    query["from"] = "sdk"
    query["source"] = "mas-main-agent"
    query["tp"] = "sdk"
    query["clientID"] = args.app_id

    scopes = [] if args.no_scopes else DEFAULT_SCOPES
    events = [] if args.no_events else DEFAULT_EVENTS
    if scopes or events:
        query["addons"] = encode_addons(scopes, events)

    url = urllib.parse.urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urllib.parse.urlencode(query), parts.fragment)
    )

    print("Open this link in Feishu and confirm the update for the existing app:")
    print()
    print(url)
    print()
    print(f"user_code: {result.get('user_code')}")
    print(f"expires_in: {result.get('expires_in')}s")
    print(f"app_id: {args.app_id}")
    print()
    print("Requested scopes:")
    for scope in scopes:
        print(f"  - {scope}")
    print("Requested events:")
    for event in events:
        print(f"  - {event}")
    print()
    print("After confirming, run:")
    print("  pnpm --filter @mas/bot-gateway configure")
    print("  pnpm --filter @mas/bot-gateway check")


if __name__ == "__main__":
    main()
