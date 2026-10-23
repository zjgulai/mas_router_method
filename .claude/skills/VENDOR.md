# Vendored skills: mattpocock/skills

Installed as **project-level** skills so that everyone working in this repo — and
every agent run — sees the same engineering process. A global install would make
the process depend on whose laptop the work happened on, which is exactly the
kind of drift this repo is trying to avoid.

| | |
|---|---|
| Source | https://github.com/mattpocock/skills |
| Commit | `5beb35b040e3de97e54fa9e386d7e42d15c295c2` |
| Commit date | 2026-10-19T16:51:40+01:00 |
| License | MIT (see `LICENSE`) |
| Installed | 2026-10-24 |

## What was taken

Everything under `skills/engineering/` and `skills/productivity/` — 27 skills.

These directories are copied **as-is**. Local modifications will be lost on the
next upgrade, so:

- Project-specific behaviour belongs in `CLAUDE.md`, not in vendored files.
- Our own process skills live in `.claude/skills/native-agent-dev-*` and are
  meant to be edited freely.

## What was deliberately left out

`skills/misc/` — frozen and unmaintained upstream. Nothing in it is load-bearing
for this repo, and `setup-pre-commit` overlaps with the pre-commit setup described
in `docs/agents/commit-conventions.md`.

`skills/in-progress/` — upstream flags these as public-but-unfinished. A skill that
changes underneath a running project is worse than no skill.

`skills/deprecated/` — retired upstream.

## Upgrading

```bash
git clone --depth 1 https://github.com/mattpocock/skills.git /tmp/mp-skills
rsync -a --delete /tmp/mp-skills/skills/engineering/ .claude/skills/
rsync -a --delete /tmp/mp-skills/skills/productivity/ .claude/skills/
```

Then re-run `/setup-matt-pocock-skills` if the config layout changed, and update
the commit hash above.

**Upstream is volatile.** Skills get renamed and retired without a major version
bump (`/to-prd` became `/to-spec`, `/to-issues` became `/to-tickets`, `/diagnose`
became `/diagnosing-bugs`). Read `GLOSSARY.md` in the upstream repo before
assuming a name still exists. Our router (`.claude/skills/native-agent-dev/SKILL.md`)
refers to skills by their current names and is the one file to fix if a rename
lands.
