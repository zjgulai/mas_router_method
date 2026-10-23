# Domain docs

**Single-context layout.** One glossary, one ADR directory. This fits a repo of
this size; the monorepo has several packages, but they share one domain model, so
a per-package glossary would fragment vocabulary rather than sharpen it.

## Layout

```
GLOSSARY.md          ubiquitous language — the words this product uses, defined
docs/adr/            architecture decisions, numbered, immutable once accepted
docs/product/        the brief and thesis behind the product
docs/evals/          eval-set design: what "good" means, and how it is scored
docs/roadmap.md      what is being built next and why
```

## Consumer rules

**Read `GLOSSARY.md` before writing anything user-visible.** The product's
vocabulary is load-bearing: `recipe`, `reference`, `analysis`, `run`, and
`workflow` each mean something specific, and using them loosely produces specs
nobody can implement.

**Respect ADRs in the area you are touching.** An ADR records a decision that was
expensive to reach. Rereading it is cheaper than rediscovering the reason. If an
ADR is wrong, supersede it with a new one — do not edit it, since the fact that it
was once believed is itself information.

**Write an ADR when** a decision (a) is hard to reverse, (b) had credible
alternatives, and (c) someone will later ask why. That is a high bar, and most
decisions do not clear it. A directory of forty ADRs helps nobody.

## ADR format

```markdown
# <NNNN>. <Title>

**Status:** proposed | accepted | superseded by ADR-XXXX
**Date:** YYYY-MM-DD

## Context
What made this a decision rather than a default.

## Decision
What we chose, in one paragraph.

## Consequences
What this makes easy, what it makes hard, and what we accept as a result.
```

## Escalating to multi-context

Only if packages start diverging in vocabulary — e.g. the Feishu adapter's notion of
a "conversation" stops matching the runtime's notion of a "session". The signal is
two packages using one word for different things. Until then, one glossary is
correct.
