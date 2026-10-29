# 04: 结果归档 + commit

**What to build:** 复验结果写回本 spec，eval-fix 以约定式提交入库；决定是否刷新 baselines/current.json。

**Blocked by:** 03

**Status:** done (2026-10-30)

- [x] spec.md 回填复验结果与成本（round1 $0.76 + round2 $0.55；累计验证花费 ~$4.0 含基线 $2.68）
- [x] commit `fix(evals): ...`（fixture + prompt + tool description + 台账）
- [ ] 基线决策：4/4 PASS 已达成，全量重跑 ~$2.7 刷新 current.json 待用户批准
