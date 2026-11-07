---
id: E-019
ticket: T-003
at: 2026-11-07
kind: command
result: pass
---
## 命令

```bash
# L2: key + model list
node scripts/check-vod.mjs --base https://mmu.vod-qcloud.com/v1

# Real recipe happy path (real TikTok reference)
cd packages/evals
NODE_USE_ENV_PROXY=1 node_modules/.bin/tsx --env-file-if-exists=../../.env \
  src/try-one.ts --url 'https://www.tiktok.com/@cerave/video/7494697953379044651'

# Card callback live check
python3 scripts/feishu-card-live-check.py \
  --chat oc_758c4307926e4840eb34add9b8515dbe --wait 180
```

## 原始输出

```text
L1 gateway: mmu.vod-qcloud.com:443
  LISTENING
L2 auth: GET /models
  HTTP 200
  74 model(s)
  gemini ids: gemini-3.8-flash, gemini-3.5-flash-lite, gemini-3.1-pro-preview, gemini-3.5-flash, gemini-3.6-flash, gemini-3.1-flash-lite, ...

Status: succeeded (72040ms, $0.1626)
Run: run_690d0e720fb2d1d8e0
  [8] tool-call mcp__brand__analyze_reference_video — {"referenceId":"ref_d9c9dbcbc58e5c8e9b", ...}
  [9] tool-result — {"analysis":{"hook":{"pattern":"problem-agitation", ...
  [10] tool-call mcp__brand__save_recipe_draft — {"referenceId":"ref_d9c9dbcbc58e5c8e9b", ...}
  [11] tool-result — {"recipeId":"rec_2d8185d68651f35394"}
Recipe: 3-step morning routine — problem-agitation hook (CeraVe clone, Halcyon version)
  hook (3s, problem-agitation): If your morning routine needs a to-do list, it's too long.
  ... 5 beats ...
  audio: Upbeat, low-key instrumental bed from TikTok's Commercial Music Library ... [platform-library]
  provenance: ref_d9c9dbcbc58e5c8e9b, distance 0.40
  self-check: voice 0.85, hook 0.8, claimsSubstantiated true

card sent: message_id=om_x100b61dab89b78a4cfce4e2c4a51271 chat=oc_758c4307926e4840eb34add9b8515dbe
ok — recipe.adopt recorded after 7.8s
```

One successful VOD analysis: 154,839 prompt tokens, 819 completion tokens; 5s warm, about 62s cold. At list price (input $0.25/M, audio $0.5/M, output $1.5/M) that is about $0.04 per analysis; the `try-one` total of $0.1626 includes the Claude model.

## 这条证据能证明什么

1. `VOD_API_KEY` authenticates; the gateway lists 74 models including `gemini-3.1-flash-lite`.
2. A real public TikTok URL is fetched and returns a `ReferenceAnalysis` that passes the schema.
3. The real runtime, real model, real tools, and real analyser produced and persisted a recipe (`rec_2d8185d68651f35394`).
4. The Feishu card callback path is end-to-end: a button click wrote `card_actions` row id 2 within 7.8s.
5. Root cause of the earlier 400 robots: Node's built-in fetch does not honour `HTTPS_PROXY`. The gateway fetch succeeds only through the host proxy; `NODE_USE_ENV_PROXY=1` must be in the process environment at startup. Setting it in `.env` alone is too late.

## 不能证明什么

- T-000's full spike: three samples, two candidates, human ground truth, scoring, p95. This is one real reference, not the spike.
- Recipe quality: no rubric judge ran, and the deterministic rules were not applied to this ad-hoc URL.
- Retention and caching terms at the VOD provider: unconfirmed.
- The Feishu message → recipe path: the card callback and the CLI runtime are proven, but no real group message was sent through the bot in this evidence.
- Single run, not a benchmark.
