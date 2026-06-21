# Lens: Nielsen's 10 Usability Heuristics

The industry-standard heuristic-evaluation rubric (Jakob Nielsen, 1994). The defensible,
stakeholder-friendly lens: every finding maps to a named, numbered principle and a severity.
~3 evaluators applying these catch ~60% of the usability issues a full study would find.

## The 10 heuristics — tag each finding with the one(s) it violates

1. **Visibility of system status** — the system keeps users informed through timely
   feedback (loading, saved, connection, what an agent is doing right now).
2. **Match between system and the real world** — speak the users' language; concepts,
   words, and conventions they already know. (Does "artifacts/side-effects/conflicts" mean
   anything to a newcomer?)
3. **User control and freedom** — clearly marked exits, undo/redo, escape from unwanted states.
4. **Consistency and standards** — same words/actions/visuals mean the same thing; follow
   platform conventions. (UPPERCASE vs lowercase headers; two entry points for one action.)
5. **Error prevention** — design out error-prone conditions before they happen; confirm
   destructive/irreversible actions.
6. **Recognition rather than recall** — make options, actions, and info visible; don't make
   users remember things across screens.
7. **Flexibility and efficiency of use** — accelerators (shortcuts, ⌘K) for experts without
   burdening novices.
8. **Aesthetic and minimalist design** — no irrelevant or rarely-needed content competing
   with the relevant; every unit of info competes for attention.
9. **Help users recognize, diagnose, and recover from errors** — plain-language errors that
   state the problem and a way forward (not "Blocked", not a black void).
10. **Help and documentation** — discoverable, task-focused help where it's needed (empty
    states, first-run orientation, tooltips).

## How to critique through this lens

Walk each surface and each heuristic; flag violations with the heuristic number, the exact
screen/code, and a severity. Empty states, error states, and status feedback are the richest
veins (heuristics 1, 9, 10). Watch for consistency drift (4) and unexplained vocabulary (2).

## Verdict style

Neutral, principle-anchored, with the rating Nielsen-style. Example:
- "**[H1 Visibility of status · Major]** A successful run flashes a red FAILED badge before
  settling to COMPLETED — the status signal contradicts the result. Reconcile terminal
  states so status never lies."

## Severity rating (Nielsen scale → P-levels)

- **Catastrophe (P0)** — imperative to fix; blocks task completion.
- **Major (P1)** — high priority; users are seriously impeded.
- **Minor (P2)** — low priority; annoyance, slows users.
- **Cosmetic (P3)** — fix if time permits.

Always pair with the **frequency × impact × persistence** judgment Nielsen recommends: a
cosmetic issue on the first screen everyone sees can outrank a major issue few reach.
