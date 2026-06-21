export const meta = {
  name: 'sj-audit',
  description: 'Fan-out UX/UI audit: parallel analysts (areas x design lenses) -> adversarial verify -> synthesize/rank -> coverage critic. Returns {analyses, synthesis}.',
  phases: [
    { title: 'Analyze' },
    { title: 'Verify' },
    { title: 'Synthesize' },
    { title: 'Coverage' },
  ],
}

// ---- args (passed by the orchestrator after live exploration) ----
//   run         : run dir (string)               brief    : path to brief.md (string)
//   sourceRoot  : path to app source (string)     shots    : path to screenshots dir (string)
//   appName     : string                          lenses   : ["steve-jobs","nielsen",...]
//   fanout      : "area-all-lenses" | "area-x-lens"
//   areas       : [{ key, title, screens:[..], files:[..], focus }]   (discovered live)
//   personas    : [{ key, label }]
//   modules     : { adversarialVerify, coverage }
const a = (typeof args === 'object' && args) ? args : {}
const RUN = a.run || ''
const BRIEF = a.brief || `${RUN}/brief.md`
const SHOTS = a.shots || `${RUN}/screenshots`
const SRC = a.sourceRoot || ''
const APP = a.appName || 'the app'
const LENSES = Array.isArray(a.lenses) && a.lenses.length ? a.lenses : ['steve-jobs']
const FANOUT = a.fanout || 'area-all-lenses'
const AREAS = Array.isArray(a.areas) ? a.areas : []
const PERSONAS = Array.isArray(a.personas) && a.personas.length ? a.personas : [{ key: 'user', label: 'first-time user' }]
const MODS = a.modules || { adversarialVerify: true, coverage: true }

if (!AREAS.length) {
  log('No areas passed in args.areas — nothing to analyze. Discover surfaces live first, then pass them in.')
  return { analyses: [], synthesis: null, error: 'no-areas' }
}

const LENS_ENUM = ['steve-jobs', 'nielsen', 'dieter-rams', 'wcag']
const SEVS = ['P0', 'P1', 'P2', 'P3']
const CATS = ['clarity', 'hierarchy', 'copy', 'defaults', 'empty-state', 'error-state', 'a11y', 'responsive', 'consistency', 'delight', 'bug', 'flow']

const ANALYST_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['area', 'lensesApplied', 'summary', 'stories', 'findings', 'solutionIdeas'],
  properties: {
    area: { type: 'string' },
    lensesApplied: { type: 'array', items: { type: 'string', enum: LENS_ENUM }, minItems: 1 },
    summary: { type: 'string', description: '3-5 sentence verdict for a first-timer, voiced in the lens(es).' },
    stories: {
      type: 'array', minItems: 5, maxItems: 12,
      items: {
        type: 'object', additionalProperties: false,
        required: ['persona', 'story', 'firstRunMoment', 'friction', 'severity'],
        properties: {
          persona: { type: 'string' },
          story: { type: 'string', description: 'As a <persona>, I want <goal>, so that <benefit>.' },
          firstRunMoment: { type: 'string' },
          friction: { type: 'string' },
          severity: { type: 'string', enum: SEVS },
        },
      },
    },
    findings: {
      type: 'array', minItems: 5, maxItems: 16,
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'title', 'where', 'severity', 'category', 'lens', 'verdict', 'observation'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          where: { type: 'string', description: 'screen filename and/or code file:line' },
          severity: { type: 'string', enum: SEVS },
          category: { type: 'string', enum: CATS },
          lens: { type: 'string', enum: LENS_ENUM },
          principle: { type: 'string', description: "named principle/heuristic/criterion, or '-' for Jobs" },
          verdict: { type: 'string', description: 'one crisp line voiced in the lens' },
          observation: { type: 'string', description: 'specific; cite screen/code; separate real from mock' },
          isCodeBug: { type: 'boolean' },
        },
      },
    },
    solutionIdeas: {
      type: 'array', minItems: 3, maxItems: 10,
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'kind', 'addressesFindings', 'description', 'keyChanges'],
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: ['refine', 'bold'] },
          addressesFindings: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
          keyChanges: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['findingId', 'verdict', 'isReal', 'rationale'],
  properties: {
    findingId: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'uncertain'] },
    isReal: { type: 'boolean' },
    rationale: { type: 'string' },
    evidence: { type: 'string' },
    isMockArtifact: { type: 'boolean' },
    severityAdjustment: { type: 'string', enum: ['none', 'raise', 'lower'] },
    suggestedSeverity: { type: 'string', enum: SEVS },
  },
}

const SYNTH_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['executiveSummary', 'northStar', 'severityCounts', 'topIssues', 'quickWins', 'boldBets', 'storyThemes'],
  properties: {
    executiveSummary: { type: 'string' },
    northStar: { type: 'string' },
    severityCounts: { type: 'object', additionalProperties: false, properties: { P0: { type: 'integer' }, P1: { type: 'integer' }, P2: { type: 'integer' }, P3: { type: 'integer' } } },
    topIssues: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['rank', 'title', 'severity', 'area', 'why', 'recommendation', 'refineVsBold'],
        properties: {
          rank: { type: 'integer' },
          title: { type: 'string' },
          severity: { type: 'string', enum: SEVS },
          area: { type: 'string' },
          lenses: { type: 'array', items: { type: 'string' } },
          why: { type: 'string' },
          recommendation: { type: 'string' },
          refineVsBold: { type: 'string' },
          addressesFindingIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    quickWins: { type: 'array', items: { type: 'string' } },
    boldBets: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'description'], properties: { name: { type: 'string' }, description: { type: 'string' } } } },
    storyThemes: { type: 'array', items: { type: 'string' } },
  },
}

const COVERAGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['tested', 'missed'],
  properties: {
    tested: { type: 'array', items: { type: 'string' } },
    missed: { type: 'array', items: { type: 'string' }, description: 'routes/states/modalities not exercised' },
    notes: { type: 'string' },
  },
}

const lensList = (ls) => ls.join(', ')

function analystPrompt(area, lenses) {
  const screens = (area.screens || []).map((s) => `${SHOTS}/${s}`).join(', ')
  const files = (area.files || []).join(', ')
  return [
    `You are a senior product designer + UX writer doing a FIRST-TIME-USER audit of ${APP}, area: "${area.title}".`,
    `Apply ONLY these design lens(es): ${lensList(lenses)}. Tag every finding with the single lens it comes from.`,
    ``,
    `STEP 1: Read the shared brief at ${BRIEF} (product, journey, confirmed bugs, code map, the lens rubrics, personas). Apply the rubrics exactly.`,
    screens ? `STEP 2: View these screenshots with the Read tool (they are PNGs): ${screens}.` : `STEP 2: (No screenshots listed for this area — ground on the brief + code.)`,
    files ? `STEP 3: Read the relevant code to ground behavior/copy/states/a11y: ${files}. (If a path is a directory, list it and read the entry point + 2-4 key files.)` : ``,
    ``,
    `FOCUS for your area: ${area.focus || 'the full first-time experience of this surface.'}`,
    ``,
    `Personas: ${PERSONAS.map((p) => p.label).join(', ')}.`,
    `Now produce the structured output:`,
    `- Write LOTS of concrete first-time user stories across the personas, tied to real first-run moments.`,
    `- Findings must be specific and honest: cite the exact screen or code (where), separate real UI/UX problems from dev-mock fixture artifacts, severity P0=broken/blocking, P1=major friction, P2=polish, P3=nice-to-have. Each finding: its lens, the named principle/heuristic/criterion (or '-' for Jobs), and a crisp lens-voiced verdict. Set isCodeBug=true for any claimed source defect.`,
    `- solutionIdeas: >=1 BOLD reimagining and several REFINE-in-place fixes, described concretely enough to render as a mockup (layout, copy, color, components). Tie each to finding ids.`,
    `Be thorough; think in small details and big structure. Return ONLY the structured object.`,
  ].filter(Boolean).join('\n')
}

function verifyPrompt(area, f) {
  return [
    `You are a SKEPTIC verifying one UX-audit finding before it ships. Try hard to REFUTE it. Default to refuted if uncertain.`,
    `Finding (area "${area.title}", lens ${f.lens}, severity ${f.severity}):`,
    `  title: ${f.title}`,
    `  where: ${f.where}`,
    `  observation: ${f.observation}`,
    ``,
    `Check the grounding directly: read the cited code (under ${SRC}) at the exact file:line and/or view the cited screenshot under ${SHOTS}. Decide:`,
    `- Is this REAL product behavior, or a dev-mock/fixture/automation artifact? (set isMockArtifact)`,
    `- For an isCodeBug claim, confirm it exists at the cited file:line or refute it.`,
    `- Is the severity right? (severityAdjustment + suggestedSeverity)`,
    `Return ONLY the structured verdict. isReal=true only if the finding survives a genuine refutation attempt.`,
  ].join('\n')
}

// ---------------- Analyze (+ verify per area, pipelined) ----------------
phase('Analyze')

const tasks = []
for (const area of AREAS) {
  if (FANOUT === 'area-x-lens') {
    for (const lens of LENSES) tasks.push({ area, lenses: [lens] })
  } else {
    tasks.push({ area, lenses: LENSES })
  }
}

const retracted = []

const analyzed = await pipeline(
  tasks,
  // stage 1: analyze
  (t, _orig, i) => agent(analystPrompt(t.area, t.lenses), {
    label: `analyze:${t.area.key || i}${t.lenses.length === 1 ? ':' + t.lenses[0] : ''}`,
    phase: 'Analyze', schema: ANALYST_SCHEMA, effort: 'high',
  }),
  // stage 2: adversarially verify this area's findings (concurrently), filter out refuted
  async (analysis, t) => {
    if (!analysis) return null
    if (!MODS.adversarialVerify) return analysis
    const verdicts = await parallel((analysis.findings || []).map((f) => () =>
      agent(verifyPrompt(t.area, f), { label: `verify:${(f.id || 'f')}`, phase: 'Verify', schema: VERDICT_SCHEMA, effort: 'medium' })
        .then((v) => ({ f, v }))
        .catch(() => ({ f, v: null }))
    ))
    const kept = []
    for (const { f, v } of verdicts) {
      if (!v) { kept.push(f); continue } // verifier died -> keep, don't silently drop
      if (v.isReal === false || v.verdict === 'refuted' || v.isMockArtifact === true) {
        retracted.push({ title: f.title, why: (v.isMockArtifact ? 'Mock/automation artifact. ' : 'Refuted on verification. ') + (v.rationale || '') })
        continue
      }
      if (v.severityAdjustment === 'raise' && v.suggestedSeverity) f.severity = v.suggestedSeverity
      if (v.severityAdjustment === 'lower' && v.suggestedSeverity) f.severity = v.suggestedSeverity
      kept.push(f)
    }
    return { ...analysis, findings: kept }
  }
)

const analyses = analyzed.filter(Boolean)
log(`Analyzed ${analyses.length}/${tasks.length} (area x lens) units; verified findings; ${retracted.length} retracted.`)

// ---------------- Synthesize ----------------
phase('Synthesize')

// Compact the analyses for the synth prompt (drop verbose stories; keep findings + solutions).
const compact = analyses.map((an) => ({
  area: an.area,
  lensesApplied: an.lensesApplied,
  summary: an.summary,
  findings: (an.findings || []).map((f) => ({ id: f.id, title: f.title, severity: f.severity, category: f.category, lens: f.lens, principle: f.principle, where: f.where, verdict: f.verdict, observation: f.observation, isCodeBug: !!f.isCodeBug })),
  solutionIdeas: (an.solutionIdeas || []).map((s) => ({ name: s.name, kind: s.kind, addressesFindings: s.addressesFindings, description: s.description })),
}))

// Persona x severity story tally + a few high-severity stories, so synth can theme without the full corpus.
const storyTally = {}
const sampleStories = []
for (const an of analyses) for (const s of (an.stories || [])) {
  const k = `${s.persona}|${s.severity}`
  storyTally[k] = (storyTally[k] || 0) + 1
  if ((s.severity === 'P0' || s.severity === 'P1') && sampleStories.length < 40) sampleStories.push(`[${s.severity}/${s.persona}] ${s.story} — ${s.friction}`)
}

const synthPrompt = [
  `You are the lead designer synthesizing a first-time-user audit of ${APP} across ${analyses.length} area/lens analyses.`,
  `Lenses in play: ${lensList(LENSES)}. A finding flagged by MULTIPLE lenses should rank higher.`,
  ``,
  `Per-area findings + solution ideas (JSON):`,
  '```json',
  JSON.stringify(compact),
  '```',
  `Story tally (persona|severity -> count): ${JSON.stringify(storyTally)}`,
  `Sample high-severity stories:\n- ${sampleStories.join('\n- ')}`,
  ``,
  `Produce the synthesis:`,
  `- executiveSummary (2-3 paragraphs on the first-run experience overall) and northStar (the single highest-leverage reframing).`,
  `- severityCounts across ALL findings.`,
  `- topIssues: DEDUPE across areas/lenses and RANK by first-run impact (frequency x severity x how-early-encountered). For each: rank, title, severity, area, lenses[] that flagged it, why, the concrete recommendation, a one-line refineVsBold, and addressesFindingIds.`,
  `- quickWins (high-impact/low-effort) and boldBets (bigger reimaginings) and storyThemes.`,
  `Return ONLY the structured object.`,
].join('\n')

const synthesis = await agent(synthPrompt, { label: 'synthesize', phase: 'Synthesize', schema: SYNTH_SCHEMA, effort: 'high' })

// Attach retractions deterministically (don't rely on the model to remember them).
if (synthesis && retracted.length) synthesis.retracted = retracted

// ---------------- Coverage critic ----------------
if (MODS.coverage && synthesis) {
  phase('Coverage')
  const testedList = AREAS.map((ar) => `${ar.title}: ${(ar.screens || []).join(', ')}`).join('\n')
  const covPrompt = [
    `You are a completeness critic for a first-time-user audit of ${APP}.`,
    `Read the brief at ${BRIEF} and the code under ${SRC}.`,
    `These areas/screens WERE exercised:`,
    testedList,
    ``,
    `Identify what was MISSED — routes, components, or states not exercised: empty / loading / error / overflow / long-content / i18n / RTL / offline / permission-denied states, secondary flows, and any surface in the code that has no screenshot. Be concrete (name the route/component/state). Return ONLY the structured object.`,
  ].join('\n')
  const coverage = await agent(covPrompt, { label: 'coverage-critic', phase: 'Coverage', schema: COVERAGE_SCHEMA, effort: 'medium' })
  if (coverage) synthesis.coverage = coverage
}

return { analyses, synthesis }
