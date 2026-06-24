# Workflow-Tool Template

When the Workflow tool is available (multi-agent orchestration opted-in), use this script as a starting point. It encodes: fan-out finders → per-finding adversarial verify (pipelined, no barrier) → dedup + rank. Adapt the dimensions, the system map, and the schemas to the project.

Paste the system map (from Phase 0) into `SYSTEM_MAP`, pick the relevant `DIMENSIONS`, and run. For a fix pass, follow up with a second workflow (or inline batches) per `fix-protocol.md` — keep finding and fixing as separate, reviewable phases.

```javascript
export const meta = {
  name: 'project-audit',
  description: 'Fan-out bug finders, adversarially verify each finding, rank by severity',
  phases: [{ title: 'Find' }, { title: 'Verify' }, { title: 'Rank' }],
}

// --- paste your Phase-0 system map here ---
const SYSTEM_MAP = `
<entry points, end-to-end flow, external integrations, live schema/enums, shared libs>
`

// pick the relevant dimensions from references/finder-dimensions.md
const DIMENSIONS = [
  { key: 'logic',        prompt: 'business logic / correctness, branches, timezone/date math' },
  { key: 'silent',       prompt: 'error handling & SILENT failures, swallowed errors, missing retries' },
  { key: 'idempotency',  prompt: 'concurrency & idempotency: runs-twice, webhook retries, double-fulfillment, races' },
  { key: 'schema',       prompt: 'data integrity & schema drift: code enums/columns vs LIVE schema' },
  { key: 'external',     prompt: 'external API/SDK misuse: payload field paths, missing fields, rate limits' },
  { key: 'security',     prompt: 'authz/IDOR, forgeable tokens, missing signature checks, secret leakage' },
  { key: 'state',        prompt: 'state machine: stuck/dead-end states, terminal states still mutated, missing transitions' },
  { key: 'compliance',   prompt: 'domain compliance: messaging/calling hours, opt-out/consent, PII handling' },
  { key: 'money',        prompt: 'money & fulfillment: double-issue, issue-without-precondition, wrong recipient' },
  { key: 'ux',           prompt: 'frontend/admin correctness: stale cache vs server, sort/seen/unread that lies' },
]

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          file: { type: 'string' }, line: { type: 'number' },
          scenario: { type: 'string', description: 'the concrete sequence/input that triggers it' },
          severity: { type: 'string', enum: ['critical','high','medium','low'] },
          fix: { type: 'string' },
        },
        required: ['title','file','scenario','severity'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: {
    isReal: { type: 'boolean' },
    confidence: { type: 'string', enum: ['low','medium','high'] },
    evidence: { type: 'string' },
    corrected_severity: { type: 'string', enum: ['critical','high','medium','low'] },
  },
  required: ['isReal','evidence'],
}

const finder = (d) => `You are auditing a project. System map:\n${SYSTEM_MAP}\n
Hunt ONLY this dimension: ${d.prompt}.
Read the actual deployed code and live config. Report concrete findings with file:line and the
exact scenario that triggers each. Favor specificity over volume; skip anything you can't tie to a
real failure path. Return the FINDINGS schema.`

const refute = (f) => `Claimed bug: "${f.title}" at ${f.file}:${f.line}.
Scenario: ${f.scenario}
Re-read the ACTUAL code path yourself. Try to REFUTE this. Is the trigger reachable? Is there a
guard/default/try-catch already handling it? Does the cited code/field exist as described?
Default to isReal=false unless clearly convinced. Return the VERDICT schema.`

phase('Find')
const perDimension = await pipeline(
  DIMENSIONS,
  d => agent(finder(d), { label: `find:${d.key}`, phase: 'Find', schema: FINDINGS }),
  // verify each finding from this dimension as soon as the dimension returns (no barrier)
  (res, d) => parallel((res?.findings ?? []).map(f => () =>
    agent(refute(f), { label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT })
      .then(v => ({ ...f, verdict: v }))
  )),
)

phase('Rank')
const confirmed = perDimension.flat().filter(Boolean)
  .filter(f => f.verdict?.isReal)
  .map(f => ({ ...f, severity: f.verdict.corrected_severity ?? f.severity }))

// dedup by file+line (same root cause surfaced by multiple finders)
const seen = new Set(), deduped = []
for (const f of confirmed) {
  const k = `${f.file}:${f.line}`
  if (seen.has(k)) continue
  seen.add(k); deduped.push(f)
}
const order = { critical: 0, high: 1, medium: 2, low: 3 }
deduped.sort((a, b) => order[a.severity] - order[b.severity])

return { count: deduped.length, findings: deduped }
```

## Notes
- For Critical/High findings, swap the single `refute` verifier for a 2–3 verifier panel with distinct lenses (see `verification.md`) and keep on majority.
- For an unknown-size sweep, wrap the find phase in a loop-until-dry (keep spawning finders until K rounds surface nothing new) instead of a single pass.
- Keep **find** and **fix** as separate workflows so the user reviews the confirmed list before any code changes.
