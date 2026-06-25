---
name: sj-audit
description: >-
  Evidence-grounded first-run UX/UI audit of a running web app, through pluggable
  design lenses (Steve Jobs, Nielsen heuristics, Dieter Rams, WCAG). Drives the real
  UI with dev-browser, fans out parallel analysts, verifies findings against source,
  renders Today/Refine/Bold solution mockups, and ships an interactive, hosted HTML
  walkthrough that collects your direction picks back. Use when the user wants a deep
  UX/design critique, first-run/onboarding review, heuristic evaluation, "audit the
  app through a Steve Jobs lens", or a comparative redesign-direction report.
---

# sj-audit — the design-critique pipeline

This skill turns a running app into a rigorous, **evidence-grounded** design critique
and a set of **comparative redesign directions you can choose between**. It is the
generalized form of the original Atrium "Steve Jobs lens" audit.

It is NOT a quick once-over. It stands up the real app, exercises it like a first-time
user, grounds every claim in a screenshot or a `file:line`, fans critique out across
parallel analysts and lenses, adversarially verifies the findings, then renders the
fixes three ways (Today / Refine / Bold) and hosts an interactive report that captures
the user's picks.

## The deliverable

One self-contained, dark, on-brand `index.html` (built in the **target app's real design
tokens**) with:
- **The journey** — annotated real screenshots from first load through the core flows, each with a per-lens verdict.
- **Top issues** — ranked, severity-filterable cards, deduped across all areas + lenses.
- **Solution renderings** — the centerpiece: each top issue shown **Today vs Refine vs Bold** as faithful mockups, plus **live clickable prototypes** for the top 1–3. Each has a picker ("Keep today / Refine / Bold / Mix") + notes.
- **Task walks** — the behavioral layer: each core user story **driven through the live app**, marked completed / stuck / failed with a step timeline, dead-end screenshots, and a reconciliation of *imagined* vs *executed* friction (what the analysts confirmed, over-claimed, or missed).
- **User stories** (filter by persona + severity) and **all findings** by area.
- **Measured** (optional) — axe-core / Lighthouse / contrast scores across a viewport×theme matrix.
- **Coverage** (optional) — what was exercised vs missed.
- A floating **"My picks"** panel that exports clean markdown and can **POST the picks straight back** to the host machine.
- A **light/dark toggle** (◐, top-right) — one file, swaps CSS token values; defaults to the viewer's system theme. The app mockups stay pinned to the app's real tokens in both modes (a "light" mockup of a dark app would misrepresent it).

## When to use

Trigger on: "audit the UX", "first-run / onboarding review", "design critique", "Steve
Jobs lens", "heuristic evaluation", "review the UI/UX of <app>", "show me redesign
directions I can pick from". For a quick single-screen opinion, this is overkill — use a
design skill (`critique`, `impeccable`) instead.

## Prerequisites

- `dev-browser` on PATH (headless Playwright in a QuickJS sandbox). Confirm with `dev-browser --help`.
- `node` (for the report builder + module scripts) and `python3` (for the host).
- A per-app config at `<target-repo>/.sj-audit/config.yaml` with working hooks. If it's
  missing, **create it** from `reference/config.example.yaml` and the hook contract in
  `reference/hook-contract.md` (read the app's README/run scripts to fill in launch/seed).
- For modules: `npx` (Lighthouse via `npx lighthouse`), `gh` (GitHub-issues export), Tailscale (only for viewing the report from another device).

## Config + hooks (read these first)

The config is **thin** by design — it pins only how to stand the app up, log in, and where
the source lives. The agent discovers surfaces/routes/states live each run.

- `reference/config.example.yaml` — the canonical, documented config.
- `reference/hook-contract.md` — the exact stdin/arg/stdout contract for `launch.sh`,
  `seed.sh <persona>`, `healthcheck.sh`. **`launch.sh` MUST print `BASE_URL=<url>` on stdout.**

## The pipeline (run these stages in order)

**0. Setup (first time in a repo).** If `<target-repo>/.sj-audit/config.yaml` is missing, do
NOT silently guess — **scaffold it interactively**:
- Read the repo (README, package manifests, run scripts, docker-compose, env usage) to infer
  how the app starts, where the source lives, and how to log in.
- Ask the user a short, targeted round (use the question tool) for anything you can't infer
  confidently: the start/launch command, how to isolate (fresh DB/ports) vs. just attaching to
  a running instance, the login shortcut, the personas, and which lenses/modules to run.
- Write `.sj-audit/config.yaml` + `hooks/{launch,seed,healthcheck}.sh` from
  `reference/config.example.yaml` + `reference/hook-contract.md`, `chmod +x` the hooks, add the
  `runs/` gitignore, and **confirm with the user** (offer a dry `--quick` attach run first if
  they have the app already running). The bundled `atrium/.sj-audit/` is the reference example.
If the config exists, skip to stage 1.

> Then create the run dir: `RUN=<target-repo>/.sj-audit/runs/$(date +%Y%m%d-%H%M%S)` and put
> all artifacts under it. (Use a timestamp from the shell — never compute dates in JS.)

**1. Preflight.** Read `config.yaml`. Resolve `lenses`, `modules`, run `mode`
(default `isolate`; `--quick` ⇒ `attach`). Note any other dev servers/agents on the
machine so you isolate cleanly.

**2. Stand up.** `mode: isolate` → run `hooks/launch.sh`, capture the printed `BASE_URL`.
`mode: attach` → use `run.attachUrl`. Poll `healthcheck.sh` (or the base URL) until ready.
Isolation = fresh git worktree from the default branch + fresh DB + free ports, so you
never collide with other agents (see the Atrium hook for the reference recipe).

**3. Explore + capture.** Drive the app with `dev-browser`, walking the full first-run
journey across every surface you discover (login → empty state → core flows → settings →
the product's signature action → error/empty/loading states → permalinks). Build a
**labeled screenshot library** in `$RUN/screenshots/` with stable names (`01-login.png`, …).
If `modules.hardData`, also run `scripts/capture/matrix.mjs` (viewport×theme matrix) and the
`scripts/a11y/*` collectors per surface → `$RUN/metrics.json`, **including `scripts/a11y/interaction.mjs`**
(hit-target sizes, keyboard tab order, focus visibility — the measured detail you can't eyeball from a
screenshot). Seed personas via `hooks/seed.sh <persona>` where declared; for `code-only` personas, note
them for code review.

**3.5. Walk the stories (the behavioral layer — `modules.walks`).** Capturing screens tells you what
the UI *looks like*; it does NOT tell you whether a first-timer can *complete a job*. So after you've
explored and know the real selectors/labels, **author `$RUN/walks.plan.json`** — one walk per
high-value user story (top personas × core jobs), favoring stories that cross a populated / multi-step /
error / discoverability boundary the static screenshots can't reach (create something, complete a task,
recover from an error, *find* a feature). Each walk is a sequence of steps in user terms with a `success`
assertion (the contract + examples are in `reference/schemas/walks.schema.json`). Then drive them:
```
node scripts/walk/run-walks.mjs --plan "$RUN/walks.plan.json" --base "$BASE_URL" --run "$RUN"
```
This writes `$RUN/walks.json` — each walk classified **completed** (goal reached) / **stuck** (a required
step's target never became actionable → discoverability dead-end) / **failed** (steps ran but the goal
wasn't reached or an error surfaced) / **error** (harness fault), with a per-step screenshot, the
interactive elements + hit-target sizes captured *at any dead-end*, and any error text surfaced. A
`stuck`/`failed` walk is the strongest evidence in the whole audit — it's a real user failing a real task.
Don't author one giant brittle walk; prefer several focused, resilient ones (use role/text/testid targets,
mark dismissable nags `optional`).

**4. Ground-truth (discipline — non-negotiable).** Before asserting anything: verify what
you *see* against computed styles (read `getComputedStyle`, not just the pixels — a repaint
lag once faked a "light sidebar" in the original run). Distinguish **real UI behavior** from
**dev-mock/fixture artifacts**. Anything suspected to be a code bug must be traced to source
and cited `file:line` — or dropped. Be willing to **retract** your own automation artifacts.

**5. Generate the brief.** Write `$RUN/brief.md` from `reference/brief-template.md`: the
product in one paragraph, how it was exercised, the screenshot index, confirmed
observations/bugs (with caveats), the code map, the chosen **lenses' rubrics** (inline the
relevant `reference/lenses/*.md`), and the personas. This is what every analyst grounds on,
so they don't fight over the single running instance.

**6. Fan out.** Run the workflow (it does areas × chosen lenses → adversarial-verify →
synthesize/rank → coverage critic):
```
Workflow({ scriptPath: "<skill>/workflows/audit.workflow.js",
           args: { run: "$RUN", brief: "$RUN/brief.md", sourceRoot: "...",
                   lenses: [...], areas: [...optional; else discovered...],
                   walks: <parsed walks.json>, walksPath: "$RUN/walks.json",
                   modules: { adversarialVerify: true, coverage: true } } })
```
Pass the executed walks in `args.walks` (the workflow runs in a sandbox with no fs — read
`$RUN/walks.json` yourself and pass the object/array). Analysts then ground on the real outcomes
(a stuck/failed walk outranks any screenshot guess), and a **reconciliation** stage attaches
`synthesis.walkReport` — the imagined-vs-executed diff (confirmed / contradicted / missed dead-ends).
Outputs `$RUN/results.json` (per-area stories/findings/solutions) and `$RUN/synthesis.json`
(ranked issues, quick wins, bold bets, severity counts, coverage, walkReport). Schemas in
`reference/schemas/`.

**7. Verify code-bug claims.** Any finding the synthesis labels a real code bug — re-open
the source and confirm at `file:line` before it reaches the report. Gate ruthlessly.

**8. Render solutions.** Extract the app's tokens (`scripts/tokens/extract-tokens.mjs` →
`$RUN/tokens.json`). For each top issue author a `mockups.json` entry with **Today / Refine /
Bold** frames as HTML snippets using the token CSS vars (faithful, on-brand). For the **top
1–3** highest-impact directions, build a **live prototype**: a real code change on a throwaway
branch/worktree, screenshot it via dev-browser, and link it. Write `$RUN/journey.json`
(annotated screenshots) too. See `assets/report/` for the data shapes.

**9. Deliver.** Build the report:
```
node <skill>/assets/report/build-report.mjs --run "$RUN" --out "$RUN/index.html"
```
Verify it in the browser (no JS errors; sections populate; images resolve; mockups crisp).
Then **host** per `report.host`:
- `localhost` → `python3 <skill>/scripts/serve.py --root "$RUN" --port 8088`
- `tailscale` → bind to the Tailscale IP (tailnet-only) or, if Serve is enabled, `tailscale serve`.
The host also exposes `POST /feedback`, which writes picks to `$RUN/feedback/`.
If `modules.exports` includes them: `scripts/export/to-github-issues.mjs` (P0/P1 → issues, dry-run by default), a markdown report, and on a re-run `scripts/regression/diff-runs.mjs` (vs the previous run → fixed/still-broken/regressed).

**10. Collect picks.** The user marks directions in the report and clicks **Send to host**
(or pastes the markdown). Read `$RUN/feedback/picks-*.md` and act on the chosen directions.

## Lenses

Run one or several (the report shows each finding's lens verdict). Inline the chosen
rubrics into the brief so analysts apply them consistently.
- `reference/lenses/steve-jobs.md` — focus/subtraction, magic-in-10s, defaults, crisp verdicts (the signature).
- `reference/lenses/nielsen.md` — the 10 usability heuristics + severity rubric (the defensible standard).
- `reference/lenses/dieter-rams.md` — 10 principles, strategic design judgment.
- `reference/lenses/wcag.md` — WCAG 2.2 + how to read axe-core output.

## Discipline rules (what makes this trustworthy)

1. **Every claim is grounded** — a screenshot, a computed style, or a `file:line`. No vibes.
2. **Separate real from mock.** Dev fixtures lie; say so and caveat.
3. **Adversarially verify.** The workflow tries to *refute* each finding before it ships.
4. **Retract honestly.** If a "bug" was your own automation artifact, mark it retracted in the report.
5. **Never collide.** Default to full isolation so other agents/dev servers are untouched.
6. **Faithful mockups.** Use the app's real tokens; a redesign frame that looks off-brand is noise.

## Conventions

- Skill files are read-only references; all run output goes under `<target-repo>/.sj-audit/runs/<ts>/`.
- Human-authored = YAML + hooks; agent-authored = `walks.plan.json` (the walk intent); machine-generated = JSON (`results/synthesis/journey/mockups/metrics/coverage/tokens/walks.json`, `feedback/picks-*.json`).
- Timestamps come from the shell, not JS.
