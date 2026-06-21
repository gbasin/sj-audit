#!/usr/bin/env node
// diff-runs.mjs — compare two audit runs: what's fixed, still broken, regressed, or new.
//
// Usage: node diff-runs.mjs --current <run-dir> --previous <run-dir> [--out <current>/regression.md]
//
// Matches findings by id (falling back to a normalized title) across results.json, and writes
// regression.{md,json} into the current run. Findings are matched per-area to avoid id collisions.

import fs from 'node:fs'
import path from 'node:path'

const A = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : 'true']] : acc), []))
if (!A.current || !A.previous) { console.error('usage: diff-runs.mjs --current <dir> --previous <dir> [--out file.md]'); process.exit(2) }

function loadFindings(dir) {
  let analyses = []
  try { const r = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8')); analyses = Array.isArray(r) ? r : (r.analyses || []) } catch (e) { console.error(`! could not read ${dir}/results.json`); }
  const map = new Map()
  for (const an of analyses) for (const f of (an.findings || [])) {
    const norm = (f.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const key = `${(an.area || '').toLowerCase()}::${f.id || norm}`
    map.set(key, { ...f, area: an.area, _norm: norm })
  }
  return map
}

const cur = loadFindings(path.resolve(A.current))
const prev = loadFindings(path.resolve(A.previous))

// secondary match by area+normalized-title when ids differ between runs
const prevByNorm = new Map(); for (const [, f] of prev) prevByNorm.set(`${(f.area || '').toLowerCase()}::${f._norm}`, f)
const curByNorm = new Map(); for (const [, f] of cur) curByNorm.set(`${(f.area || '').toLowerCase()}::${f._norm}`, f)
const inPrev = (f) => prev.has(`${(f.area || '').toLowerCase()}::${f.id}`) || prevByNorm.has(`${(f.area || '').toLowerCase()}::${f._norm}`)
const inCur = (f) => cur.has(`${(f.area || '').toLowerCase()}::${f.id}`) || curByNorm.has(`${(f.area || '').toLowerCase()}::${f._norm}`)

const stillBroken = [], regressedSeverity = [], newOnes = []
for (const [, f] of cur) {
  if (inPrev(f)) {
    const pf = prev.get(`${(f.area || '').toLowerCase()}::${f.id}`) || prevByNorm.get(`${(f.area || '').toLowerCase()}::${f._norm}`)
    stillBroken.push(f)
    if (pf && sevRank(f.severity) > sevRank(pf.severity)) regressedSeverity.push({ f, from: pf.severity, to: f.severity })
  } else newOnes.push(f)
}
const fixed = []
for (const [, f] of prev) if (!inCur(f)) fixed.push(f)

function sevRank(s) { return ({ P0: 4, P1: 3, P2: 2, P3: 1 })[s] || 0 }
const bySev = (a, b) => sevRank(b.severity) - sevRank(a.severity)
fixed.sort(bySev); stillBroken.sort(bySev); newOnes.sort(bySev)

const md = []
md.push(`# Regression — ${path.basename(path.resolve(A.previous))} → ${path.basename(path.resolve(A.current))}`)
md.push('')
md.push(`- ✅ Fixed: **${fixed.length}**  ·  ⚠️ Still broken: **${stillBroken.length}**  ·  🔺 New: **${newOnes.length}**  ·  ↗ Severity regressed: **${regressedSeverity.length}**`)
const sec = (title, arr, fmt) => { md.push('', `## ${title} (${arr.length})`); if (!arr.length) { md.push('_none_'); return } for (const x of arr) md.push(fmt(x)) }
sec('✅ Fixed', fixed, (f) => `- [${f.severity}] ${f.title} _(${f.area})_`)
sec('🔺 New', newOnes, (f) => `- [${f.severity}] ${f.title} _(${f.area})_ — ${f.where}`)
sec('↗ Severity regressed', regressedSeverity, (x) => `- ${x.f.title} _(${x.f.area})_ — ${x.from} → ${x.to}`)
sec('⚠️ Still broken', stillBroken, (f) => `- [${f.severity}] ${f.title} _(${f.area})_`)

const out = A.out || path.join(path.resolve(A.current), 'regression.md')
fs.writeFileSync(out, md.join('\n') + '\n')
fs.writeFileSync(out.replace(/\.md$/, '.json'), JSON.stringify({ fixed, stillBroken, newOnes, regressedSeverity }, null, 2) + '\n')
console.log(`regression: ✅ ${fixed.length} fixed · ⚠️ ${stillBroken.length} still broken · 🔺 ${newOnes.length} new · ↗ ${regressedSeverity.length} regressed -> ${out}`)
