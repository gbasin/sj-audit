# Hook contract

The per-app config (`.sj-audit/config.yaml`) is thin; the gnarly, app-specific logic lives
in three small, independently-runnable scripts under `.sj-audit/hooks/`. Each must be
executable (`chmod +x`) and runnable by hand for debugging.

## `launch.sh` — stand up an isolated instance

**Purpose:** isolate (so it never collides with other agents/dev servers), start the app,
and tell the skill where to reach it.

- **Args:** none.
- **Env in:** `SJ_RUN` = the run directory (for logs/pids), `SJ_MODE` = `isolate|attach`.
- **stdout contract (REQUIRED):** print exactly one line `BASE_URL=<url>` once the app is
  reachable. Optionally also print `CLEANUP_PID=<pid>` and `WORKTREE=<path>` so the skill
  can tear down afterward. Everything else goes to stderr or a log file.
- **Exit:** `0` on success (server started, BASE_URL printed). Non-zero aborts the audit.
- **Isolation recipe (reference):** create a git worktree from the default branch; create a
  fresh, uniquely-named database; pick free ports (don't hardcode — probe); run migrations;
  start the server + web in the background (write logs under `$SJ_RUN`); poll until healthy;
  print `BASE_URL`.

Example skeleton:
```sh
#!/usr/bin/env bash
set -euo pipefail
RUN="${SJ_RUN:-/tmp/sj-run}"
# ... create worktree, fresh DB, pick free ports, migrate, start in background ...
# wait until reachable, then:
echo "BASE_URL=http://localhost:${WEB_PORT}"
echo "CLEANUP_PID=${SERVER_PID}"
```

## `seed.sh <persona>` — provision a persona's world

**Purpose:** put the app into the state a given persona would see (users, workspace, data).

- **Args:** `$1` = persona key from `config.personas[].key` (e.g. `solo`, `lead`).
- **Env in:** `SJ_RUN`, `SJ_BASE_URL` (from launch).
- **stdout (optional):** `LOGIN_HINT=<...>` or any handles/codes the browser driver needs to log in as this persona.
- **Exit:** `0` if seeded; non-zero if this persona can't be live-seeded — the skill then
  treats it as `code-only` (reasons about it from source + screenshots).
- For personas declared `seed: code-only` in config, there is no call — the skill reviews
  their experience from code (e.g. a second human teammate you can't fabricate locally).

## `healthcheck.sh` — readiness probe (optional)

- **Args:** none. **Env in:** `SJ_BASE_URL`.
- **Exit:** `0` when the app is fully ready to drive; non-zero (and the skill retries with backoff).
- If omitted, the skill polls `BASE_URL` for any HTTP response (a `401` counts as "up").

## Cleanup

On finish (or abort), the skill kills `CLEANUP_PID` and removes `WORKTREE` if they were
printed. Hooks should be safe to re-run: name DBs/worktrees uniquely per run (e.g. include
`$SJ_RUN`'s basename) so parallel audits don't clash.
