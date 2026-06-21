# Lens: Accessibility / WCAG 2.2

The accessibility-first lens, grounded in WCAG 2.2 and **measured** with axe-core (don't
guess contrast — compute it). Automated tooling reliably catches ~30–57% of issues with near-
zero false positives; this lens combines that hard data with manual judgment on the rest
(focus order, keyboard operability, meaningful labels, motion).

## The four POUR principles — organize findings under these

- **Perceivable** — text alternatives for non-text content; sufficient color contrast
  (4.5:1 body text, 3:1 large text & UI components); content not conveyed by color alone;
  resizable/reflowable text; visible focus.
- **Operable** — full keyboard operability, no traps; visible focus indicator (2.4.7);
  target size ≥ 24×24 (2.5.8, new in 2.2); no content that flashes dangerously; respects
  `prefers-reduced-motion`.
- **Understandable** — predictable navigation and behavior; labels and instructions for
  inputs; clear, specific error identification and suggestions (3.3.x).
- **Robust** — valid semantics; correct ARIA roles/names/states; works with assistive tech;
  status messages exposed via live regions (4.1.3).

## How to critique through this lens

1. Run `scripts/a11y/run-axe.mjs <url>` per surface → ingest violations into findings (each
   axe rule maps to WCAG success criteria; cite the criterion, e.g. `1.4.3 Contrast (Minimum)`).
2. Run `scripts/a11y/contrast.mjs` for computed contrast on key text/UI pairs.
3. Manually verify what automation misses: tab through the whole flow (focus order, traps,
   visible focus), check that every interactive control has an accessible name, that errors
   are announced, that `prefers-reduced-motion` and high-contrast settings are honored, and
   that nothing critical is color-only.

## Verdict style

Criterion-anchored and measured. Example:
- "**[WCAG 1.4.3 Contrast · axe: color-contrast · serious]** The muted helper text is
  3.1:1 on the raised surface — below the 4.5:1 minimum. First-timers literally can't read
  the one hint that unblocks them."

## Severity mapping (axe impact → P-levels)

- **critical → P0**, **serious → P1**, **moderate → P2**, **minor → P3**.
- Escalate one level if the issue is on a path *every* first-time user must cross (login, first-run empty state).
