#!/usr/bin/env node
// interaction.mjs — measure the a11y details that only exist when you DRIVE the page:
// hit-target sizes, keyboard tab order, and whether focus is actually visible. Straight from
// the live DOM, appended to the run's metrics.json. Don't eyeball "is that button big enough"
// or "can you tab to it" — measure it.
//
// Usage: node interaction.mjs --url <url> --name <surface> [--out <run>/metrics.json]
//                             [--theme dark|light] [--viewport 1440x900] [--tabs 40]
//
// Produces metrics.surfaces[].interaction = {
//   hitTargets: { checked, underAA (<24x24, WCAG 2.5.8), underAAA (<44x44, 2.5.5), fails:[{name,role,w,h,tier}] },
//   tabOrder:   { reached, sequence:[{name,role,tag,tabindex,focusVisible}], positiveTabindex:[...], noFocusIndicator:[...], possibleTrap },
// }

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { runDevBrowser, extractJSON } = await import(path.join(__dirname, '../lib/devbrowser.mjs'))

const A = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : 'true']] : acc), []))
if (!A.url) { console.error('usage: interaction.mjs --url <url> --name <surface> [--out metrics.json] [--theme] [--viewport WxH] [--tabs N]'); process.exit(2) }
const vp = A.viewport ? A.viewport.split('x').map(Number) : [1440, 900]
const TABS = +(A.tabs || 40)

// --- in-page: scan interactive elements for hit-target size ---
const HIT_FN = `() => {
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=radio],[onclick],[tabindex]:not([tabindex="-1"])';
  const nameOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || (el.innerText || '').trim() || el.value || el.getAttribute('name') || el.tagName.toLowerCase()).replace(/\\s+/g,' ').slice(0,44);
  const out = []; let checked = 0;
  for (const el of Array.from(document.querySelectorAll(SEL))) {
    const cs = getComputedStyle(el); if (cs.visibility==='hidden' || cs.display==='none' || +cs.opacity===0) continue;
    const r = el.getBoundingClientRect(); if (r.width===0 || r.height===0) continue;
    // skip inline links inside a sentence (2.5.8 exempts inline targets)
    const inlineLink = el.tagName==='A' && cs.display.includes('inline') && el.closest('p,li,span');
    checked++;
    const w = Math.round(r.width), h = Math.round(r.height);
    const tier = (w<24||h<24) ? 'AA' : (w<44||h<44) ? 'AAA' : null;
    if (tier && !inlineLink) out.push({ name: nameOf(el), role: el.getAttribute('role')||el.tagName.toLowerCase(), w, h, tier });
  }
  out.sort((a,b)=> (a.w*a.h)-(b.w*b.h));
  return { checked, underAA: out.filter(x=>x.tier==='AA').length, underAAA: out.filter(x=>x.tier==='AAA').length, fails: out.slice(0,30) };
}`

// --- in-page: read the currently focused element + whether its focus is visible ---
const FOCUS_FN = `() => {
  const el = document.activeElement;
  if (!el || el===document.body || el===document.documentElement) return null;
  const cs = getComputedStyle(el);
  const ring = (cs.outlineStyle!=='none' && parseFloat(cs.outlineWidth)>0) || (cs.boxShadow && cs.boxShadow!=='none');
  const name = (el.getAttribute('aria-label') || el.getAttribute('title') || (el.innerText||'').trim() || el.value || el.getAttribute('placeholder') || el.getAttribute('name') || '').replace(/\\s+/g,' ').slice(0,44);
  const r = el.getBoundingClientRect();
  return { tag: el.tagName.toLowerCase(), role: el.getAttribute('role')||'', name, tabindex: el.getAttribute('tabindex'), focusVisible: !!ring, x: Math.round(r.x), y: Math.round(r.y) };
}`

// --- in-page: positive tabindex anti-pattern scan ---
const POSITIVE_TI_FN = `() => Array.from(document.querySelectorAll('[tabindex]')).filter(el=>+el.getAttribute('tabindex')>0).map(el=>({ tag: el.tagName.toLowerCase(), tabindex: el.getAttribute('tabindex'), name: ((el.innerText||el.getAttribute('aria-label')||'').trim()).slice(0,40) })).slice(0,20)`

const script = [
  'const page = await browser.getPage("main");',
  `try{ await page.emulateMedia({ colorScheme: ${JSON.stringify(A.theme || 'dark')} }); }catch(e){}`,
  `await page.setViewportSize({ width: ${vp[0]}, height: ${vp[1]} });`,
  `await page.goto(${JSON.stringify(A.url)}, { waitUntil: "load" });`,
  'await new Promise(r=>setTimeout(r, 900));',
  `const hitTargets = await page.evaluate(${HIT_FN});`,
  `const positiveTabindex = await page.evaluate(${POSITIVE_TI_FN});`,
  // focus the document body first, then Tab through and record the sequence
  'try{ await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); }catch(e){}',
  'const seq = []; let trap = false; let sameRun = 0; let prevKey = null;',
  `for (let i=0; i<${TABS}; i++) {`,
  '  await page.keyboard.press("Tab");',
  '  await new Promise(r=>setTimeout(r, 40));',
  `  const f = await page.evaluate(${FOCUS_FN});`,
  '  if (!f) { break; }',
  '  const key = f.tag+"|"+f.name+"|"+f.x+","+f.y;',
  '  if (key===prevKey) { sameRun++; if (sameRun>=3) { trap = true; break; } } else { sameRun=0; }',
  '  prevKey = key; seq.push(f);',
  '}',
  'const noFocusIndicator = seq.filter(s=>!s.focusVisible).map(s=>({ name: s.name, role: s.role||s.tag }));',
  'const reachedKeys = new Set(seq.map(s=>s.tag+"|"+s.name+"|"+s.x+","+s.y));',
  'const result = { hitTargets, tabOrder: { reached: reachedKeys.size, sequence: seq.slice(0,60), positiveTabindex, noFocusIndicator: noFocusIndicator.slice(0,30), possibleTrap: trap } };',
  `console.log("__SJ_JSON__" + JSON.stringify(result));`,
].join('\n')

const { stdout, stderr, status } = runDevBrowser(script, { timeoutMs: 90000 })
const r = extractJSON(stdout)[0]
if (!r) { console.error('interaction scan produced no result (status', status + ')'); if (stderr) console.error(stderr.slice(0, 600)); process.exit(1) }

const surface = { name: A.name || 'surface', viewport: A.viewport || `${vp[0]}x${vp[1]}`, theme: A.theme || undefined, interaction: r }
const out = A.out || 'metrics.json'
let metrics = { surfaces: [] }
try { metrics = JSON.parse(fs.readFileSync(out, 'utf8')); if (!Array.isArray(metrics.surfaces)) metrics.surfaces = [] } catch (e) {}
const key = (s) => `${s.name}|${s.viewport || ''}|${s.theme || ''}`
const idx = metrics.surfaces.findIndex((s) => key(s) === key(surface))
if (idx >= 0) metrics.surfaces[idx] = { ...metrics.surfaces[idx], interaction: r }
else metrics.surfaces.push(surface)
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
fs.writeFileSync(out, JSON.stringify(metrics, null, 2) + '\n')

const ht = r.hitTargets, to = r.tabOrder
console.log(`interaction: ${surface.name} — hit-targets ${ht.underAA} under 24px (AA), ${ht.underAAA} under 44px (AAA) of ${ht.checked}; tab reached ${to.reached}, ${to.noFocusIndicator.length} with no visible focus${to.possibleTrap ? ', FOCUS TRAP' : ''}${to.positiveTabindex.length ? ', ' + to.positiveTabindex.length + ' positive tabindex' : ''} -> ${out}`)
