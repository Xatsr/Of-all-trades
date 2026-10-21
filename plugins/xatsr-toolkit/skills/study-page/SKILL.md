---
name: study-page
description: House style for every HTML page Claude makes — study summaries, lecture or slide or video summaries, topic reviews, cheat sheets, explainers. Use whenever you are about to write an HTML file or HTML artifact, so the page is readable, consistent, works in light and dark mode, and prints cleanly to PDF.
---

# Study page style

Every HTML page uses the template at `templates/base.html` (relative to this skill's directory). Copy it, keep its `<head>` and `<style>` unchanged, and replace only the content inside `<main>`.

## Workflow

1. Read the source material first. Every fact on the page must come from it; cite slide numbers, pages or timestamps in the sources footer.
2. Copy `templates/base.html` and set `<title>` and the header (subject, title, source, date).
3. Write the TL;DR first: three lines a student could recite before an exam.
4. Build sections from the components below. Delete components you do not use.
5. Add a table of contents only when there are four or more sections.
6. End with 3–5 self-check questions and the sources list.

## Components

| Use for | Markup |
| --- | --- |
| The most examinable fact | `<div class="box key">` |
| Memory aid | `<div class="box mnemonic">` with `<span class="letters">` |
| Common mistake, red flag, contraindication | `<div class="box pitfall">` |
| Practical tip, exam trick | `<div class="box pearl">` |
| Comparing 3+ items on the same attributes | `.table-wrap` + `<table>` (first column = item name) |
| Two or three things side by side | `.compare` with `.card` |
| Algorithm, procedure, management steps | `<ol class="steps">` |
| Causal chain, pathophysiology, decision tree | `.flow` of `.node` and `.arrow` (optional `data-label`); split with `.branch` holding several `.flow`; `.node.warn` for symptoms or danger, `.node.ok` for treatment targets |
| Short status label | `<span class="tag">`, `.tag.warn`, `.tag.ok` |
| One fact to remember inside a paragraph | `<mark>` (at most one per paragraph) |
| Self-check question | `<details><summary>Q</summary><p class="answer">A</p></details>` |

## Writing rules

- Short sentences. One idea per paragraph. Prefer lists and tables over long prose.
- Keep the user's language. Keep medical terms in English when the source does, with Thai explanation if the page is in Thai.
- Never invent mnemonics, numbers or drug doses that are not in the source; if you add your own mnemonic, label it "(own mnemonic)".
- Use callout boxes sparingly: no more than about three per section, or nothing stands out.

## Design rules

- Do not add new colors, gradients, shadows, emoji icons or extra fonts. All colors come from the `:root` tokens; to restyle, change only the tokens.
- Do not nest boxes or cards inside each other.
- Wide tables stay inside `.table-wrap` so phones scroll the table, not the page.

## Saving as PDF

The template has print styles: A4 pages, white background, table of contents on its own page, boxes and table rows never split across pages, and self-check answers printed. Open the file in a browser and use Print → Save as PDF, or with Playwright: `page.pdf({ format: 'A4', printBackground: true })`.
