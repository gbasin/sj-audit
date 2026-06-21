// Tiny helper: run a script in `dev-browser` (the QuickJS-sandboxed Playwright CLI) from Node,
// and pull a JSON result back out via stdout markers. Used by the browser-driving modules.
//
// dev-browser scripts can't access the host fs/network/argv, so the pattern is:
//   - we build a complete dev-browser script string (with the URL/params baked in)
//   - the script console.log's `__SJ_JSON__<json>` (and/or `__SJ_SHOT__<path>`)
//   - we spawn dev-browser, feed the script on stdin, and parse the marker lines

import { spawnSync } from 'node:child_process'

export const JSON_MARK = '__SJ_JSON__'
export const SHOT_MARK = '__SJ_SHOT__'

export function runDevBrowser(script, { timeoutMs = 120000 } = {}) {
  const res = spawnSync('dev-browser', [], { input: script, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 })
  if (res.error) throw new Error(`dev-browser failed to run: ${res.error.message} (is it on PATH?)`)
  const stdout = res.stdout || ''
  const stderr = res.stderr || ''
  return { stdout, stderr, status: res.status }
}

export function extractJSON(stdout) {
  const out = []
  for (const line of stdout.split('\n')) {
    const i = line.indexOf(JSON_MARK)
    if (i >= 0) { try { out.push(JSON.parse(line.slice(i + JSON_MARK.length))) } catch (e) { /* ignore */ } }
  }
  return out
}

export function extractShots(stdout) {
  const out = []
  for (const line of stdout.split('\n')) {
    const i = line.indexOf(SHOT_MARK)
    if (i >= 0) out.push(line.slice(i + SHOT_MARK.length).trim())
  }
  return out
}

// Build a dev-browser script that navigates to `url`, runs optional `setup` lines, then
// evaluates `evalFnSource` (a string: an arrow/function expression) in the page and prints JSON.
export function buildEvalScript({ url, evalFnSource, setup = '', viewport = null, colorScheme = null, waitMs = 700, waitUntil = 'load' }) {
  const vp = viewport ? `await page.setViewportSize(${JSON.stringify(viewport)});` : ''
  const cs = colorScheme ? `try{ await page.emulateMedia({ colorScheme: ${JSON.stringify(colorScheme)} }); }catch(e){}` : ''
  return `
const page = await browser.getPage("main");
${cs}
${vp}
await page.goto(${JSON.stringify(url)}, { waitUntil: ${JSON.stringify(waitUntil)} });
await new Promise(r=>setTimeout(r, ${waitMs}));
${setup}
const __r = await page.evaluate(${evalFnSource});
console.log(${JSON.stringify(JSON_MARK)} + JSON.stringify(__r));
`
}
