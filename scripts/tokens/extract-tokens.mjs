#!/usr/bin/env node
// extract-tokens.mjs — pull an app's CSS custom properties (design tokens) from the running
// app so the report's mockups render in the real tokens.
//
// Usage: node extract-tokens.mjs --url <app-url> [--out <run>/tokens.json] [--theme dark|light]
//
// Reads getComputedStyle(:root) for all `--*` custom properties. Toggle the app to its
// "intended" theme first (the report pins mockups to whatever you capture here).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { runDevBrowser, extractJSON, buildEvalScript } = await import(path.join(__dirname, '../lib/devbrowser.mjs'))

const A = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : 'true']] : acc), []))
if (!A.url) { console.error('usage: extract-tokens.mjs --url <app-url> [--out tokens.json] [--theme dark|light]'); process.exit(2) }

const evalFn = `() => {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (let i = 0; i < cs.length; i++) { const p = cs[i]; if (p && p.indexOf('--') === 0) { const v = cs.getPropertyValue(p).trim(); if (v) out[p] = v; } }
  return out;
}`

const script = buildEvalScript({ url: A.url, evalFnSource: evalFn, colorScheme: A.theme || null })
const { stdout, stderr, status } = runDevBrowser(script)
const got = extractJSON(stdout)[0]
if (!got || !Object.keys(got).length) {
  console.error('No CSS custom properties found. (status', status + ')')
  if (stderr) console.error(stderr.slice(0, 500))
  process.exit(1)
}
const out = A.out || 'tokens.json'
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
fs.writeFileSync(out, JSON.stringify(got, null, 2) + '\n')
console.log(`wrote ${out} — ${Object.keys(got).length} tokens (e.g. ${Object.keys(got).slice(0, 6).join(', ')})`)
