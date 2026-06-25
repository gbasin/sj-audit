#!/usr/bin/env node
// run-walks.mjs — DRIVE the live app through named user-story "walks" and record what
// actually happened. This is the behavioral evidence the screenshot+code analysts can't
// produce: did a first-timer FIND the path and COMPLETE the task, or get stuck / fail?
//
// Usage:
//   node run-walks.mjs --plan <walks.plan.json> --base <BASE_URL> --run <run-dir>
//                      [--out <run>/walks.json] [--shots <run>/screenshots/walks]
//                      [--timeout 8000] [--only walk-id,walk-id]
//
// The plan is authored by the orchestrator AFTER live exploration (it knows the real
// selectors/labels). Each walk is a sequence of steps in user terms (click "Run a demo
// agent", fill the handle, press Enter). We execute them faithfully in ONE dev-browser
// script per walk (state persists across steps within a walk — no re-navigation), shoot a
// screenshot after every step, and classify the outcome:
//   completed — every required step ran AND the success assertions passed
//   stuck     — a required step's target never became actionable (the user couldn't proceed;
//               this is the discoverability / dead-end signal)
//   failed    — steps ran but the goal wasn't reached (assertion failed or an error surfaced)
//   error     — harness/script failure (not a product verdict)
//
// We DON'T self-heal or guess: a faithful execution + rich failure context (screenshot +
// the interactive elements visible at the dead-end, with their hit-target sizes) is what
// keeps the signal high. A bad selector vs. a real dead-end is then distinguishable by eye.
//
// Plan shape (see reference/schemas/walks.schema.json):
//   { walks: [ {
//       id, persona, story, goal,
//       startPath: "/" | startUrl: "http://...",         // where the walk begins
//       viewport?: "1440x900", theme?: "dark"|"light",
//       steps: [ { action, target?, value?, note?, optional?, timeout? } ],
//       success?: [ { type: "text"|"selector"|"url"|"absent", value } ]
//   } ] }
//
// target spec (resolved to a Playwright locator, tried in order if an array):
//   "Run a demo agent"            → role=button|link|tab with that accessible name, else text
//   { role, name }  { text }  { label }  { placeholder }  { testid }  { css }  ({ nth })

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { runDevBrowser, extractJSON } = await import(path.join(__dirname, '../lib/devbrowser.mjs'))

const A = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : 'true']] : acc), []))
if (!A.plan) { console.error('usage: run-walks.mjs --plan <walks.plan.json> --base <BASE_URL> --run <dir> [--out walks.json] [--shots dir] [--only id,id]'); process.exit(2) }

const RUN = path.resolve(A.run || '.')
const BASE = (A.base || '').replace(/\/$/, '')
const OUT = path.resolve(A.out || path.join(RUN, 'walks.json'))
const SHOTS = path.resolve(A.shots || path.join(RUN, 'screenshots', 'walks'))
const TIMEOUT = +(A.timeout || 8000)
const ONLY = A.only && A.only !== 'true' ? new Set(A.only.split(',').map((s) => s.trim())) : null
fs.mkdirSync(SHOTS, { recursive: true })

const plan = JSON.parse(fs.readFileSync(path.resolve(A.plan), 'utf8'))
let walks = Array.isArray(plan) ? plan : (plan.walks || [])
if (ONLY) walks = walks.filter((w) => ONLY.has(w.id))
if (!walks.length) { console.error('no walks to run (empty plan or --only matched nothing)'); process.exit(2) }

// ---- the in-sandbox runner (string baked into each dev-browser script) ----
// QuickJS supports modern JS. `page` is full Playwright. We resolve targets to locators,
// run each step with a per-step timeout, and screenshot after every step via saveScreenshot.
const RUNNER = `
const abs = (u) => !u ? BASE + (WALK.startPath || '/') : (/^https?:/.test(u) ? u : BASE + (u.startsWith('/') ? u : '/' + u));
const slug = (s) => String(s || 'step').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28);

// target -> array of candidate Playwright locators (tried in order until one matches)
function candidates(target, action) {
  if (target == null) return [];
  if (typeof target === 'string') {
    const t = target;
    if (action === 'fill' || action === 'type') return [page.getByLabel(t, { exact: false }), page.getByPlaceholder(t), page.getByRole('textbox', { name: t }), page.locator(t)];
    return [page.getByRole('button', { name: t }), page.getByRole('link', { name: t }), page.getByRole('tab', { name: t }), page.getByRole('menuitem', { name: t }), page.getByText(t, { exact: false }), page.locator(t)];
  }
  const list = Array.isArray(target) ? target : [target];
  const out = [];
  for (const s of list) {
    if (typeof s === 'string') { out.push(...candidates(s, action)); continue; }
    let loc = null;
    if (s.role) loc = page.getByRole(s.role, s.name ? { name: s.name, exact: !!s.exact } : {});
    else if (s.testid) loc = page.getByTestId(s.testid);
    else if (s.label) loc = page.getByLabel(s.label, { exact: !!s.exact });
    else if (s.placeholder) loc = page.getByPlaceholder(s.placeholder);
    else if (s.text) loc = page.getByText(s.text, { exact: !!s.exact });
    else if (s.css) loc = page.locator(s.css);
    if (loc) { if (typeof s.nth === 'number') loc = loc.nth(s.nth); else loc = loc.first(); out.push(loc); }
  }
  return out;
}

// first candidate that is visible within the budget; throws if none
async function pick(target, action, timeout) {
  const cands = candidates(target, action);
  if (!cands.length) throw new Error('no resolvable target');
  const per = Math.max(400, Math.floor(timeout / cands.length));
  let lastErr = null;
  for (const loc of cands) {
    try { await loc.waitFor({ state: 'visible', timeout: per }); return loc; } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('target not found');
}

// snapshot the visible interactive elements (name + hit-target size) — the dead-end / discoverability map
async function interactives() {
  return await page.evaluate(() => {
    const SEL = 'a,button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[onclick],[tabindex]:not([tabindex="-1"])';
    const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || (el.innerText || el.value || '').trim() || el.getAttribute('name') || '').replace(/\\s+/g, ' ').slice(0, 40);
    const out = [];
    for (const el of Array.from(document.querySelectorAll(SEL)).slice(0, 400)) {
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
      out.push({ tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', name: name(el), w: Math.round(r.width), h: Math.round(r.height), small: r.width < 24 || r.height < 24 });
    }
    return out.slice(0, 80);
  });
}

async function checkAssert(a) {
  try {
    if (a.type === 'url') return { ok: (await page.url()).includes(a.value), got: await page.url() };
    if (a.type === 'text') return { ok: (await page.getByText(a.value, { exact: false }).count()) > 0 };
    if (a.type === 'absent') return { ok: (await page.getByText(a.value, { exact: false }).count()) === 0 };
    if (a.type === 'selector') return { ok: (await page.locator(a.value).count()) > 0 };
  } catch (e) { return { ok: false, err: String(e.message || e) }; }
  return { ok: false };
}

async function visibleErrors() {
  return await page.evaluate(() => {
    // Gate EVERYTHING on an error-keyword match: a generic .toast / role=alert is also used
    // for success ("Channel created"), so presence alone is not an error signal. Better to
    // under-report a wordless error than to mark a successful task as failed.
    const rx = /\\b(error|failed|fail|went wrong|couldn'?t|cannot|can'?t|unable|denied|invalid|not found|try again|something went)\\b/i;
    const seen = new Set(); const out = [];
    const push = (el) => { const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return; const t = (el.innerText || '').trim().replace(/\\s+/g, ' '); if (!t || t.length > 140 || !rx.test(t) || seen.has(t)) return; seen.add(t); out.push(t.slice(0, 120)); };
    for (const el of document.querySelectorAll('[role=alert],[role=alertdialog],[aria-live=assertive],[data-sonner-toast],.toast,.Toastify__toast,.error,.alert,[aria-invalid=true]')) push(el);
    for (const el of document.querySelectorAll('p,span,div,li')) { if (el.childNodes.length && Array.from(el.childNodes).some((n) => n.nodeType === 3)) push(el); }
    return out.slice(0, 6);
  });
}

const result = { id: WALK.id, persona: WALK.persona || '', story: WALK.story || '', goal: WALK.goal || '', startedAt: null, outcome: 'completed', stuckAtStep: null, reason: '', steps: [], stepsPlanned: (WALK.steps || []).length, stepsRun: 0, clicks: 0, errorsSurfaced: [], success: [], deadEnd: null, elapsedMs: 0 };
const t0 = Date.now();

try {
  await page.setViewportSize(VIEWPORT);
  try { await page.emulateMedia({ colorScheme: WALK.theme || THEME }); } catch (e) {}
  await page.goto(abs(WALK.startUrl || WALK.startPath), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 700));

  const steps = WALK.steps || [];
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const budget = st.timeout || TIMEOUT;
    const rec = { i, action: st.action, target: st.target ?? null, note: st.note || '', ok: false, ms: 0, detail: '' };
    const s0 = Date.now();
    try {
      if (st.action === 'goto') { await page.goto(abs(st.value), { waitUntil: 'load' }); }
      else if (st.action === 'wait') { await new Promise((r) => setTimeout(r, +st.value || 600)); }
      else if (st.action === 'waitFor') { const loc = await pick(st.target, 'waitFor', budget); rec.detail = 'visible'; void loc; }
      else if (st.action === 'press' || st.action === 'key') { await page.keyboard.press(st.value); }
      else if (st.action === 'fill') { const loc = await pick(st.target, 'fill', budget); await loc.fill(String(st.value ?? '')); }
      else if (st.action === 'type') { const loc = await pick(st.target, 'type', budget); await loc.type(String(st.value ?? '')); }
      else if (st.action === 'hover') { const loc = await pick(st.target, 'hover', budget); await loc.hover(); }
      else if (st.action === 'click') { const loc = await pick(st.target, 'click', budget); await loc.click({ timeout: budget }); result.clicks++; }
      else if (st.action === 'assert') { const a = await checkAssert(typeof st.target === 'object' ? st.target : { type: 'text', value: st.value ?? st.target }); rec.ok = a.ok; rec.detail = a.ok ? 'present' : 'MISSING'; }
      else { throw new Error('unknown action: ' + st.action); }
      if (st.action !== 'assert') rec.ok = true;
      await new Promise((r) => setTimeout(r, st.settle || 500));
    } catch (e) {
      rec.ok = false; rec.detail = String(e.message || e).split('\\n')[0].slice(0, 200);
      rec.ms = Date.now() - s0;
      // screenshot the dead-end + capture what the user CAN see/click here
      try { rec.shot = await saveScreenshot(await page.screenshot(), 'walk-' + slug(WALK.id) + '-' + String(i).padStart(2, '0') + '-STUCK-' + slug(st.note || st.action) + '.png'); } catch (e2) {}
      result.steps.push(rec);
      result.stepsRun = i + 1;
      if (!st.optional) {
        result.outcome = 'stuck'; result.stuckAtStep = i;
        result.reason = 'Could not ' + st.action + (st.note ? ' ("' + st.note + '")' : '') + ': ' + rec.detail;
        result.deadEnd = { atStep: i, url: await page.url(), interactive: await interactives() };
        result.errorsSurfaced = await visibleErrors();
        throw { __stop: true };
      }
      continue; // optional step failed — keep going
    }
    rec.ms = Date.now() - s0;
    try { rec.shot = await saveScreenshot(await page.screenshot(), 'walk-' + slug(WALK.id) + '-' + String(i).padStart(2, '0') + '-' + slug(st.note || st.action) + '.png'); } catch (e) {}
    result.steps.push(rec);
    result.stepsRun = i + 1;
  }

  // success assertions (only when we didn't already get stuck)
  for (const a of (WALK.success || [])) { const r = await checkAssert(a); result.success.push({ ...a, ok: r.ok, got: r.got }); }
  result.errorsSurfaced = await visibleErrors();
  const successOk = result.success.every((s) => s.ok);
  if (!successOk) { result.outcome = 'failed'; result.reason = 'Goal not confirmed: ' + result.success.filter((s) => !s.ok).map((s) => s.type + ':' + s.value).join(', '); }
  else if (result.errorsSurfaced.length) { result.outcome = 'failed'; result.reason = 'Error surfaced: ' + result.errorsSurfaced[0]; }
  try { result.finalShot = await saveScreenshot(await page.screenshot(), 'walk-' + slug(WALK.id) + '-final.png'); } catch (e) {}
} catch (e) {
  if (!(e && e.__stop)) { result.outcome = 'error'; result.reason = 'harness: ' + String((e && e.message) || e).slice(0, 200); }
}
result.elapsedMs = Date.now() - t0;
console.log(JSON_MARK + JSON.stringify(result));
`

function buildScript(walk) {
  const vp = walk.viewport ? walk.viewport.split('x').map(Number) : [1440, 900]
  return [
    'const page = await browser.getPage("main");',
    `const WALK = ${JSON.stringify(walk)};`,
    `const BASE = ${JSON.stringify(BASE)};`,
    `const TIMEOUT = ${TIMEOUT};`,
    `const VIEWPORT = { width: ${vp[0]}, height: ${vp[1]} };`,
    `const THEME = ${JSON.stringify(A.theme || 'dark')};`,
    `const JSON_MARK = ${JSON.stringify('__SJ_JSON__')};`,
    RUNNER,
  ].join('\n')
}

// copy a dev-browser tmp screenshot into the run's shots dir, return a run-relative path
function adopt(tmpPath) {
  if (!tmpPath) return null
  const dest = path.join(SHOTS, path.basename(tmpPath))
  try { fs.copyFileSync(tmpPath, dest); return path.relative(RUN, dest) } catch (e) { return tmpPath }
}

const out = { base: BASE, ranAt: A.now || null, walks: [] }
const tally = { completed: 0, stuck: 0, failed: 0, error: 0 }

for (const walk of walks) {
  process.stderr.write(`▶ walk ${walk.id} (${walk.persona || '—'}): ${(walk.story || '').slice(0, 70)}\n`)
  const { stdout, stderr, status } = runDevBrowser(buildScript(walk), { timeoutMs: Math.max(60000, TIMEOUT * ((walk.steps || []).length + 4)) })
  const r = extractJSON(stdout)[0]
  if (!r) {
    out.walks.push({ id: walk.id, persona: walk.persona || '', story: walk.story || '', outcome: 'error', reason: `no result (status ${status})`, steps: [], stepsPlanned: (walk.steps || []).length, stepsRun: 0 })
    tally.error++
    process.stderr.write(`  ✗ ${walk.id}: harness error (status ${status})${stderr ? ' — ' + stderr.slice(0, 160) : ''}\n`)
    continue
  }
  // adopt screenshots into the run dir
  for (const s of (r.steps || [])) if (s.shot) s.shot = adopt(s.shot)
  if (r.finalShot) r.finalShot = adopt(r.finalShot)
  if (r.deadEnd && r.deadEnd.shot) r.deadEnd.shot = adopt(r.deadEnd.shot)
  out.walks.push(r)
  tally[r.outcome] = (tally[r.outcome] || 0) + 1
  const mark = r.outcome === 'completed' ? '✓' : r.outcome === 'stuck' ? '◼' : r.outcome === 'failed' ? '✗' : '!'
  process.stderr.write(`  ${mark} ${r.outcome} — ${r.stepsRun}/${r.stepsPlanned} steps, ${r.clicks} clicks${r.reason ? ' — ' + r.reason.slice(0, 120) : ''}\n`)
}

out.summary = tally
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
const total = out.walks.length
console.log(`walks: ${tally.completed}/${total} completed · ${tally.stuck} stuck · ${tally.failed} failed · ${tally.error} error -> ${OUT}`)
if (tally.stuck + tally.failed > 0) console.log(`  ${tally.stuck + tally.failed} task(s) a first-time user could NOT finish — see walks.json + screenshots/walks/`)
