# sj-audit

Evidence-grounded first-run **UX/UI audit** for web apps, as a Claude Code skill. Drives the
real app with [dev-browser](https://github.com/gbasin/dev-browser), fans critique across
pluggable design lenses (Steve Jobs · Nielsen · Dieter Rams · WCAG), verifies every finding
against source, and ships an interactive **Today / Refine / Bold** report you pick redesign
directions from — privately hosted, with your picks sent straight back.

## Install

```bash
npx skills add gbasin/sj-audit --all -g
```

Then in Claude Code: `/sj-audit` (or just ask for "a UX audit through the Steve Jobs lens").

## What it does

Most "design reviews" are vibes — a model glances at a screenshot and free-associates. This
runs a real, grounded pipeline against the *running* app:

| # | Stage | What happens |
|---|-------|--------------|
| 1 | **Isolate** | Fresh git worktree + fresh DB + free ports, so it never collides with other agents or your dev server |
| 2 | **Stand up** | Launch the app via the per-app hook; capture `BASE_URL` |
| 3 | **Explore + capture** | `dev-browser` walks the whole first-run journey; labeled screenshot library + a viewport × theme matrix; measured hit-targets / tab-order / focus |
| 3.5 | **Walk the stories** | Each core user story **driven end-to-end** through the live app → completed / **stuck** / **failed**, with dead-end screenshots — did a first-timer actually finish the job? |
| 4 | **Ground-truth** | Verify what's *seen* against computed styles; separate real behavior from dev-mock artifacts |
| 5 | **Brief** | One grounding doc so parallel analysts don't fight over the single running instance |
| 6 | **Fan out** | Analysts (areas × lenses, grounded on the executed walks) → **adversarial verify** (refute each finding) → synthesize & rank → **reconcile imagined vs executed** → coverage critic |
| 7 | **Verify code bugs** | Any claimed defect is confirmed at `file:line` before it ships |
| 8 | **Render solutions** | Each top issue as **Today / Refine / Bold** mockups in the app's real tokens, + live clickable prototypes for the top 1–3 |
| 9 | **Deliver** | Self-contained HTML report, privately hosted; optional GitHub-issues / markdown / regression-diff exports |

**Pluggable lenses** — run one or a panel; each finding carries its lens's verdict:

| Lens | What it catches |
|------|-----------------|
| **Steve Jobs** (signature) | Focus, subtraction, magic-in-the-first-10-seconds, dead affordances, crisp verdicts |
| **Nielsen's 10 heuristics** | The defensible usability-evaluation standard; each finding maps to a numbered principle + severity |
| **Dieter Rams** | Strategic design judgment — honesty, restraint, "less but better", thoroughness |
| **WCAG 2.2** | Accessibility, *measured* with axe-core + computed contrast (don't guess — compute) |

### Why it's different

- **Grounded, not vibes** — every finding cites a screenshot, a computed style, or a `file:line`.
- **Behavioral, not just visual** — it *drives* the core user stories, so it can tell you whether a first-timer can actually finish the task — not just whether the screen looks right.
- **Honest** — a workflow stage tries to *refute* each finding; automation artifacts get retracted in the report.
- **Comparative** — it doesn't just list problems, it renders each fix three ways and lets you choose.
- **Closed-loop** — your picks come straight back to the agent via a `/feedback` endpoint (or copy-paste).

## What you get

One self-contained `index.html` (dark, in your app's real design tokens, with a **light/dark
toggle** — the chrome switches; mockups stay pinned to the app's real tokens):

- **The journey** — annotated real screenshots with per-lens verdicts
- **Top issues** — ranked, severity-filterable, deduped across areas + lenses
- **Solution renderings** — Today / Refine / Bold per issue, each with a "Keep / Refine / Bold / Mix" picker + notes
- **Task walks** — core user stories driven through the live app (completed / stuck / failed), with a step timeline, dead-end shots, and an imagined-vs-executed reconciliation
- **User stories** (by persona + severity) and **all findings** by area
- **Measured** — axe (incl. tap-target size) / Lighthouse / contrast / tab-order + focus (optional) · **Coverage** — what was exercised vs missed
- A floating **My picks** panel that exports markdown or POSTs your picks back to the host

## Viewing the report

**Localhost is the default — no Tailscale needed.** The host binds to `127.0.0.1`, so the
report is already private (nothing off your machine can reach it):

```bash
python3 scripts/serve.py --root <run-dir> --port 8088
# open http://localhost:8088
```

The **My picks** panel and its `POST /feedback` round-trip work identically on localhost —
picks land in `<run-dir>/feedback/picks-<ts>.{json,md}` regardless of bind address.

Tailscale is only for the cross-device case: reviewing the report from a *different* machine
(phone, another laptop) over your private tailnet, without exposing it on your LAN. Bind to
your Tailscale IP instead:

```bash
python3 scripts/serve.py --root <run-dir> --port 8088 --bind "$(tailscale ip -4 | head -1)"
```

## Per-app setup

Each target app gets a thin config committed in its repo:

```
<target-repo>/.sj-audit/
  config.yaml          # source paths, how to launch+isolate, login steps, personas, lenses, modules
  hooks/
    launch.sh          # isolate (worktree + fresh DB + free ports), start, print BASE_URL=
    seed.sh <persona>  # provision a persona (or mark code-only)
    healthcheck.sh     # optional: exit 0 when ready
  runs/<timestamp>/    # (gitignored) generated output: brief, screenshots, *.json, index.html, feedback/
```

Copy [`reference/config.example.yaml`](reference/config.example.yaml), read
[`reference/hook-contract.md`](reference/hook-contract.md), and adapt to your app's run
scripts. If you run `/sj-audit` in a repo with no config, the skill will scaffold one with you.
The bundled **Atrium** config is a complete worked example.

## Structure

```
SKILL.md                          The 9-stage pipeline the agent follows
reference/
  lenses/                         The 4 design lenses (Jobs, Nielsen, Rams, WCAG)
  schemas/                        JSON schemas: analyst, synthesis, verdict, picks, walks
  brief-template.md               Shared analyst brief skeleton
  hook-contract.md                The launch/seed/healthcheck contract
  config.example.yaml             Documented config
workflows/audit.workflow.js       Fan-out: areas × lenses → verify → synthesize → reconcile walks → coverage
assets/report/                    Data-driven HTML report + builder
scripts/
  serve.py                        Static host + POST /feedback sink (localhost by default; bind a Tailscale IP for cross-device)
  walk/run-walks.mjs              Drive user stories end-to-end → walks.json (completed/stuck/failed)
  capture/matrix.mjs              Viewport × theme screenshot matrix
  a11y/                           axe-core (incl. target-size), Lighthouse, contrast, interaction (hit-target/tab/focus)
  tokens/extract-tokens.mjs       Pull the app's CSS custom properties for on-brand mockups
  export/                         P0/P1 → GitHub issues
  regression/                     Diff two runs (fixed / still-broken / regressed)
```

## Requirements

- [`dev-browser`](https://github.com/gbasin/dev-browser) — `npm i -g dev-browser && dev-browser install`
- `node` (report builder + modules) and `python3` (the host)
- Optional: `npx` (Lighthouse), `gh` (GitHub-issues export), Tailscale (only for viewing the report from another device)

## Credits

Generalized from the original Atrium "Steve Jobs lens" audit. Lens rubrics draw on Jakob
Nielsen's [10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/),
Dieter Rams's ten principles for good design, and [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## License

[MIT](LICENSE)
