# Skills & MCP

My personal collection of [Claude Code](https://claude.com/claude-code) extensions — **skills** (one `.md` per skill, installed as skill directories) and **MCP servers** (local projects Claude Code connects to as tools). A mix of ones I built from scratch and external ones I've adopted into my workflow.

## Repo layout

Standalone skills sit at the repo root. **Bundles** — groups of related skills designed to work together — live in their own subfolder. **External plugins** — multi-directory packages with their own install scripts — are documented here as reference docs rather than vendored in. Each skill is stored as a single `.md` here for easy browsing, but installs as `~/.claude/skills/<name>/SKILL.md` — Claude Code's skill-directory convention (flat `.md` files in `~/.claude/skills/` are NOT discovered). Bundle folders are purely for repo organization. **MCP servers** are full local projects (not single files) and live under `mcp/`; each has its own README, build step, and `claude mcp add` registration.

```
.
├── artifact.md              # standalone skill
├── design-system.md         # standalone skill
├── growth-sprint.md         # standalone skill
├── mimic-design.md          # standalone skill
├── claude-skills-guide.md   # reference doc
├── claude-seo.md            # reference doc for external plugin
├── cpr/                     # bundle: compress + preserve + resume
│   ├── compress.md
│   ├── preserve.md
│   └── resume.md
└── mcp/                     # MCP servers (local projects, own install)
    └── gmail-organizer-mcp/ # multi-account Gmail organizer
```

## What's in here

| Skill | Bundle | Source | Requires | What it does |
|---|---|---|---|---|
| [`artifact`](artifact.md) | — | Built | None (macOS `open`) | Generates a self-contained HTML artifact (React + Tailwind, vanilla HTML/JS, SVG, or markdown), saves it to `~/Developer/artifacts/`, and auto-opens it in the browser. Closes the "artifacts gap" between Claude Code and the Claude app. |
| [`growth-sprint`](growth-sprint.md) | — | Built | git CLI; `code` + Obsidian vault optional | Audits a project's current state (git history, strategy docs, tech stack, explicit exclusions) via an Explore agent, pauses for confirmation, then drafts a daily-execution sprint plan — 30/60/90 days — with 5 concrete tasks per day, 6-phase structure, standing daily habits, weekly cadence, and realistic outcomes. Saves to `~/Desktop/` and mirrors to Obsidian vault. |
| [`design-system`](design-system.md) | — | Built | Playwright MCP (verification step) | Project-agnostic design-system application. Runs a guided interview (accent color, vibe, theme, motion intensity, exclusions), pauses for confirmation, then applies patterns to any site — builds new pages or retrofits existing ones, distributing glow colors algorithmically, applying chrome patterns, doing a voice pass on copy. Companion reference: `~/Desktop/Terminal-DS-Implementation-Guide.md`. |
| [`mimic-design`](mimic-design.md) | — | Built | **Playwright MCP** | Reverse-engineers a reference site's design from a URL: Playwright capture (desktop/mobile/scroll/hover states), CSSOM token extraction (palette, typography, easings, keyframes — with a curl fallback for CORS-blocked stylesheets), an honest design read, then a numbered steal/adapt/skip/do-better menu. Implements only the items the user picks — never edits files before the menu reply. |
| [`compress`](cpr/compress.md) | [`cpr`](cpr/) | External — [EliaAlberti/cpr](https://github.com/EliaAlberti/cpr-compress-preserve-resume) | None | Prepares preservation notes before `/compact` and saves the full session to searchable logs. |
| [`preserve`](cpr/preserve.md) | [`cpr`](cpr/) | External — [EliaAlberti/cpr](https://github.com/EliaAlberti/cpr-compress-preserve-resume) | None | Extracts the durable lessons from a session and writes them to `CLAUDE.md` so future conversations inherit them. |
| [`resume`](cpr/resume.md) | [`cpr`](cpr/) | External — [EliaAlberti/cpr](https://github.com/EliaAlberti/cpr-compress-preserve-resume) | None | Loads context at the start of a session from `CLAUDE.md` + recent session logs. |
| [`/seo` and 25 sub-skills](claude-seo.md) | — | External plugin — [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) | Python 3 + Playwright Chromium (its installer manages both) | Comprehensive SEO toolkit: full site audits, single-page analysis, technical SEO, schema markup, content quality (E-E-A-T), GEO (AI Overviews / ChatGPT / Perplexity), local SEO, image optimization, semantic topic clustering, SEO drift monitoring, Google API integration (Search Console / PageSpeed / CrUX / GA4). Ships 25 sub-skills + 18 sub-agents. See [`claude-seo.md`](claude-seo.md) for install + usage. |
| [`claude-skills-guide`](claude-skills-guide.md) | — | Reference doc | — | Not a skill — a guide explaining how Claude Code skills work and how to create your own. |

> **Source legend** — *Built*: I wrote this skill. *External*: adopted from someone else's single-file skill (lightly modified or used as-is) — credit linked. *External plugin*: a multi-file Claude Code plugin installed via its own script or the `/plugin marketplace` system, documented here as a reference rather than vendored. *Reference*: documentation, not a runnable skill.

## MCP servers

Unlike skills, these are full local projects Claude Code connects to over MCP. Each lives under `mcp/<name>/` with its own README, build, and `claude mcp add` step — they are **not** dropped into `~/.claude/skills/`.

| Server | Source | What it does |
|---|---|---|
| [`gmail-organizer-mcp`](mcp/gmail-organizer-mcp/) | Built | Lets Claude Code read and organize **multiple Gmail accounts** — Claude's built-in Gmail connector is single-account only. Account-aware tools for search, label, archive, mark-read, and server-side filters across every connected inbox (`account:"all"` fans out). Read + organize only — **no permanent mail delete** (labels/filters can be deleted, messages never). OAuth refresh tokens live in Bitwarden, never on disk. TypeScript, stdio, [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk). Full setup in its [README](mcp/gmail-organizer-mcp/README.md). |

## Install

Each skill installs as a directory: `~/.claude/skills/<name>/SKILL.md`. Claude Code picks them up automatically — no restart needed. (Legacy flat files still work as slash commands, but only in `~/.claude/commands/<name>.md` — a flat `.md` dropped into `~/.claude/skills/` is silently ignored.)

### Install everything

```bash
git clone https://github.com/pravinemani5545/skills-and-mcp.git
cd skills-and-mcp
for f in *.md cpr/*.md; do
  case "$(basename "$f")" in README.md|claude-skills-guide.md|claude-seo.md) continue;; esac
  name="$(basename "$f" .md)"
  mkdir -p ~/.claude/skills/"$name"
  cp "$f" ~/.claude/skills/"$name"/SKILL.md
done
```

### Install a single bundle

```bash
for f in cpr/*.md; do
  name="$(basename "$f" .md)"
  mkdir -p ~/.claude/skills/"$name"
  cp "$f" ~/.claude/skills/"$name"/SKILL.md
done
```

(The cpr files also work as legacy slash commands in `~/.claude/commands/` — that's where they live on my machine.)

### Install one skill

```bash
mkdir -p ~/.claude/skills/artifact
curl -o ~/.claude/skills/artifact/SKILL.md \
  https://raw.githubusercontent.com/pravinemani5545/skills-and-mcp/main/artifact.md
```

### Symlink instead (recommended for active development)

Edits in this repo take effect immediately:

```bash
for f in *.md cpr/*.md; do
  case "$(basename "$f")" in README.md|claude-skills-guide.md|claude-seo.md) continue;; esac
  name="$(basename "$f" .md)"
  mkdir -p ~/.claude/skills/"$name"
  ln -sf "$(pwd)/$f" ~/.claude/skills/"$name"/SKILL.md
done
```

### Install an external plugin (claude-seo)

`claude-seo` is a multi-file plugin and does **not** follow the single-file install pattern above. Use either of these:

```bash
# Recommended — from inside Claude Code (1.0.33+)
/plugin marketplace add AgriciDaniel/claude-seo
/plugin install claude-seo@agricidaniel-seo

# Or — manual install via the upstream script
git clone --depth 1 https://github.com/AgriciDaniel/claude-seo.git
bash claude-seo/install.sh
```

The manual script creates a Python venv at `~/.claude/skills/seo/.venv`, downloads Playwright Chromium (~260 MB), and writes 25 sub-skill directories + 18 agent files into `~/.claude/skills/` and `~/.claude/agents/`. See [`claude-seo.md`](claude-seo.md) for full details and usage.

## Use

Once installed, invoke a skill with a slash command:

```
/artifact pomodoro timer with start/pause
/growth-sprint aiopsforge 60
/mimic-design https://linear.app
/compress
/preserve
/resume
/seo audit https://example.com
/seo geo https://example.com
```

You can also chain skills in one prompt — the first loads its context, then the next runs:

```
/design-system /artifact pricing page for a SaaS tool
```

Plain-language requests work too — skills auto-trigger based on intent (e.g. saying "build me an artifact of X" fires `/artifact`).

## Skill format

Each `.md` file here is a self-contained skill, stored flat for browsing and installed as `<name>/SKILL.md`. Frontmatter declares the metadata; the body is the instructions Claude follows when invoked.

```markdown
---
name: my-skill
description: One-line summary. Claude uses this to decide when to auto-trigger.
---

# My Skill

Instructions for Claude here...
```

See [`claude-skills-guide.md`](claude-skills-guide.md) for the full creation guide.

## License

Personal use. External skills retain their original authors' rights — see the individual files for attribution where applicable.
