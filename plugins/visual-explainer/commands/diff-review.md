---
description: Render the current changes as a visual review page
argument-hint: "[base ref, default HEAD]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Read, Grep, Glob, Write, Bash(mkdir:*), Bash(open:*), Bash(xdg-open:*)
---

Use the `visual-explainer` skill to build a visual review of the changes against this base ref: $ARGUMENTS

If no ref was given, use `HEAD` (uncommitted changes). Read the full diff with `git diff <ref>`.

Context:
- Status: !`git status --short`
- Uncommitted changes: !`git diff HEAD --stat`

The page must contain, in order:
1. **Summary** – one paragraph on what the change does and why.
2. **Files touched** – a table: file, lines added/removed, one-line purpose.
3. **Before / after** – a diagram of the affected flow or structure before and after the change, side by side. Skip it if the change is purely local.
4. **Findings** – concrete problems only (bugs, unhandled edge cases, missing tests), each with `file:line`, what goes wrong, and a fix. Say "No issues found" if there are none.

Write the page and open it, then reply with its path and the number of findings.
