# claude-seo

External SEO plugin for Claude Code by **AgriciDaniel** — MIT licensed. Source: [github.com/AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo).

> This is a **plugin**, not a single-file skill. It ships a multi-directory bundle (25 sub-skills + 18 sub-agents + Python deps + Playwright Chromium) and uses its own install script. It does not follow the "drop a `.md` into `~/.claude/skills/`" pattern that the other entries in this repo use, which is why it sits here as a reference doc rather than a vendored copy.

## What it does

A comprehensive SEO toolkit covering technical SEO, on-page analysis, content quality (E-E-A-T), schema markup, image optimization, sitemap architecture, Generative Engine Optimization (AI Overviews, ChatGPT, Perplexity), local SEO, semantic topic clustering, SEO drift monitoring, e-commerce SEO, and Google API integration (Search Console, PageSpeed Insights, CrUX, GA4).

## Install

### Option A — Plugin marketplace (recommended, Claude Code 1.0.33+)

Inside a Claude Code session, run:

```
/plugin marketplace add AgriciDaniel/claude-seo
/plugin install claude-seo@agricidaniel-seo
```

Claude Code handles updates from there.

### Option B — Manual install script

From a regular shell:

```bash
git clone --depth 1 https://github.com/AgriciDaniel/claude-seo.git
bash claude-seo/install.sh
```

What `install.sh` does:

1. Validates Python 3.10+ and `git` are present
2. Clones release tag `v1.9.9` (pinned, not `main`) into a temp dir
3. Copies `skills/seo/` and all `skills/seo-*/` directories into `~/.claude/skills/`
4. Copies `agents/*.md` (18 sub-agents) into `~/.claude/agents/`
5. Creates a venv at `~/.claude/skills/seo/.venv` and installs Python deps (`beautifulsoup4`, `lxml`, `playwright`, `requests`, `weasyprint`, `openpyxl`, `google-api-python-client`, etc.)
6. Downloads Chromium via Playwright (~260 MB) for visual analysis. Falls back to WebFetch if this fails.

Override the pinned tag with `CLAUDE_SEO_TAG=main bash install.sh` if you want bleeding edge.

### Windows

```powershell
git clone --depth 1 https://github.com/AgriciDaniel/claude-seo.git
powershell -ExecutionPolicy Bypass -File claude-seo\install.ps1
```

## Use

Invoke via `/seo` with a subcommand, or use any of the individual sub-skills directly:

```
/seo audit https://example.com               # full site audit with parallel subagent delegation
/seo page https://example.com/some-page      # deep single-page analysis
/seo schema https://example.com              # detect + validate Schema.org markup
/seo geo https://example.com                 # AI Overviews / GEO optimization
/seo local https://example.com               # local SEO + Google Business Profile
/seo google [command]                        # Search Console / PageSpeed / CrUX / GA4
/seo cluster "ccna training"                 # semantic topic clustering
/seo drift                                   # SEO regression detection across deploys
```

Sub-skills also auto-trigger from natural language. Examples that auto-fire:

| You say | Skill that triggers |
|---------|---------------------|
| "audit my site SEO" | `seo-audit` |
| "check Core Web Vitals" | `seo-technical` |
| "are my hreflang tags correct" | `seo-hreflang` |
| "generate a content brief for X" | `seo-content-brief` |
| "is my page ranking" | `seo-sxo` |
| "image optimization audit" | `seo-images` |

Full list of 25+ sub-skills surfaces in the skill picker once installed.

## What gets installed where

```
~/.claude/skills/seo/             # main orchestrator skill
~/.claude/skills/seo/.venv/       # Python deps (sandboxed)
~/.claude/skills/seo/schema/      # JSON-LD templates
~/.claude/skills/seo/hooks/       # IndexNow + deploy-hook scripts
~/.claude/skills/seo/pdf/         # PDF report assets
~/.claude/skills/seo-audit/       # sub-skill (one dir per sub-skill)
~/.claude/skills/seo-content/
~/.claude/skills/seo-geo/
~/.claude/skills/seo-google/
...                               # 25 total sub-skill directories
~/.claude/agents/seo-*.md         # 18 sub-agent definitions
```

Tag pinning lives in `~/.claude/skills/seo/.venv` and the upstream `plugin.json` — both pin to v1.9.9 by default. The install script's `CHANGELOG.md` is the source of truth for what changed between versions.

## Optional extensions

The plugin ships three optional extensions in `extensions/`:

| Extension | What it adds | Auth needed |
|-----------|--------------|-------------|
| `dataforseo` | Live SERP data, keyword volume, backlink data, competitor analysis | DataForSEO login + password |
| `firecrawl` | Full-site crawling, JS-rendered scraping, sitemap discovery | Firecrawl API key |
| `banana` | AI-generated SEO image assets (OG images, hero images, schema images) | Gemini API key via nanobanana-mcp |

These install alongside the core but only activate when their credentials are set. See upstream README for env var names.

## Google API integration

The `seo-google` sub-skill exposes Search Console, PageSpeed Insights, CrUX, Indexing API, and GA4. First run does OAuth in the browser. Credentials cache to `~/.config/claude-seo/google-creds.json`. Reuses the same `gcloud application-default credentials` pattern as the `google-ads-mcp` setup if already authenticated for that.

## Update

Plugin marketplace install — Claude Code handles updates automatically.

Manual install — re-run `install.sh`. The temp clone pulls the latest pinned tag.

## Uninstall

```bash
curl -fsSL https://github.com/AgriciDaniel/claude-seo/raw/main/uninstall.sh | bash
```

Removes the `~/.claude/skills/seo*` directories, `~/.claude/agents/seo-*.md` files, and the Python venv. Leaves Playwright Chromium intact since other tools may use it.

## License

MIT — by AgriciDaniel. See upstream LICENSE file. This reference doc is part of `personalClaudeSkills`; the actual plugin code is not vendored here.
