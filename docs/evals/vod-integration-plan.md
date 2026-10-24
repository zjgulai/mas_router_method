# vod / tokenhub 接入方案

面向 `VisionAnalyzer` 的供应商落地方案。结论先行：**vod 走 Gemini 家族做视频分析，tokenhub 做模型网关与备份；`glm-5.3-flash` 不能用于视频分析，因为它有 video 没有 audio。**

本文是执行方案，不是验收记录。所有"可用"都必须由一次真实调用证明，清单声明不算。

## 0. 现状

| 项 | 状态 | 证据 |
|---|---|---|
| 适配器代码 | 已完成 | `packages/core/src/adapters/vod/`，21 个 core 测试通过 |
| 网关存活 | **未验证** | 沙箱到宿主机 loopback 不通；需在宿主机确认 |
| 凭据/授权 | **未验证** | 未读取 `~/.config/magpie/`，也不应读 |
| 模型 id 与字段名 | **未验证** | `video_url` 是假设；模型 id 可能是 `-preview` |
| 能力（时间戳/音轨/静音） | **未验证** | 清单只有 modality 声明，没有实测 |

## 1. 目标架构

```
Feishu / Workbench
        │
        ▼
  createRuntime() ──► runAgent (Claude Agent SDK)
        │                    │
        │                    ├─ get_brand_profile
        │                    ├─ analyze_reference_video ──► VisionAnalyzer
        │                    │                                │
        │                    │                                ▼
        │                    │                        VodVisionAdapter
        │                    │                                │
        │                    │                     http://127.0.0.1:3425/v1
        │                    │                                │
        │                    │                                ▼
        │                    │                     vod (mmu.vod-qcloud.com)
        │                    │                     gemini-3.1-flash-lite
        │                    │
        │                    └─ save_recipe_draft ──► RecipeStore
        │
        └─ RunStore（每次运行落库）
```

约束：magpie 监听的是**宿主机** `127.0.0.1:3425`。runtime 必须跑在能访问这个地址的进程里；沙箱进程访问不到，会落到自己的 loopback。

## 2. 三层验证（必须按顺序）

### L1 网关存活

在宿主机执行，不发业务请求：

```bash
lsof -nP -iTCP:3425 -sTCP:LISTEN
python3 -c "import socket;s=socket.socket();s.settimeout(1.5);s.connect(('127.0.0.1',3425));print('LISTENING');s.close()"
```

通过：有 `magpie` 进程监听且 connect 成功。失败：先启动 magpie，后面不用测。

### L2 鉴权与模型清单

```bash
curl -sS -H "Authorization: Bearer $VOD_API_KEY" \
  http://127.0.0.1:3425/v1/models | head -c 2000
```

通过：HTTP 200，且返回里能找到目标 id。失败分支：

| 返回 | 含义 | 处理 |
|---|---|---|
| 401/403 | key 不对或未授权该网关 | 在 magpie 里确认 vod 的凭据与配额 |
| 404 | 路径不是 `/v1` | 用 magpie 文档里的实际 base path |
| 200 但无目标 id | 模型 id 写错或不在该网关 | 换 `-preview` 或从列表里选一个 Gemini |

### L3 能力（spike）

按 `docs/evals/vision-spike.md` 跑三条参考、两个候选。vod 专用的四个检查：

1. **URL 直传是否可行**：provider 能否自己抓取 TikTok 链接；不能则走上传。
2. **时间戳精度**：hook 与 beat 边界误差 ≤ 0.5s。
3. **静音视频**：`voiceover` 必须为空，不能编造口播。
4. **音频权利**：无法确定时必须是 `unknown`，不能猜 `clearable`。

## 3. 适配器形态：先 URL，后上传

| 方案 | 做法 | 优点 | 风险 |
|---|---|---|---|
| **A URL 直传**（当前实现） | 请求里放 `video_url: { url }` | 最简单，不落盘 | TikTok 可能拒绝服务端抓取；签名 URL 会过期 |
| **B 下载后上传** | 先下载到临时目录，再 base64 或 multipart | 可控、可重试 | 需要存储、大小限制、清理 |
| **C 自建签名 URL** | 媒体进对象存储，给 provider 一个短期可读 URL | 稳定、可审计 | 多一套基础设施 |

**决策规则**：先用 A 跑 clip A。如果 provider 返回 4xx/超时/抓取失败，直接切 B，不要在 A 上反复调参。B 的实现范围限定为：下载 → 校验大小/时长 → base64 或上传 → 分析后立即删除临时文件。

适配器已留出 `videoPart` 开关（`video_url` / `image_url`），但**没有**上传路径；B 需要新增一个 `upload` 分支。

## 4. 网关与模型路由

| 用途 | 模型 | 网关 | 状态 |
|---|---|---|---|
| **视频分析（主）** | `gemini-3.1-flash-lite` | vod | 待 L3 |
| 视频分析（质量档） | `gemini-3.5-flash` | vod | 待 L3 |
| 视频分析（备份） | `glm-5v-turbo` / `mimo-v2.6-pro` | tokenhub | 未标价、未实测，不能进生产契约 |
| Recipe 写作 / rubric judge | `glm-5.3-flash` 或其他文本模型 | tokenhub | 可用性待 L2 |
| 仅口播转写 | tokenhub 的 ASR 家族 | tokenhub | **只能补 voiceover，不能替代音画分析** |

`glm-5.3-flash` 的边界要说清：它适合读画面、写文本，**不适合判断音调、节奏、音频权利**。把它接到 `analyze_reference_video` 上，会得到一个"看起来分析过了"但音轨为空的 `ReferenceAnalysis`，而且不会报错——这是最坏的失败。

## 5. Spike 执行方案

| 项 | 内容 |
|---|---|
| 样本 | A 口播 15–45s；B 纯音乐+字幕；C 跨品类 30–60s |
| 候选 | `gemini-3.1-flash-lite`、`gemini-3.5-flash`（同网关两档） |
| 每候选每次记录 | HTTP 状态、耗时、输入/输出 token、成本、schema 是否一次通过 |
| 人工 ground truth | hook/beat 边界、是否有口播、音频权利、画面文字 |
| 通过闸门 | schema 一次通过；时间戳 MAE ≤0.5s；静音不编口播；权利字段不猜；90s 内返回 |
| 淘汰规则 | 任一闸门失败即淘汰，不做加权平均 |
| 产出 | `docs/evals/vision-spike/scores.md` + 原始响应 JSON + ADR 0007 addendum |
| 时间盒 | 半天；三条样本跑完即停，不因结果接近而加样本 |

## 6. 失败分支

| 现象 | 最可能原因 | 动作 |
|---|---|---|
| 401/403 | key 或网关授权 | 查 magpie 的 vod 凭据 |
| 404 model | id 不匹配 | 从 `/v1/models` 取实际 id |
| 400 `video_url` unsupported | 网关不接受该 part | 切 `image_url` 或改上传 |
| 超时 / 抓取失败 | TikTok 阻断服务端抓取 | 切方案 B |
| 200 但 schema 不符 | 模型没按 JSON 输出 | 强化 prompt/`response_format`；两次仍失败则淘汰 |
| 口播样本返回空 voiceover | 模型没有音频能力 | 换 `gemini-3.5-flash` 或 `glm-5v-turbo` |
| 静音样本编造口播 | 模型先验补全 | 该候选淘汰 |
| 时间戳偏差 >0.5s | 抽帧/对齐能力不足 | 该候选淘汰 |

## 7. 数据外发与合规

参考视频可能含人脸与人声，属于客户素材，音轨按 PII 从严处理。接入前必须确认：

- 外发的是视频 URL 还是字节；provider 是否会缓存/留存；
- 是否有可关闭留存的配置；
- 客户是否授权把参考视频送到该网关；
- 本地只保留 `ReferenceAnalysis`，不保留源视频（ADR 0006）。

这三条未确认前，spike 只能用自己的公开样本，不能碰客户素材。

## 8. 成本与预算

单次分析成本 = 视频 token + 音频 token + 输出 token。按文档单价：

- `gemini-3.1-flash-lite`：输入 $0.25/M，audio $0.5/M，输出 $1.5/M。
- `gemini-3.5-flash`：输入 $1.5/M，audio $1.5/M，输出 $9/M。

60 秒视频的实际 token 数未知，**必须实测**，不能用单价推算。测量后把"单次分析成本"写进 ADR 0005 的 $2.00 预算说明；如果分析本身接近上限，先优化抽帧/降采样，不要抬预算。

## 9. 里程碑

| 阶段 | 产出 | 负责 |
|---|---|---|
| D0 | L1/L2 结果（网关、key、模型 id） | 你（宿主机） |
| D0 | 外发授权结论 | 你 |
| D1 | spike 三条样本结果 | 我（脚本）+ 你（ground truth） |
| D2 | 适配器按结果调整（part/上传/prompt） | 我 |
| D3 | `try-one --eval-case baseline-beauty` 跑通 | 双方 |
| D3 | eval 基线 + ADR 0007 addendum | 我 |

## 10. 验收与退出

**通过条件**（全部满足才算可用）：

- [ ] L1/L2 通过，目标模型 id 确认
- [ ] 三条样本过闸门，成本与 p95 记录
- [ ] 静音样本不编造口播
- [ ] 音轨可读，`audio.rights` 字段有值
- [ ] `try-one` 端到端跑通并落库
- [ ] eval `baseline-beauty` 的确定性规则通过
- [ ] ADR 0007 addendum 记录供应商、价格、留存条款

**退出条件**：vod 的 Gemini 两档都过不了闸门 → 改测 tokenhub 的 `glm-5v-turbo`/`mimo-v2.6`；两者都失败 → 回到 ADR 0007 重新讨论类别决策，不要降低闸门。

## 11. 待你决策

1. **URL 还是上传**：是否接受先下载参考视频到本地临时目录（方案 B）？
2. **外发授权**：参考视频（含人声）是否可以送到 vod？还是只能用公开样本做 spike？
3. **主模型档位**：先用 `gemini-3.1-flash-lite` 控成本，还是直接上 `gemini-3.5-flash` 保质量？
