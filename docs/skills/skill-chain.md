# Agent Delivery Chain v2

How a request becomes a shipped, measured change. **One front door, four lanes,
five hard gates.** Everything else is a checklist, not a gate.

This replaces the 19-stage model. The old stage table is still useful as a
reference map (see `skill-sop.md`), but operating it as a mandatory sequence made
the process more expensive than the work.

## Start here

Call **`agent-delivery-router`** before anything else. It asks four questions and
names the lane, the first skill, the artifacts, and the gates that apply.

```
1. Production broken?            → Incident
2. Direction unclear / too big?  → Exploration
3. Model judgement or quality?   → Capability
4. Otherwise                     → Fast
```

Mixed requests are split: the "approve button" is fast lane; "is the suggestion
good" is capability lane.

## The lanes

| Lane | Use when | First skill | Artifacts | Gates |
|---|---|---|---|---|
| **Incident** | Production is failing | `diagnosing-bugs` | feedback loop, fix, regression test, postmortem | G4, G5 if redeploying |
| **Exploration** | Route or goal unclear | `wayfinder` / `prototype` | decision map or throwaway prototype | none; ends with a decision |
| **Capability** | Prompt, tools, model, retrieval, or output quality changes | `interview-me` | Playbook, eval set, tracer, ADRs | G1–G5 |
| **Fast** | UI, CRUD, config, refactor, deterministic fix | `to-tickets` | ticket, tests, evidence | G4 |

## The five hard gates

Only these need an explicit sign-off or a passing command.

| Gate | Question | Evidence | Sign-off |
|---|---|---|---|
| **G1 Intent & boundary** | Do we agree what this is and is not? | confirmed intent or Playbook with non-empty out-of-scope | human |
| **G2 Acceptance before build** | Can we say what "pass" means? | eval set + baseline, or testable acceptance criteria | human + eval owner |
| **G3 Tracer green** | Does one real input work end to end? | command output pasted in the ticket | evidence |
| **G4 Review & eval** | Is it safe, and not worse? | no Critical, no high-confidence vuln, eval ≥ baseline | reviewer + evidence |
| **G5 Release ready** | Can we undo it? | rollback path for code and prompt, observability signals | deployer |

Everything else — grilling, ADRs, plans, ledgers, handoffs, retros, GC — is a
**checklist action**. Do it when it earns its cost; do not treat skipping it as a
process violation.

## Capability lane

```
Frame → Contract → Design → Tracer → Build → Prove → Ship
```

1. **Frame** — `interview-me`, then `grilling` / `grill-with-docs`. Output: intent
   + resolved decision tree.
2. **Contract** — `spec-driven-development` writes the Playbook (goal, users,
   behaviour boundaries, quality bar, budget, non-goals); the eval set is written
   from its failure modes (`llm-evaluation`, `packages/evals`).
3. **Design** — `codebase-design`, `api-and-interface-design`,
   `database-schema-designer`, `auth-implementation-patterns`,
   `architecture-decision-records`. Only decisions that are hard to reverse.
4. **Tracer** — `writing-plans` + `to-tickets`: one real input, one tool, one
   surface, one eval case. It either works or the claim is wrong.
5. **Build** — `tdd`, `implement`, `ponytail`, `reuse-first`; parallel only when
   `dispatching-parallel-agents` says the tasks are independent.
6. **Prove** — `verification-before-completion`, `test-suite-health`,
   `playwright-best-practices` (when there is UI), `code-review`,
   `ponytail-review`, `security-review`, and the eval gate.
7. **Ship** — `deploy-checklist`, `deployment-patterns`, canary, prompt rollback,
   `observability-and-instrumentation`.

Detail: `docs/product/agent-delivery-sop.md` (P0–P9). The five gates below are the
only mandatory stops.

## Fast lane

```
ticket → failing test → minimal change → verify → review → merge
```

- `to-tickets` for anything bigger than a one-line fix; otherwise the ticket is
  the request itself.
- `tdd` at the agreed seam; `verification-before-completion` before any claim.
- `code-review`; add `security-review` when the change touches auth, money, user
  data, or tenant scope.
- No Playbook, no eval, no ADR unless an irreversible choice appears.

## Incident lane

`diagnosing-bugs` first: build a red-capable loop before hypothesising. Fix, add
a regression test, verify with the original symptom, then write a short postmortem.
If the incident came from agent judgement, **add an eval case** — that is how the
set stays alive.

## Exploration lane

`wayfinder` when the destination is unclear and the work exceeds one session;
`prototype` when a single question needs a concrete artifact. The lane ends with a
decision, then re-route. It does not end with code in production.

## Artifact budget

| Lane | Required | Optional |
|---|---|---|
| Fast | ticket, test, evidence | ADR if irreversible |
| Capability | Playbook, eval set, tracer evidence | plan, per-task tickets, ADRs |
| Incident | feedback loop, fix, regression test | postmortem, eval case |
| Exploration | decision record or prototype | plan |

At close, delete or merge process docs nobody will read again. An unread artifact
is debt, not diligence.

## Circuit breakers

- **3 failed attempts** on the same problem → stop and restate it. A fourth
  variation is usually the same mistake with more tokens.
- **2 eval cycles** with no improvement → return to the Playbook or spec, not the
  prompt.
- **Half a day** on a spike with no decision → choose the reversible option and
  record why.
- **A ticket missing a decision** → send it back as `ready-for-human`; do not
  guess in code.

## Metrics that make "smooth" measurable

Reported in every milestone report:

| Metric | Definition | Healthy direction |
|---|---|---|
| Lead time | ticket opened → merged | falling |
| Rework rate | tickets reopened or reverted ÷ merged | falling |
| Gate skip rate | gates passed without evidence ÷ all gates | zero |
| Eval pass trend | pass rate at each baseline | flat or rising |
| Cost per run | model + vision + storage | within the ADR 0005 ceiling |

A process that cannot be measured cannot be called smooth.

## Cross-cutting skills

`research` (facts), `graphify` (code queries), `codebase-onboarding` (human map),
`handoff` + `todo-ledger` (state), `artifact-registry` (residue),
`test-suite-health` (test budget), `repo-gc` (periodic collection).

## Entropy control

Three layers, unchanged:

1. **Prevent at write time** — `ponytail`, `reuse-first`, a removal line in the
   spec, an expiry on every shim.
2. **Register the residue** — `artifact-registry`: owner, expiry, delete condition.
3. **Collect periodically** — `repo-gc` at milestone boundaries, fed by
   `test-suite-health` and `ponytail-audit`.

Deletions ship in their own commit, with an evidence level (E1 static, E2 runtime,
E3 time, E4 judgement). Never delete migrations, bug-encoding fixtures, legally
retained code, generated code without regenerating, or anything with unknown
external consumers.

## Where the skills live

- **Project (vendored):** `.claude/skills/` — Matt Pocock set,
  `native-agent-dev` routers, `VENDOR.md` provenance.
- **User-level:** the workflow, design, deployment, and reporting skills.
  Project-level wins on a name collision.
- **Custom:** `milestone-report`, `reuse-first`, `todo-ledger`, `repo-gc`,
  `test-suite-health`, `artifact-registry`, `agent-delivery-router`.

## What changed from v1

| v1 | v2 |
|---|---|
| 19 mandatory gates | 5 hard gates + checklists |
| No front door | `agent-delivery-router` |
| Two SOPs, no routing | lane model routes to one of them |
| 8 referenced skills missing | all installed |
| No artifact budget | budget by lane |
| No circuit breakers | explicit stop rules |
| "Smoother" unmeasured | five metrics |
| Deployment absent from the SOP | G5 + `deploy-checklist` |

## Maintenance

- A gate that has never blocked anything is not a gate; demote it to a checklist.
- A checklist nobody uses twice is deleted, not documented harder.
- When a failure mode appears twice, add it to the router's hard rules, not to
  another page.
