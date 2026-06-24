---
name: project-audit
description: Use when the user wants a thorough/exhaustive bug audit of a project, codebase, or end-to-end workflow — phrasings like "audit my entire workflow", "find all the bugs", "be extensive, don't miss the most minor bug", pre-go-live hardening, "spawn subagents to find bugs", or when they want the findings actually fixed afterward. Spawns parallel finder agents across many bug dimensions, adversarially verifies every finding to kill false positives, ranks by severity, then fixes in small verified+deployed batches and updates docs. Works on any stack (web app, backend, edge functions, data pipeline, infra).
---

# Project Audit & Bug Fix

A disciplined, multi-agent audit that finds real bugs across an entire system, proves each one is real before reporting it, and (when asked) fixes them safely in deployable batches without introducing regressions.

The failure mode of a naive "find bugs" pass is twofold: it **misses** bugs (one reader can't hold a whole system in context) and it **hallucinates** bugs (plausible-but-wrong findings that waste the user's trust). This skill is built to beat both: **fan out** to find, **adversarially verify** to filter, **batch + deploy + verify** to fix.

## When to use
- "Audit my whole workflow / pipeline / app for bugs." / "Find every bug, even minor ones."
- Pre-launch or pre-go-live hardening of a system that touches money, messaging, auth, or external APIs.
- After a silent production failure ("this should never happen again") — find every other place the same class of bug hides.
- Any "spawn multiple subagents to look for bugs" request.

## Core principles
1. **Fan out to find, don't read serially.** One agent per dimension, run in parallel. Each agent is blind to the others — that's the point; overlap is cheap, blind spots are expensive.
2. **Every finding is guilty until proven real.** A finding that isn't adversarially verified does not get reported. Default to "not a bug" under uncertainty.
3. **Severity is about blast radius, not effort.** Money loss, data corruption, compliance/legal, silent failures, and security rank above cosmetics — regardless of how easy they are to fix.
4. **Fix in small verified batches.** Group related fixes, apply, build/typecheck, deploy, and confirm — never one giant untested change. Idempotency and money bugs first.
5. **Trace the real runtime, not the docs.** Read the deployed code and live config (DB schema, cron schedules, external-service settings). Docs drift; the running system is the truth.
6. **No silent scope caps.** If you bound coverage (top-N findings, sampled files), say so explicitly.

## Workflow

### Phase 0 — Scope the system (do this first, inline)
Build the work-list before fanning out. Identify:
- **Entry points & surfaces:** HTTP routes, webhooks, cron jobs, queues, CLI, UI actions.
- **The end-to-end flow(s):** trace one full path (e.g. lead → SMS → call → hand-off → reward) and note every state transition and side effect.
- **External integrations:** every third-party API/SDK (payments, telephony, email, LLM, auth) — these are where misuse and silent failures cluster.
- **Stateful stores:** DB schema + enums + triggers, plus any state machine. **Read the LIVE schema/config**, not just checked-in migrations — drift between them is itself a finding.
- **Shared code:** libs bundled into many entry points (a bug there is N bugs).

Produce a short system map. This defines the finder dimensions and the verification targets. See `references/finder-dimensions.md` for the full dimension catalogue.

### Phase 1 — Fan-out find (parallel finders)
Spawn one agent per relevant dimension from `references/finder-dimensions.md` (typically 8–12). Each finder gets: the system map, its single dimension, and a strict structured-output contract. Tell each finder to report **file:line, the concrete failure scenario, severity, and a proposed fix** — and to skip anything it isn't fairly sure about (verification comes next; finders should favor specificity over volume).

If using the **Workflow tool**, this is a `pipeline()` (find → verify per finding, no barrier). If using the **Agent tool**, launch all finders in one message (parallel), then collect.

### Phase 2 — Adversarial verify (kill false positives)
For each candidate finding, spawn an independent skeptic whose job is to **refute** it: re-read the actual code path and decide whether the bug truly fires. Prompt the verifier to default to "not a real bug" if uncertain. For high-stakes findings (money, security, data loss), use 2–3 verifiers with **distinct lenses** (correctness, does-it-actually-reproduce, security) and keep the finding only on a majority. Drop everything that doesn't survive. See `references/verification.md`.

### Phase 3 — Dedup, rank, report
Merge duplicates (same root cause surfaced by multiple finders), assign final severity (Critical / High / Medium / Low — criteria in `references/finder-dimensions.md`), and present a tight list: each confirmed finding with its file:line, the failure scenario, blast radius, and the fix. Lead with Criticals. State coverage honestly (dimensions run, anything skipped).

### Phase 4 — Fix in verified batches (only if the user wants fixes)
Group findings into small, coherent batches (by subsystem or by deploy unit). For each batch:
1. Apply the edits.
2. **Verify locally:** typecheck/build/lint/tests as available.
3. **Deploy** the affected unit (function, service, migration) if this is a live system.
4. **Confirm** the change took (re-read live config, run a smoke check).
5. Commit with a message that explains the *why* and the failure it prevents.

Order: **idempotency + money + data-corruption + security first**, then silent-failure guards, then correctness, then UX/cosmetic. Apply DB migrations against live only after confirming every referenced column/enum exists (a trigger or function referencing a missing column breaks every write). See `references/fix-protocol.md`.

### Phase 5 — Sync docs & close the loop
Update the system-design/architecture/build docs so they match the now-fixed reality (stale docs are how the next bug gets written). Optionally add a regression test or a monitor for any Critical that slipped to production.

## Output discipline
- Be specific: `path/file.ts:123` + the exact scenario that triggers it, never "there may be issues with error handling."
- Separate **confirmed** from **possible/needs-human-judgment**.
- When you fix, report what was deployed and verified vs. what's committed-but-pending.

## Reference files
- `references/finder-dimensions.md` — the full catalogue of bug dimensions + severity rubric. Load before Phase 1.
- `references/verification.md` — the adversarial verification protocol. Load before Phase 2.
- `references/fix-protocol.md` — safe batched fixing, migration safety, deploy/verify. Load before Phase 4.
- `references/workflow-template.md` — a ready-to-run Workflow-tool script (find → verify → rank) you can adapt when orchestration is available.
