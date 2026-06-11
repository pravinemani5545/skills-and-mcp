---
name: mimic-design
description: Use when the user provides a URL and wants to study, mimic, borrow, or improve on that site's design — "make my site look/feel like X", "steal this design", "recreate this animation", "why does this site feel premium", "copy this hero/nav/landing style". Not for SEO audits (seo-*), website copy critique (audit-website), or applying an already-chosen design system (design-system).
---

# Mimic Design

## Overview

Reverse-engineer a reference site's design DNA from a URL: capture it visually (Playwright screenshots), measure it precisely (computed styles + CSSOM extraction), analyze what makes it work and where it's weak, present an itemized suggestion menu, then implement **only what the user picks**.

**Core principle: screenshots tell you how it feels; the CSSOM tells you exactly how it's built.** Judge from pixels, implement from measured values. Never eyeball a color, easing, or letter-spacing from a screenshot — extract it.

## Requirements

- **Playwright MCP** (required) — navigation, resizing, screenshots, hover states, and the CSSOM extraction all run through it. Install if missing: `claude mcp add -s user playwright -- npx @playwright/mcp@latest`.
- **curl** (macOS built-in) — fallback fetch for CORS-blocked stylesheets in Phase 2.

## The Menu Gate (iron rule)

NEVER change any file before the user has chosen from the Phase 4 menu. Present menu → STOP the turn → wait for picks.

No exceptions:
- Not "quick wins" or "the obvious improvements"
- Not "just setting up CSS variables to prepare"
- Not because the user sounded enthusiastic — "make my site feel like X" authorizes the *study*, not the edits
- Upfront scoping questions ("keep your brand color?") do NOT replace the menu

## Ethics of mimicry

Patterns, tokens, and techniques are fair game; identity is not.
- Never download, hotlink, or trace logos, illustrations, photos, mascots, or icon sets from the reference
- Never copy text content
- Commercial fonts: don't copy font files; suggest licensed/free near-equivalents (Inter ≈ SF Pro, Geist ≈ Söhne, JetBrains Mono ≈ Berkeley Mono)
- Target: "informed by", never "mistaken for"

## Phase 1 — Capture (Playwright MCP)

Save everything to a study dir: `~/Developer/sandbox/design-studies/<domain>-<YYYY-MM-DD>/`.

1. `browser_navigate` to the URL. Dismiss cookie banners (click via `browser_snapshot` refs) before any screenshot.
2. Desktop: `browser_resize` 1440×900 → screenshot above-fold, then `fullPage: true`.
3. Mobile: `browser_resize` 390×844 → full-page screenshot. Desktop-only mimicry breaks responsive — always capture mobile.
4. Scroll states: `browser_evaluate` `window.scrollTo(0, document.body.scrollHeight * f)` for f = 0.25/0.5/0.75, brief `browser_wait_for`, screenshot each — captures scroll-triggered animation end-states and lazy-loaded sections.
5. Interaction states: hover the primary CTA, a nav item, and one card (`browser_hover`) → screenshot each.
6. **Read every screenshot file** — actually look at them. The analysis in Phase 3 must come from viewing, not from the DOM.

**Screenshot timeout pitfall (hit live on linear.app):** sites with infinite animations / WebGL heroes never "settle", so `browser_take_screenshot` times out even after freezing CSS. Remedy chain:
1. Freeze first: `browser_evaluate` → `document.head.insertAdjacentHTML('beforeend','<style>*,*::before,*::after{animation-play-state:paused!important;transition:none!important}</style>')` and pause `<video>` elements.
2. Still timing out → screenshot individual sections by element (`target` from snapshot) instead of full page.
3. Still failing → proceed with `browser_snapshot` (accessibility tree) + Phase 2 data and tell the user screenshots were blocked; don't burn the session on it.

If the site bot-blocks Playwright entirely: fall back to `curl` for source/CSS and ask the user for screenshots.

## Phase 2 — Extract design DNA

Run this validated script via `browser_evaluate` (pass `filename` to save large output to the study dir). It returns measured tokens: `:root` CSS variables, usage-ranked palette/radii/shadows/transitions, per-selector typography, loaded fonts, container widths, keyframes (deduped by name family), animation-library detection, and `blockedSheets`.

```js
() => {
  const cap = (s, n) => s && s.length > n ? s.slice(0, n) + '…' : s;
  const out = { url: location.href, viewport: innerWidth + 'x' + innerHeight };
  out.cssVars = {}; out.blockedSheets = [];
  const kfFamilies = {};
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { if (sheet.href) out.blockedSheets.push(sheet.href); continue; }
    if (!rules) continue;
    const walk = (rs) => {
      for (const r of rs) {
        if (r.selectorText && /(^|,)\s*(:root|html)\s*(,|$)/.test(r.selectorText)) {
          for (const p of r.style) if (p.startsWith('--')) out.cssVars[p] = r.style.getPropertyValue(p).trim();
        } else if (r instanceof CSSKeyframesRule) {
          const fam = r.name.replace(/\d+/g, '#');           // dedup generated families like grid-dot-0-3-upDown
          if (!kfFamilies[fam]) kfFamilies[fam] = { example: r.name, count: 0, css: cap(r.cssText, 600) };
          kfFamilies[fam].count++;
        } else if (r.cssRules) { try { walk(r.cssRules); } catch {} }
      }
    };
    try { walk(rules); } catch {}
  }
  out.keyframes = Object.values(kfFamilies).slice(0, 20);
  const els = [...document.querySelectorAll('body *')].filter(el => {
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return r && r.width > 4 && r.height > 4;
  }).slice(0, 1500);
  const tally = {}; const transTally = {};
  const add = (k, v) => { if (!v) return; const key = k + '|' + v; tally[key] = (tally[key] || 0) + 1; };
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') add('bg', cs.backgroundColor);
    add('text', cs.color);
    if (cs.borderTopWidth !== '0px') add('border', cs.borderTopColor);
    if (cs.borderRadius !== '0px') add('radius', cs.borderRadius);
    if (cs.boxShadow !== 'none') add('shadow', cap(cs.boxShadow, 120));
    if (cs.transitionDuration !== '0s') {
      const t = cs.transitionProperty + ' | ' + cs.transitionDuration + ' | ' + cs.transitionTimingFunction;
      transTally[t] = (transTally[t] || 0) + 1;
    }
  }
  const top = (prefix, n) => Object.entries(tally).filter(([k]) => k.startsWith(prefix + '|'))
    .sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => k.split('|')[1] + ' ×' + c);
  out.palette = { backgrounds: top('bg', 10), text: top('text', 8), borders: top('border', 6) };
  out.radii = top('radius', 6);
  out.shadows = top('shadow', 5);
  out.transitions = Object.entries(transTally).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, c]) => cap(t, 160) + ' ×' + c);
  out.typography = {};
  for (const sel of ['h1', 'h2', 'h3', 'p', 'a', 'button', 'nav a']) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const cs = getComputedStyle(el);
    out.typography[sel] = { font: cap(cs.fontFamily, 80), size: cs.fontSize, weight: cs.fontWeight, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, transform: cs.textTransform };
  }
  out.fontsLoaded = [...new Set([...document.fonts].map(f => f.family + ' ' + f.weight))].slice(0, 20);
  out.containers = [...new Set([...document.querySelectorAll('main, [class*="container"], [class*="wrapper"], section > div')].map(el => getComputedStyle(el).maxWidth).filter(v => v && v !== 'none'))].slice(0, 6);
  const w = window;
  out.libs = { gsap: !!w.gsap, lenis: !!(w.Lenis || w.lenis), aos: !!w.AOS, anime: !!w.anime, locomotive: !!w.LocomotiveScroll, framerMotion: !!document.querySelector('[data-framer-name], [data-projection-id]') || [...document.scripts].some(s => (s.src || '').includes('framer')) };
  out.animScripts = [...document.scripts].map(s => s.src).filter(Boolean).filter(src => /gsap|framer|lottie|three|anime|aos|lenis|locomotive|motion/i.test(src)).slice(0, 10);
  return out;
}
```

**Two mandatory follow-ups:**
1. **Check `out.url`** — if it reads `about:blank`, the page context reset between calls; re-navigate and re-run (happened live).
2. **`blockedSheets` is not optional cleanup.** Cross-origin stylesheets are CORS-blocked from the CSSOM — on a Next.js site with a CDN that can be *all* of them, leaving `cssVars` and `keyframes` empty. `curl` each blocked URL and grep:
   `grep -oE '\-\-[a-z-]+:[^;]{1,60}' sheet.css` (custom props) and `grep -oE '@keyframes [a-zA-Z0-9_-]+' sheet.css | sort -u` — then pull full keyframe bodies for the interesting names. Verified live: this recovered Linear's spacing system (`--header-height:72px`, `--page-max-width:1024px`) that the in-page script couldn't see.

For animations that matter (hero entrance, scroll reveals), don't stop at detection — read the actual keyframes/easing so Phase 4 can quote real values (e.g. "0.16s cubic-bezier(0.25,0.46,0.45,0.94) on transform+filter").

## Phase 3 — Analyze

If a target project is known, read its stack and current styles first (`package.json`, tailwind/global CSS) — suggestions must land in the user's idiom.

Write the design read from the screenshots + tokens together:
- **What makes it work** — hierarchy, density, spacing rhythm, color discipline (count distinct colors — restraint is usually the secret), motion language (durations, easings, what moves and what never moves)
- **What's weak or dated** — contrast failures, fashion-victim effects, slow transitions, mobile neglect. These become "improve on it" items.
- **Cost** — what's cheap to recreate (tokens, type scale, transitions) vs expensive (WebGL heroes, custom illustration systems)

## Phase 4 — Suggestion menu, then STOP

Present a numbered table, grouped: **Layout · Color & surfaces · Typography · Motion · Components · Improvements on the original**. Every row quotes measured values, names where it lands in the user's project, and gives an honest verdict:

```
| # | Element | Measured spec | Effort | Where it goes | Verdict |
|---|---------|---------------|--------|---------------|---------|
| 1 | Hairline borders | rgba(255,255,255,0.08), 1px | S | Card, Nav | steal |
| 2 | Hover micro-motion | 0.16s cubic-bezier(.25,.46,.45,.94) transform | S | all interactive | steal |
| 3 | Type scale | h1 64/64 w510 ls-1.4px, body 15/24 | M | globals.css | adapt — keep your brand font |
| 4 | WebGL hero | three.js canvas | L | hero | skip — cost ≫ payoff, propose CSS gradient-mesh instead |
| 5 | [improvement] Their mobile nav buries CTA | — | S | MobileNav | do better |
```

End with exactly: **"Reply with the numbers you want (e.g. `1, 2, 5`) or `all`."** Then end the turn. Implement nothing. In an interactive session `AskUserQuestion` (multiSelect) may carry ≤4 grouped choices; otherwise the numbered reply is the interface.

## Phase 5 — Implement the picks

- Reimplement from tokens in the project's idiom (Tailwind theme/CSS vars) — never paste the reference's markup or class soup
- Use measured values exactly; no rounding 0.16s to 0.2s
- Animations: CSS-first; add a JS animation library only if the project already ships one
- Verify visually: run the dev server, screenshot the changed pages at 1440 and 390, compare side-by-side against the reference screenshots, iterate

## Common mistakes

| Mistake | Fix |
|---|---|
| Eyeballing colors/easings from screenshots | Extract computed values; quote them in the menu |
| Implementing right after "make it feel like X" | That's a study request — menu gate applies |
| Treating empty `cssVars` as "site has no tokens" | It's CORS — curl `blockedSheets` |
| Keyframe list full of `thing-0-1-anim` spam | Script dedups by name family; read families, not instances |
| Full-page screenshot before scrolling once | Lazy sections render blank — scroll through first |
| Desktop-only capture | Always 390px too |
| Chasing a timing-out screenshot for 10 minutes | Follow the remedy chain; element shots or move on |
| Copying brand assets/fonts/copy | Patterns yes, identity no |

## Red flags — stop and re-read the Menu Gate

"I'll just apply the obvious tokens first" · "The user clearly wants this implemented" · "I'll implement while waiting for their picks" · "Setting up variables isn't really implementing"

All of these mean: present the menu and end the turn.
