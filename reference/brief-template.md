# {{APP_NAME}} first-time-user UX/UI audit — shared analyst brief

You are one of several analysts auditing **{{APP_NAME}}** ({{ONE_LINE_WHAT_IT_IS}}). Your job:
think like a brand-new user dropping in for the **first time**, then critique through the
lens(es) assigned to you. Down to the small details.

> Fill every `{{PLACEHOLDER}}`. Keep it honest — analysts ground ONLY on this brief, the
> screenshots, and the real code (they do not re-drive the browser).

## What the product is (one paragraph)
{{PRODUCT_PARAGRAPH}}

## How it was exercised (so you don't need to)
A live instance was driven with `dev-browser` ({{RUN_MODE_AND_PERSONA_NOTES}}). The
following surfaces were captured. **Do NOT re-drive the browser** — analyze from the code,
the screenshots, and these notes.

## Screenshots (read the ones relevant to your area with the Read tool)
Folder: `{{RUN}}/screenshots/`
{{SCREENSHOT_INDEX}}   <!-- one line per shot: `01-login.png — <what it shows>` -->

## Confirmed observations & bugs (verified during the live run)
{{CONFIRMED_OBSERVATIONS}}   <!-- numbered; mark each as VERIFIED-in-code (file:line), real-UI, or mock-artifact -->

## Executed task walks (behavioral ground truth — outranks screenshot inference)
{{EXECUTED_WALKS}}   <!-- one line per walk: [OUTCOME] id (persona) "story" — completed/stuck/failed + reason. A stuck/failed walk is a real user failing a real task: raise it P0/P1 and cite walk:<id>. If a walk COMPLETED a flow you suspect is broken, trust the walk. Full detail: $RUN/walks.json. Omit this block if modules.walks was off. -->


## Caveats (be intellectually honest)
{{CAVEATS}}   <!-- e.g. agent surfaces ran on a MOCK; treat fixture timing as artifact, critique the real UI -->

## Where the code lives
{{CODE_MAP}}   <!-- the source roots + key files per area, from config.source -->

## Personas
{{PERSONAS}}   <!-- key — label — how seeded (live or code-only) -->

## The lens(es) for this audit (apply rigorously)
{{LENS_RUBRICS}}   <!-- inline the relevant reference/lenses/*.md so every analyst applies them the same way -->

## What to produce
- LOTS of first-time user stories across the personas, tied to concrete first-run moments.
- Findings that are specific and honest: cite the exact screen or code, separate real
  UI/UX problems from dev-mock artifacts, severity P0–P3, and a crisp lens-voiced verdict
  per finding (with the named principle/heuristic/criterion where the lens has one).
- solutionIdeas: at least one BOLD reimagining and several REFINE-in-place fixes, described
  concretely enough to render as a mockup (layout, copy, color, components). Tie each to finding ids.
Return ONLY the structured object (see reference/schemas/analyst.schema.json).
