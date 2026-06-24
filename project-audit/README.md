# project-audit

A Claude Code skill for **thorough, multi-agent project audits and bug fixing**.

It beats the two failure modes of a naive "find bugs" pass — **missing** bugs (one reader can't hold a whole system) and **hallucinating** bugs (plausible-but-wrong findings) — by:

1. **Fanning out** one finder agent per bug dimension (correctness, silent failures, idempotency/races, schema drift, external-API misuse, security, state machine, compliance, money/fulfillment, UX, config, docs drift).
2. **Adversarially verifying** every finding (independent skeptics prompted to *refute*; multi-lens panel for Critical/High) so only real bugs are reported.
3. **Ranking** by blast radius and **fixing in small, deployed, verified batches** — idempotency/money/security first — without breaking the live system.

Works on any stack: web apps, backends, edge functions, data pipelines, infra.

## Install

Clone into your Claude Code skills directory:

```bash
git clone https://github.com/pravinemani5545/project-audit-skill ~/.claude/skills/project-audit
```

Then invoke it by asking Claude Code to audit a project/workflow for bugs, or run `/project-audit`.

## Contents
- `SKILL.md` — the skill (phases 0–5: scope → find → verify → rank → fix → sync docs).
- `references/finder-dimensions.md` — the bug-dimension catalogue + severity rubric.
- `references/verification.md` — the adversarial verification protocol.
- `references/fix-protocol.md` — safe batched fixing, migration safety, deploy/verify.
- `references/workflow-template.md` — a ready-to-run Workflow-tool orchestration script.
