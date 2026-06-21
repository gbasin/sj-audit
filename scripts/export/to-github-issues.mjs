#!/usr/bin/env node
// to-github-issues.mjs — turn the top P0/P1 issues into GitHub issues (repro + code pointer).
//
// Usage:
//   node to-github-issues.mjs --run <run-dir> [--severity P0,P1] [--labels ux,sj-audit]
//                             [--repo owner/name] [--create]
//
// Dry-run by DEFAULT (prints what it would create). Pass --create to actually run
// `gh issue create`. Requires `gh` on PATH and auth when creating.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const A = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : 'true']] : acc), []))
if (!A.run) { console.error('usage: to-github-issues.mjs --run <run-dir> [--severity P0,P1] [--labels ..] [--repo o/n] [--create]'); process.exit(2) }
const RUN = path.resolve(A.run)
const sevs = (A.severity || 'P0,P1').split(',')
const labels = (A.labels || 'ux,sj-audit').split(',').filter(Boolean)
const create = A.create === 'true' || A.create === true

const synthesis = JSON.parse(fs.readFileSync(path.join(RUN, 'synthesis.json'), 'utf8'))
let analyses = []
try { const r = JSON.parse(fs.readFileSync(path.join(RUN, 'results.json'), 'utf8')); analyses = Array.isArray(r) ? r : (r.analyses || []) } catch (e) {}
const findingById = {}
for (const an of analyses) for (const f of (an.findings || [])) findingById[f.id] = { ...f, area: an.area }

const issues = (synthesis.topIssues || []).filter((i) => sevs.includes(i.severity))
if (!issues.length) { console.log(`No ${sevs.join('/')} issues to export.`); process.exit(0) }

function body(i) {
  const ev = (i.addressesFindingIds || []).map((id) => findingById[id]).filter(Boolean)
  const where = ev.map((f) => `- \`${f.where}\` — ${f.observation}`).join('\n')
  const cb = i.codeBug ? `\n**Code bug:** \`${i.codeBug.file}\`${i.codeBug.confirmed ? ' (confirmed in source)' : ''}${i.codeBug.note ? ' — ' + i.codeBug.note : ''}\n` : ''
  return [
    `**Severity:** ${i.severity} · **Area:** ${i.area}${i.lenses && i.lenses.length ? ' · **Lenses:** ' + i.lenses.join(', ') : ''}`,
    '',
    `**Why it matters (first-run):** ${i.why}`,
    '',
    `**Recommendation:** ${i.recommendation}`,
    i.refineVsBold ? `\n**Refine vs Bold:** ${i.refineVsBold}` : '',
    cb,
    where ? `\n**Evidence:**\n${where}` : '',
    '',
    '---',
    '_Filed by sj-audit. Grounded in screenshots + source; adversarially verified before filing._',
  ].filter((x) => x !== '').join('\n')
}

let created = 0
for (const i of issues) {
  const title = `[${i.severity}] ${i.title}`
  const b = body(i)
  if (!create) {
    console.log('\n' + '='.repeat(70))
    console.log('TITLE:', title)
    console.log('LABELS:', labels.join(', '))
    console.log(b)
    continue
  }
  const argv = ['issue', 'create', '--title', title, '--body', b]
  if (A.repo) argv.push('--repo', A.repo)
  for (const l of labels) argv.push('--label', l)
  const r = spawnSync('gh', argv, { encoding: 'utf8' })
  if (r.status === 0) { created++; console.log('created:', (r.stdout || '').trim()) }
  else { console.error('FAILED:', title, '\n', (r.stderr || r.error?.message || '').trim()) }
}
console.log(create ? `\n${created}/${issues.length} issues created.` : `\nDry run — ${issues.length} issue(s) above. Re-run with --create to file them.`)
