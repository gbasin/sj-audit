#!/usr/bin/env node
// contrast.mjs — compute WCAG contrast for visible text against its effective background,
// straight from the live DOM, and record failures into the run's metrics.json.
//
// Usage: node contrast.mjs --url <url> --name <surface> [--out <run>/metrics.json] [--theme dark|light]
//
// Don't guess contrast — measure it. Threshold: 4.5:1 normal text, 3:1 for large text
// (>=24px, or >=18.66px bold). Reports unique failing color/size combinations with examples.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { runDevBrowser, extractJSON, buildEvalScript } = await import(path.join(__dirname, '../lib/devbrowser.mjs'))

const A = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : 'true']] : acc), []))
if (!A.url) { console.error('usage: contrast.mjs --url <url> --name <surface> [--out metrics.json]'); process.exit(2) }

const evalFn = `() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if(!m) return null; const p=m[1].split(',').map(s=>parseFloat(s)); return {r:p[0],g:p[1],b:p[2],a:p[3]==null?1:p[3]}; };
  const lin = (v) => { v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
  const lum = (c) => 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b);
  const ratio = (a,b) => { const L1=lum(a),L2=lum(b); const hi=Math.max(L1,L2),lo=Math.min(L1,L2); return (hi+0.05)/(lo+0.05); };
  const effBg = (el) => { let n=el; while(n){ const c=parse(getComputedStyle(n).backgroundColor); if(c && c.a>0) return c; n=n.parentElement; } return {r:255,g:255,b:255,a:1}; };
  const seen = {}; const rows = [];
  const els = Array.from(document.querySelectorAll('body *')).filter(el => {
    if (['SCRIPT','STYLE','SVG','PATH','NOSCRIPT'].includes(el.tagName)) return false;
    const t = Array.from(el.childNodes).some(n => n.nodeType===3 && n.textContent.trim().length>1);
    if (!t) return false;
    const cs = getComputedStyle(el); if (cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0) return false;
    const r = el.getBoundingClientRect(); return r.width>0 && r.height>0;
  });
  for (const el of els.slice(0, 600)) {
    const cs = getComputedStyle(el);
    const fg = parse(cs.color); if(!fg) continue;
    const bg = effBg(el);
    const size = parseFloat(cs.fontSize)||16; const bold = (parseInt(cs.fontWeight)||400) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const req = large ? 3 : 4.5;
    const cr = ratio(fg, bg);
    const pass = cr >= req;
    const pair = 'rgb('+Math.round(fg.r)+','+Math.round(fg.g)+','+Math.round(fg.b)+') on rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')'+(large?' [large]':'');
    if (seen[pair]) continue; seen[pair] = 1;
    rows.push({ pair, ratio: cr.toFixed(2)+':1', required: req+':1', pass, sample: (el.textContent||'').trim().slice(0,40) });
  }
  rows.sort((a,b)=> parseFloat(a.ratio)-parseFloat(b.ratio));
  return { contrast: rows, fails: rows.filter(r=>!r.pass).length, checked: rows.length };
}`

const script = buildEvalScript({ url: A.url, evalFnSource: evalFn, colorScheme: A.theme || null, waitMs: 900 })
const { stdout, stderr, status } = runDevBrowser(script)
const r = extractJSON(stdout)[0]
if (!r) { console.error('contrast scan produced no result (status', status + ')'); if (stderr) console.error(stderr.slice(0, 600)); process.exit(1) }

const surface = { name: A.name || 'surface', theme: A.theme || undefined, contrast: r.contrast }
const out = A.out || 'metrics.json'
let metrics = { surfaces: [] }
try { metrics = JSON.parse(fs.readFileSync(out, 'utf8')); if (!Array.isArray(metrics.surfaces)) metrics.surfaces = [] } catch (e) {}
const key = (s) => `${s.name}|${s.viewport || ''}|${s.theme || ''}`
const idx = metrics.surfaces.findIndex((s) => key(s) === key(surface))
if (idx >= 0) metrics.surfaces[idx] = { ...metrics.surfaces[idx], contrast: r.contrast }
else metrics.surfaces.push(surface)
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
fs.writeFileSync(out, JSON.stringify(metrics, null, 2) + '\n')
console.log(`contrast: ${surface.name} — ${r.fails}/${r.checked} unique color pairs below threshold -> ${out}`)
