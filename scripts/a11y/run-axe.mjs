#!/usr/bin/env node
// run-axe.mjs — run axe-core against a URL and append the result to the run's metrics.json.
//
// Usage: node run-axe.mjs --url <url> --name <surface> [--out <run>/metrics.json]
//                         [--viewport 1440x900] [--theme dark|light]
//
// Injects axe-core@4 from jsDelivr into the page (the page has network even though the
// dev-browser sandbox doesn't), runs it, and records violations grouped by impact +
// mapped to WCAG success criteria. Automated checks catch ~30-57% of issues — combine
// with the manual WCAG lens pass.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { runDevBrowser, extractJSON, buildEvalScript } = await import(path.join(__dirname, '../lib/devbrowser.mjs'))

const A = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : 'true']] : acc), []))
if (!A.url) { console.error('usage: run-axe.mjs --url <url> --name <surface> [--out metrics.json]'); process.exit(2) }
const viewport = A.viewport ? { width: +A.viewport.split('x')[0], height: +A.viewport.split('x')[1] } : null

const evalFn = `async () => {
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/axe-core@4/axe.min.js'; s.onload=res; s.onerror=()=>rej(new Error('axe load failed')); document.head.appendChild(s); });
  // target-size (WCAG 2.5.8, AA in 2.2) is OFF by default in axe — turn it on. Note axe usually
  // returns it as INCOMPLETE (needs-review), not a hard violation, and exempts well-spaced targets;
  // interaction.mjs is the deterministic px measure, this just carries the WCAG 2.5.8 mapping.
  const r = await window.axe.run(document, { resultTypes: ['violations', 'incomplete'], rules: { 'target-size': { enabled: true } } });
  const wcagOf = (tags) => { for (const t of tags){ const m = /^wcag(\\d)(\\d)(\\d+)$/.exec(t); if (m) return m[1]+'.'+m[2]+'.'+m[3]; } return ''; };
  const map = (arr, needsReview) => arr.map(v => ({ id: v.id, impact: v.impact || (needsReview ? 'serious' : undefined), help: v.help, wcag: wcagOf(v.tags), nodes: v.nodes.length, needsReview: needsReview || undefined }));
  const violations = map(r.violations, false).concat(map((r.incomplete || []).filter(v => v.id === 'target-size'), true));
  const counts = { critical:0, serious:0, moderate:0, minor:0 };
  for (const v of violations) if (counts[v.impact] != null) counts[v.impact] += 1;
  return { violations, counts };
}`

const script = buildEvalScript({ url: A.url, evalFnSource: evalFn, viewport, colorScheme: A.theme || null, waitMs: 1200 })
const { stdout, stderr, status } = runDevBrowser(script)
const axe = extractJSON(stdout)[0]
if (!axe) { console.error('axe run produced no result (status', status + ')'); if (stderr) console.error(stderr.slice(0, 600)); process.exit(1) }

const surface = { name: A.name || 'surface', viewport: A.viewport || (viewport ? `${viewport.width}x${viewport.height}` : undefined), theme: A.theme || undefined, axe }
const out = A.out || 'metrics.json'
let metrics = { surfaces: [] }
try { metrics = JSON.parse(fs.readFileSync(out, 'utf8')); if (!Array.isArray(metrics.surfaces)) metrics.surfaces = [] } catch (e) {}
// merge into a surface with the same name+viewport+theme if present, else push
const key = (s) => `${s.name}|${s.viewport || ''}|${s.theme || ''}`
const idx = metrics.surfaces.findIndex((s) => key(s) === key(surface))
if (idx >= 0) metrics.surfaces[idx] = { ...metrics.surfaces[idx], ...surface }
else metrics.surfaces.push(surface)
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
fs.writeFileSync(out, JSON.stringify(metrics, null, 2) + '\n')
console.log(`axe: ${surface.name} — ${axe.counts.critical} critical, ${axe.counts.serious} serious, ${axe.counts.moderate} moderate, ${axe.counts.minor} minor -> ${out}`)
