---
name: growth-sprint
description: Create a daily-execution growth sprint plan for a project — 60 days by default (30 or 90 also supported via args). Audits the project's current state first (git history, strategy docs, tech stack, explicit exclusions), pauses for confirmation, then drafts a phased plan with 5 priority tasks per day, standing daily habits, weekly cadence, realistic outcomes, and stack-respecting tool choices. Saves to ~/Desktop/<project>-<N>-Day-Sprint.md and mirrors to Obsidian vault. Use when the user asks to create a sprint, growth plan, execution roadmap, daily plan, or 30/60/90-day plan for any project.
---

# Growth Sprint Skill

Produce a daily-execution sprint plan for a project. This is NOT a generic "10 things to do" — it's an audit-first, phase-structured, daily-task-level plan grounded in the project's actual current state, stack, and explicit exclusions.

## Requirements

- **git CLI** — the audit phase reads `git log`, branch, and working-tree state.
- Optional: VS Code `code` CLI (auto-opens the finished plan) and an Obsidian vault at `~/obsidian/pravinemaniOS/` (mirror copy — skipped if absent).
- No MCP servers.

## Inputs (parse from `args`)

- **Project name** (required) — kebab-case slug (e.g., `aiopsforge`, `cisnet`). If user says "this project", default to the current working directory's basename.
- **Duration** (optional, default 60) — accept `30`, `60`, or `90`. If user says "two-month plan" → 60. "Quarter" → 90. "Month" → 30.
- **Project path** (optional, default cwd) — absolute path to project root.

If the user runs `/growth-sprint` with no args, ask ONE sharpening question: project name + duration. Don't ask more than one round.

## Reference template

Match density, structure, and tone of:
- `~/Desktop/AIOpsForge-10-Day-Sprint.md` (despite filename, it's 60 days — the canonical example)
- Mirrored at `~/obsidian/pravinemaniOS/AIOpsForge-60-Day-Sprint.md`

Read at least the first ~150 lines of one of these before drafting, to internalize voice + format.

## Steps

### Step 1 — Audit current state (MANDATORY before drafting)

Spawn an **Explore** agent (or parallel reads if scope is tight) covering:

- **Git state** — last 30 commits via `git log --oneline -30`, current branch, uncommitted changes
- **Project root** — `CLAUDE.md`, `.claude/CLAUDE.md`, `README.md` (operating constraints, brand rules, hard nos)
- **Strategy docs** — any `*.md` files matching `*playbook*`, `*roadmap*`, `*strategy*`, `*plan*` in project tree
- **Tech stack reality** — `package.json`, `vercel.json`, `pyproject.toml`, `Cargo.toml`, etc. — what's actually built with
- **Site / app surfaces** — top-level pages, what's live vs stub
- **Desktop strategy docs** — `~/Desktop/<project-name>*.md`
- **Research dumps** — `~/Developer/research/<project>*.md` for prior research
- **Obsidian vault knowledge** — `~/obsidian/pravinemaniOS/<project>*.md` (root) + `~/obsidian/pravinemaniOS/Areas/Work/Projects/<project>/`
- **Analytics / dashboard data** if the user exposes it (Plausible, GSC, etc.)

**Explicit-exclusions hunt** — search the strategy docs for any "NOT using X", "we don't do Y", "explicitly rejected", "skip", "❌". These are non-negotiable. List them prominently in the audit report.

### Step 2 — Report audit findings, PAUSE for confirmation

Output a tight audit report to the user with these subsections:

- **What's already built** (foundation in place)
- **What's missing** (gaps to fill)
- **Audience reality** (who the product serves, current scale, ~paying customers / subs / users)
- **Stack reality** (what they DO use — frontend, backend, hosting, analytics, email, payments, community)
- **Explicit exclusions** (tools / channels / tactics they've rejected — quote source if possible)

End the audit with: _"Pausing here. Confirm the audit is accurate, correct any misreads, and I'll draft the <N>-day sprint."_

Do NOT proceed to Step 3 without user confirmation. If the user says "go" / "proceed" / "looks good" / nods → continue.

### Step 3 — Draft the sprint

Once confirmed, write the plan to `~/Desktop/<ProjectName>-<N>-Day-Sprint.md`.

**Required structure** (in this order):

1. **Header block**:
   - Title: `# <ProjectName> — <N>-Day Launch Sprint`
   - Source: where this plan derives from (audit findings, playbook if exists)
   - **Stack note** — explicit list of what this plan uses + what it does NOT use (respect all exclusions from audit)
   - Cadence statement: "5 priority tasks per day, ~3-5 hrs/day commitment"
   - Rule: "finish today's 5 before starting tomorrow's"
   - **Standing daily habits** (kicks in from Day 8) — table format
   - **Standing weekly cadence** — Mon/Tue/Wed/etc. by day

2. **Phases** — divide duration into 6 phases of ~equal length:
   - **30-day sprint** → 6 phases of 5 days
   - **60-day sprint** → 6 phases of 10 days
   - **90-day sprint** → 6 phases of 15 days

   Typical phase themes (rename to fit project):
   - **Phase 1: Foundation** — measurement (analytics, SEO infra, identity), first tentpole content
   - **Phase 2: Content engine + first cycle** — establish weekly content rhythm, first long-form video / artifact
   - **Phase 3: Automation layer** — webhooks, cron jobs, member onboarding, lead funnel
   - **Phase 4: Distribution + scale** — programmatic SEO, directory listings, cross-promo trades
   - **Phase 5: Authority builds + launch prep** — original research, free tool, Product Hunt prep
   - **Phase 6: Launch + retrospective + planning** — major launch event, public 60-day retro, Q+1 planning

3. **Per-day structure** (every day, no skips):
   - `## Day N — <Theme> (≈X hrs)`
   - One-line goal
   - 5 numbered tasks. Each task MUST:
     - Be CONCRETE — name the specific tool/file/deliverable
     - Include tracked links / paths where applicable (`~/Developer/<project>/<file>`, `/api/<endpoint>`, etc.)
     - Avoid "work on X" — replace with "ship X to <path>" or "publish X with <metadata>"
   - `**Done when:**` — single verifiable success criterion

4. **Cumulative Outcome by Day N** section at the end with:
   - **Content shipped** (numbered list of artifacts)
   - **Infrastructure** (what's now live)
   - **Distribution** (channels active)
   - **Revenue + audience** with REALISTIC targets (under-promise; solo operator scale)

5. **Standing Habits Refresher** table — restates from header for end-of-doc reference

6. **Stack Choices: Using vs NOT Using** table — every row a tool category with one column "Using" and one column "NOT using" + reason. This is where exclusions are concretized.

7. **What This Sprint Doesn't Cover** — explicit deferrals to next sprint (paid ads, podcast, services productization, etc.) with reasoning

8. **If You Slip** section — rollover rules, energy-management note for heavy days

9. **Footer** — last-updated date, source pointers

### Step 4 — Realism guardrails

When drafting outcomes, REMEMBER:
- A solo operator outputs ~10-20% of what they'd ideally hope for. Plan accordingly.
- $9.99/mo communities: realistic 6-9% monthly churn; LTV ~$60-200
- Newsletter organic growth in saturated niches: 200-500 subs in 60 days without paid acquisition
- YouTube monetization (1k subs + 4k watch hours): minimum 8-14 months consistent posting
- Product Hunt for niche dev products: realistic rank top 10-25 in category, not #1 overall
- Cohort filling: 50-70% capacity is success at first attempt

Numbers that smell like hype ("10k newsletter subs in 60 days") are red flags. Cut them.

### Step 5 — Stack-respect (the hardest rule)

If the audit found "NOT using n8n", do NOT propose n8n workflows in Phase 3. Use Vercel cron, Cloudflare Workers, GitHub Actions, or whatever the user's actual automation surface is.

If the audit found "no emojis in UI", don't propose UI changes with emojis.

If the audit found "$9.99 founding price locked", don't propose raising to $14.99 in Phase 6 — propose raising the NEXT tier instead.

When in doubt, ASK rather than assume.

### Step 6 — Output + mirror

- Write canonical to `~/Desktop/<ProjectName>-<N>-Day-Sprint.md` (use exact project casing — "AIOpsForge" not "aiopsforge")
- If `~/obsidian/pravinemaniOS/` exists, also write to `~/obsidian/pravinemaniOS/<ProjectName>-<N>-Day-Sprint.md`
- Open in VS Code: `code <path>` (no extra messaging — just the open command)

End with a short summary to the user:
- File path saved to
- Total task count (= N × 5)
- Phase breakdown one-liner
- Any caveats discovered during drafting that the user should resolve before executing

## What this skill does NOT do

- Does not execute the plan (user does that themselves)
- Does not promise specific revenue numbers unless they fall out cleanly from the audit
- Does not invent tools the user isn't using
- Does not replace the project's main playbook — sprints are derived FROM the playbook
- Does not generate "growth hacks" or vague advice — every task is shippable in one work session

## When to skip the audit (rare)

Only when the user explicitly says: "skip audit", "I just did one", "use my prior findings". Otherwise audit always runs.

## Failure modes to avoid

- **Over-promising** — under-promise outcomes; honest beats hype for execution-driven users
- **Stack contamination** — never reintroduce excluded tools; double-check Phase 3 (automation) and Phase 7 (stack table) before saving
- **Generic content** — tasks must reference real files, real APIs, real platforms the user has. If audit didn't find them, ask.
- **Skipping Step 2 pause** — drafting before audit confirmation = wasted work if audit is wrong
- **Duplicate sprints** — if `<project>-<N>-Day-Sprint.md` already exists on Desktop, ask before overwriting

## Examples

User: `/growth-sprint`
Skill: "What project, and what duration (30 / 60 / 90 days)?"
User: "aiopsforge, 60 days"
Skill: [spawns audit] → reports findings → pauses → on confirmation, drafts to `~/Desktop/AIOpsForge-60-Day-Sprint.md`

User: `/growth-sprint cisnet 90`
Skill: [audits cisnet project, finds CISNET-Growth-Playbook.md, drafts 90-day sprint matching its structure]

User: `/growth-sprint sandbox-app 30`
Skill: [audits ~/Developer/projects/active/sandbox-app, drafts 30-day sprint at 5×30=150 tasks]
