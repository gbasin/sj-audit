#!/usr/bin/env bash
# run-lighthouse.sh — Lighthouse category scores (perf / a11y / best-practices / SEO) for a URL,
# merged into a run's metrics.json under the named surface.
#
# Usage: run-lighthouse.sh <url> <surface-name> [metrics.json]
#
# Requires Chrome + npx (Lighthouse is invoked via `npx lighthouse`, downloaded on first run).
set -euo pipefail

URL="${1:?usage: run-lighthouse.sh <url> <surface> [metrics.json]}"
NAME="${2:?usage: run-lighthouse.sh <url> <surface> [metrics.json]}"
OUT="${3:-metrics.json}"

TMP="$(mktemp -t lh-XXXX).json"
trap 'rm -f "$TMP"' EXIT

echo "lighthouse: auditing $URL ..."
npx --yes lighthouse "$URL" \
  --quiet --output=json --output-path="$TMP" \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless=new --no-sandbox" >/dev/null

# Extract the four 0..1 category scores and merge into metrics.json with node (always available here).
node - "$TMP" "$NAME" "$OUT" <<'NODE'
const fs = require('node:fs');
const [, , lhPath, name, out] = process.argv;
const lh = JSON.parse(fs.readFileSync(lhPath, 'utf8'));
const c = lh.categories || {};
const lighthouse = {
  performance: c.performance?.score ?? null,
  accessibility: c.accessibility?.score ?? null,
  bestPractices: c['best-practices']?.score ?? null,
  seo: c.seo?.score ?? null,
};
let metrics = { surfaces: [] };
try { metrics = JSON.parse(fs.readFileSync(out, 'utf8')); if (!Array.isArray(metrics.surfaces)) metrics.surfaces = []; } catch (e) {}
const idx = metrics.surfaces.findIndex((s) => s.name === name && !s.viewport && !s.theme);
if (idx >= 0) metrics.surfaces[idx].lighthouse = lighthouse;
else metrics.surfaces.push({ name, lighthouse });
fs.writeFileSync(out, JSON.stringify(metrics, null, 2) + '\n');
const pct = (x) => x == null ? 'n/a' : Math.round(x * 100);
console.log(`lighthouse: ${name} — perf ${pct(lighthouse.performance)} · a11y ${pct(lighthouse.accessibility)} · best-practices ${pct(lighthouse.bestPractices)} · seo ${pct(lighthouse.seo)} -> ${out}`);
NODE
