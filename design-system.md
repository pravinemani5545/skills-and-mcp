---
name: design-system
description: Project-agnostic design-system application skill. Runs a guided interview (accent color, vibe, theme, motion intensity, exclusions) before applying patterns to any website. Draws from Terminal DS + general design knowledge — not locked to one preset. Builds new pages or audits existing ones, distributing glow colors algorithmically, applying chrome patterns, and outputting code that matches the operator's stack. Use when the user asks to "make my site look better", "apply a design system", "redesign this page", or "audit my UI."
---

# Design System Skill

Apply a high-fidelity design system to any project. Not locked to Terminal DS — that's just the default preset. The skill runs a guided interview first, picks the right starting point, then executes.

## Requirements

- **Playwright MCP** — powers the visual verification loop (`browser_take_screenshot`, `browser_resize` to 375px). The interview and build steps work without it; verification gets skipped.
- The target project's own dev server (verification screenshots a locally served page).

## Reference materials

Always read these first:
- `~/Desktop/Terminal-DS-Implementation-Guide.md` — full pattern library + tokens + voice rules (sectioned for picking)
- `~/.claude/skills/terminal-design/SKILL.md` — Anthropic's canonical Terminal DS skill (non-negotiables)
- `~/.claude/skills/terminal-design/colors_and_type.css` — the drop-in tokens file

If those don't exist, fall back to general design knowledge but tell the user.

## Step 1 — Guided interview (always run unless user provides full spec)

Ask these in ONE message with `AskUserQuestion`. Don't ping-pong. If the user already specified some answers in their prompt, skip those questions.

### Required answers

1. **Accent color** — what's the brand's primary accent?
   - Terminal green `#00FF41` (default — Terminal DS preset)
   - Electric blue `#4488ff`
   - Magenta `#e55aff`
   - Amber `#FFB800`
   - Custom hex (let them type)

2. **Vibe / aesthetic** — what should this feel like?
   - **Terminal / operator** — dark, sharp corners, monospace chrome, one accent (Terminal DS — default)
   - **Cyber / brutalist** — high contrast, aggressive typography, neon accents, glitch energy
   - **Minimal / editorial** — light theme, serif headlines, generous whitespace, soft greys
   - **Luxury / dark editorial** — black backgrounds, gold/cream accents, serif display
   - **Playful / soft** — warm colors, friendly type, rounded edges (this BREAKS Terminal DS rules — confirm with user)
   - **Match an existing brand** — let them name one to draw inspiration from

3. **Theme mode** — dark-first, light-first, or system-toggleable?

4. **Motion intensity** — how much animation?
   - **None** — accessibility-first, only respect prefers-reduced-motion
   - **Subtle** — entrance fade-ups + hover state transitions only (Terminal DS default)
   - **Moderate** — adds live-feed widgets, typing cursors, status pulses
   - **Heavy** — adds parallax, scroll-triggered reveals, complex sequences (use sparingly)

5. **Exclusions** — anything the user has explicitly rejected from past work?
   - Common: "no emojis", "no rounded corners", "no n8n/Make tooling", "no cyan/teal", "no gradients"
   - Ask user OR scan project for `CLAUDE.md` + memory entries for explicit exclusions

### Optional context to capture

- **Target stack** — Pure HTML/CSS, React, Vue, Astro, Next.js, etc. Affects how component patterns get translated.
- **Existing palette** — if user has brand colors they MUST keep
- **Audience tone** — operator/engineer, creator/marketer, executive/B2B, consumer
- **Reference site** — if user can point to one they admire ("make it feel like vercel.com")

## Step 2 — Pause for confirmation

Print the captured spec back to the user in a small table. Wait for confirmation or corrections before generating code. Don't skip this pause — picking wrong vibe is the highest-cost mistake.

## Step 3 — Generate the implementation

### Path A: New project / page from scratch

1. Build `tokens.css` based on chosen vibe + accent. For Terminal DS, copy `~/.claude/skills/terminal-design/colors_and_type.css`. For other vibes, adjust the token names + values but keep the structure (color tiers, spacing scale, motion easing).
2. Build the page skeleton using patterns from the Implementation Guide §4–6. Pick patterns appropriate to the content type:
   - Marketing site → hero split layout + stats strip + feature grid + final CTA
   - Product UI → topbar + sidebar + main content + status bar
   - Documentation → 2-col grid (nav + body) + section header pattern
3. Write to the user's target path. Default to `~/Developer/projects/active/<project>/index.html` if unspecified.
4. Open in browser via `open <url>` after spinning up a local server.

### Path B: Audit + retrofit existing site

1. Read the user's existing HTML/CSS files.
2. Run audit:
   - `grep` for `border-radius: [1-9]` (rounded corners)
   - `grep` for Title Case marketing headlines
   - `grep` for emoji unicode ranges in HTML content
   - `grep` for `linear-gradient` on non-text elements
   - Check for macOS-colored terminal chrome (`#ff5f57|#ffbd2e|#28c840`)
   - Check fonts loaded — any that aren't Space Grotesk / IBM Plex Sans / JetBrains Mono?
3. Report findings with file paths + line numbers.
4. Propose migration plan in order: tokens → typography → buttons → cards → hero → voice pass.
5. Execute via Edits if user confirms. Don't batch all migrations into one massive Edit — do them per component for review.

## Step 4 — Glow distribution (feature grids)

When applying to a feature/card grid:

1. Count cards + identify span widths.
2. Build adjacency graph (horizontal + vertical neighbors).
3. Pick 4–5 colors from the palette. **Skip cyan/teal** unless explicitly chosen by user.
4. Run the algorithm in Implementation Guide §7 to assign colors.
5. Verify NO adjacent same-color or same-family (e.g., dark blue + light blue counts as same family).
6. Apply via per-card CSS custom properties:
   ```css
   .card:nth-child(N) {
     --card-accent: <hex>;
     --card-glow: rgba(..., 0.06);
     --card-shadow: rgba(..., 0.12);
   }
   ```

## Step 5 — Voice pass

After visual changes ship, walk through every copy file and apply:
- Sentence case for body/headlines/buttons
- UPPERCASE mono for all UI chrome (labels, badges, status, nav)
- Strip exclamation marks
- Strip "we / our" phrasing if operator-aesthetic chosen
- Replace generic CTAs ("Click here") with verb-specific ones
- Numbers always numeric ("3 agents" not "three")

## Step 6 — Verification

Before declaring done:

1. Take screenshot via Playwright (load `mcp__playwright__browser_take_screenshot`)
2. Show user side-by-side: before / after
3. Run `validator.schema.org` (if user has SEO concerns) against any JSON-LD
4. Confirm all `prefers-reduced-motion` rules in place
5. Test mobile (resize browser to 375px width via `mcp__playwright__browser_resize`)
6. Report what was changed + what was preserved

## When NOT to use this skill

- User wants a single CSS fix (use Edit directly)
- User wants something OUTSIDE these patterns (e.g., 3D scenes, complex SVG animations, illustration work)
- User wants to add EVERY pattern from the Implementation Guide regardless of context (be selective — quality over inventory)

## When to push back

- If user picks "Playful / soft" vibe AND a code/operator audience: push back. Mismatch.
- If user wants emojis everywhere AND Terminal vibe: push back. Conflicts with non-negotiables.
- If user wants "all 8 unique card preview patterns" in a single grid of 6 cards: push back. Pick the best 6 — uniqueness across the grid matters more than using every pattern.

## Outputs to save

After running, always:
1. Commit changes to a feature branch (or worktree if background session)
2. Save a session log entry with: which interview answers were given, which patterns were applied, which files were modified
3. If new patterns were invented during the work, append them to `~/Desktop/Terminal-DS-Implementation-Guide.md` under a new section

## Examples

### Example 1: User asks for new landing page

User: `/design-system new landing for my SaaS`
Skill: [runs Step 1 interview → user picks blue accent + minimal vibe + dark theme + subtle motion] → pauses → on confirm, builds tokens.css + index.html at user's project path → opens in browser → done.

### Example 2: User asks to retrofit existing site

User: "Apply Terminal DS to my existing portfolio site at ~/Developer/projects/portfolio/"
Skill: [runs audit on existing files → finds 23 violations (rounded buttons, emojis in nav, decorative gradient on hero, wrong fonts) → reports findings → proposes migration plan → executes per-component after confirmation].

### Example 3: User has narrow scope

User: "Just redesign my pricing page using the design system you used on AOF"
Skill: [skips interview since AOF preset implied → reads existing pricing page → applies tokens + glow distribution + per-tier preview pattern → updates content to sentence case + uppercase mono labels → ships].

## Failure modes to avoid

- **Skipping the interview** — leads to wrong vibe, expensive rework
- **Applying every pattern from the guide** — quality > completeness
- **Ignoring user's explicit exclusions** — re-introducing tools they've rejected (n8n, cyan, emojis) breaks trust
- **Auto-merging without user OK** — always pause before commit on substantial visual changes
- **Forgetting the voice pass** — visual upgrade without copy upgrade looks half-done
