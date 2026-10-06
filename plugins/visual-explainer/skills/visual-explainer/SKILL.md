---
name: visual-explainer
description: Renders explanations as a self-contained HTML page with diagrams, cards and tables, then opens it in the browser. Use when the user asks for a diagram, architecture overview, flowchart, visual explanation, diff or plan review page, or comparison; and proactively when an answer would otherwise be a terminal table wider than 4 columns or longer than 8 rows, or a flow with more than 5 steps.
---

# Visual explainer

Produce one self-contained HTML file that explains the topic visually, open it, and tell the user where it is. The page replaces a long terminal answer; keep the chat reply to the path and a short summary.

## Workflow

1. **Understand first.** Read the code or material before drawing anything. Every box, arrow and row must correspond to something real; cite `file:line` in captions or a sources list.
2. **Choose the structure** from the table below. Most pages combine two or three.
3. **Start from the template** at `templates/base.html` (relative to this skill's directory). Copy it, keep its `<head>`, theme tokens and Mermaid loader, and replace the `<main>` content. See `references/patterns.md` for ready-made section markup.
4. **Write the file** to `~/.agent/diagrams/<slug>.html` (create the directory if needed). Use a short, descriptive kebab-case slug such as `auth-flow.html` or `diff-review-2026-10-06.html`. Never overwrite a different topic's file.
5. **Open it** with `open <file>` on macOS or `xdg-open <file>` on Linux. If neither works (headless or remote session), skip this and just give the path.
6. **Reply** with the path and at most three lines of summary.

## Choosing a structure

| Content | Use |
| --- | --- |
| Process, pipeline, decision logic | Mermaid `flowchart` |
| Request/response, message passing between components | Mermaid `sequenceDiagram` |
| State machine, lifecycle | Mermaid `stateDiagram-v2` |
| Data model, schema | Mermaid `erDiagram` or `classDiagram` |
| System or module architecture | CSS grid of component cards, grouped by layer, plus a small flowchart of the main path |
| Comparison of options, files, configs | HTML `<table>` with sticky header |
| Before / after | Two columns side by side, same diagram type on both sides |
| Timeline, history, roadmap | Vertical timeline list |
| Key numbers | Row of stat cards above the detail |

## Rules

- **Self-contained.** One file, inline CSS and JS. The only external resources allowed are Mermaid from `cdn.jsdelivr.net` (already in the template) and fonts from Google Fonts. No build step, no local assets.
- **Both themes.** Keep the template's CSS custom properties and `prefers-color-scheme` block; define new colors as tokens, never hard-code them in elements. Mermaid follows the theme automatically through the template's loader.
- **Readable at any width.** No horizontal page scroll; wide tables scroll inside their own wrapper; card grids collapse to one column on narrow screens.
- **Diagrams stay small.** At most ~15 nodes per diagram. Split larger systems into an overview plus one diagram per subsystem. Label edges with what flows along them.
- **Mermaid syntax.** Quote node labels that contain punctuation (`A["parse(config)"]`), avoid `end` as a bare node id, and use `<br/>` for line breaks inside labels.
- **Accurate over pretty.** If you are unsure how a part works, mark it as such on the page ("not verified") rather than drawing a guess.
- **Escape content.** HTML-escape code snippets and file contents you place in the page (`<`, `>`, `&`).
- **No secrets.** Do not put tokens, credentials, or `.env` values on the page.
