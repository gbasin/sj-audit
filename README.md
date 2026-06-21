# sj-audit

An evidence-grounded first-run **UX/UI audit pipeline** for running web apps, packaged as
a Claude Code skill. It drives the real app with `dev-browser`, fans critique out across
parallel analysts and pluggable design lenses, adversarially verifies the findings against
source, renders fixes three ways (**Today / Refine / Bold**), and ships an interactive,
privately-hosted HTML walkthrough that **collects your direction picks back**.

Generalized from the original Atrium "Steve Jobs lens" audit.

## Why it's different from a quick design review

- **Grounded, not vibes.** Every finding cites a screenshot, a computed style, or a `file:line`.
- **Honest.** A workflow stage tries to *refute* each finding; automation artifacts get retracted.
- **Comparative.** It doesn't just list problems — it renders each fix Today vs Refine vs Bold and lets you choose.
- **Closed-loop.** Your picks come straight back to the agent via a `/feedback` endpoint (or copy-paste).
- **Pluggable lenses.** Steve Jobs (signature), Nielsen's 10 heuristics, Dieter Rams, WCAG — run one or a panel.

## Install

```sh
git clone <this-repo> ~/Code/sj-audit
ln -s ~/Code/sj-audit ~/.claude/skills/sj-audit
```

Then in Claude Code: `/sj-audit` (or just ask for a "UX audit through the Steve Jobs lens").

## Per-app setup

Each target app gets a thin config committed in its repo:

```
<target-repo>/.sj-audit/
  config.yaml          # source paths, how to launch+isolate, login steps, personas, lenses, modules
  hooks/
    launch.sh          # isolate (worktree+fresh DB+free ports), start, print BASE_URL=
    seed.sh <persona>  # provision a persona (or mark code-only)
    healthcheck.sh     # optional: exit 0 when ready
  runs/<timestamp>/    # (gitignored) generated output: brief, screenshots, *.json, index.html, feedback/
```

Copy `reference/config.example.yaml`, read `reference/hook-contract.md`, and adapt to your
app's run scripts. The bundled `atrium/.sj-audit/` is a complete worked example.

## What you get

A single `index.html` (dark, in your app's real tokens): annotated screenshot journey,
ranked severity-filterable issues, Today/Refine/Bold mockups with pickers, live prototypes
for the top directions, the full story/finding corpus, and — optionally — measured a11y/perf
scores and a coverage map. Hosted privately (localhost or Tailscale) with a "My picks" panel and a light/dark toggle
(the report chrome switches; mockups stay pinned to the app's real tokens).

## Layout

| Path | What |
|---|---|
| `SKILL.md` | The pipeline the agent follows |
| `reference/lenses/` | The 4 design lenses |
| `reference/schemas/` | JSON schemas for analyst/synthesis/verdict/picks output |
| `reference/brief-template.md` | Shared analyst brief skeleton |
| `reference/hook-contract.md` | The launch/seed/healthcheck contract |
| `reference/config.example.yaml` | Documented config |
| `workflows/audit.workflow.js` | The fan-out workflow (areas × lenses → verify → synthesize → coverage) |
| `assets/report/` | Data-driven HTML report + builder |
| `scripts/` | serve.py + module scripts (matrix, a11y, tokens, exports, regression) |

## License

MIT
