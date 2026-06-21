#!/usr/bin/env node
// matrix.mjs — capture a URL across a viewport x color-scheme matrix.
//
// Usage:
//   node matrix.mjs --url <url> --name <surface> --out <run>/screenshots/matrix [--full]
//                   [--viewports 1440x900,834x1112,390x844] [--themes dark,light]
//
// Drives dev-browser once per (viewport, theme), saves each screenshot, and copies it into
// --out as <name>-<viewport>-<theme>.png. Theme is emulated via prefers-color-scheme; apps
// with an explicit in-app theme toggle should be switched by the agent during exploration.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { runDevBrowser, extractShots, SHOT_MARK } = await import(path.join(__dirname, '../lib/devbrowser.mjs'))

const A = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : 'true']] : acc), []))
if (!A.url) { console.error('usage: matrix.mjs --url <url> --name <surface> --out <dir> [--viewports ..] [--themes ..] [--full]'); process.exit(2) }
const name = A.name || 'surface'
const outDir = path.resolve(A.out || 'screenshots/matrix')
fs.mkdirSync(outDir, { recursive: true })
const viewports = (A.viewports || '1440x900,834x1112,390x844').split(',').map((v) => { const [w, h] = v.split('x').map(Number); return { w, h, name: w >= 1200 ? 'desktop' : w >= 700 ? 'tablet' : 'mobile' } })
const themes = (A.themes || 'dark,light').split(',')
const full = A.full === 'true' || A.full === true

const written = []
for (const vp of viewports) {
  for (const theme of themes) {
    const label = `${name}-${vp.name}-${theme}`
    const script = `
const page = await browser.getPage("main");
try{ await page.emulateMedia({ colorScheme: ${JSON.stringify(theme)} }); }catch(e){}
await page.setViewportSize({ width: ${vp.w}, height: ${vp.h} });
await page.goto(${JSON.stringify(A.url)}, { waitUntil: "load" });
await new Promise(r=>setTimeout(r, 900));
const __p = await saveScreenshot(await page.screenshot({ fullPage: ${full ? 'true' : 'false'} }), ${JSON.stringify(label)});
console.log(${JSON.stringify(SHOT_MARK)} + __p);
`
    const { stdout, stderr, status } = runDevBrowser(script)
    const shots = extractShots(stdout)
    if (!shots.length) { console.error(`  ! ${label}: no screenshot (status ${status})`); if (stderr) console.error('    ' + stderr.slice(0, 200)); continue }
    const src = shots[0]
    const dest = path.join(outDir, `${label}.png`)
    try { fs.copyFileSync(src, dest); written.push(dest); console.log(`  ✓ ${label}`) } catch (e) { console.error(`  ! ${label}: copy failed (${e.message}); source at ${src}`) }
  }
}
console.log(`matrix: ${written.length}/${viewports.length * themes.length} captured -> ${outDir}`)
