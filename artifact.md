---
name: artifact
description: Build a self-contained, browser-renderable artifact (React+Tailwind, vanilla HTML/JS, SVG, or markdown) like the Claude app. Saves to ~/Developer/artifacts/ and auto-opens in the browser. Use when the user wants to see something rendered — a UI mockup, interactive demo, diagram, data viz, landing page, prototype, or any visual output.
---

# Artifact Builder

Build a single self-contained HTML file that renders in the browser, save it under `~/Developer/artifacts/`, and open it.

## Requirements

No MCP servers. Uses the macOS `open` command (built-in) to launch the browser. Rendered artifacts load their libraries (React, Tailwind, Chart.js, etc.) from CDNs, so *viewing* them needs internet.

## Steps

1. **Pick the artifact type** from the user's request:
   - **React + Tailwind** (default for UI, components, interactive demos) — React 18 + Tailwind via CDN
   - **Vanilla HTML/JS/CSS** — for simple pages, games, canvas work, anything that doesn't need React
   - **SVG** — for diagrams, charts, illustrations (wrap in HTML for browser viewing)
   - **Markdown** — render as styled HTML page

   When ambiguous, default to React + Tailwind. Ask only if it's a meaningful fork.

2. **Generate a kebab-case slug** from the artifact's purpose (max ~5 words). Example: "todo list with drag" → `todo-list-drag`.

3. **Build the filename**: `~/Developer/artifacts/{slug}-{YYYYMMDD-HHMMSS}.html`. Use `date +%Y%m%d-%H%M%S` for the timestamp.

4. **Write the file** as a single self-contained HTML document. Everything inline — no external files, no build step. Use CDNs for libraries.

5. **Open it** with `open "{filepath}"` (macOS). This launches the default browser.

6. **Output the clickable link** in the format: `file:///Users/pravinemani/Developer/artifacts/{filename}` so the user can re-open it later.

## Templates

### React + Tailwind (default)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{TITLE}</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif; }
  </style>
</head>
<body class="bg-neutral-50 text-neutral-900">
  <div id="root"></div>
  <script type="text/babel" data-type="module">
    const { useState, useEffect, useRef, useMemo, useCallback } = React;

    function App() {
      // component code here
      return <div className="p-8">Hello</div>;
    }

    ReactDOM.createRoot(document.getElementById("root")).render(<App />);
  </script>
</body>
</html>
```

### Vanilla HTML/JS

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{TITLE}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <!-- content -->
  <script>
    // js here
  </script>
</body>
</html>
```

## Style Defaults

Match the polished, minimal aesthetic Claude artifacts use:
- System font stack (Inter / SF Pro fallback)
- Neutral palette by default (`neutral-50` background, `neutral-900` text), let the artifact's purpose drive accent colors
- Generous whitespace: `p-8` or `p-12` for outer containers
- Rounded corners (`rounded-xl` or `rounded-2xl`), subtle shadows (`shadow-sm`)
- Smooth transitions (`transition-all duration-200`)
- Responsive — works at any width

## Library CDNs (use when needed)

- **Charts:** `https://cdn.jsdelivr.net/npm/recharts@2/umd/Recharts.js` (Recharts) or `https://cdn.jsdelivr.net/npm/chart.js`
- **Animation:** `https://cdn.jsdelivr.net/npm/framer-motion@11/dist/framer-motion.js`
- **Icons:** `https://unpkg.com/lucide@latest` (then `lucide.createIcons()`)
- **3D:** `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`
- **Markdown:** `https://cdn.jsdelivr.net/npm/marked/marked.min.js`

## Rules

- **One file, fully self-contained.** No imports of local files. CDN-only for dependencies.
- **No API keys, no secrets** in the artifact — it's a static file the user may share.
- **Always open the file** after writing it — never just return the path.
- **End with the file:// link** on its own line, clickable in the terminal.
- For iterations: if the user asks to tweak the last artifact, edit the existing file in place rather than creating a new timestamped copy. Re-run `open` to refresh the tab.

## Output format

After creating and opening the artifact, respond with one or two lines:

```
Built {what it is} → file:///Users/pravinemani/Developer/artifacts/{filename}
```

Nothing else unless the user asked questions.
