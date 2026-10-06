---
description: Explain a module, flow or concept as a visual HTML page with diagrams
argument-hint: "<topic, path or question>"
allowed-tools: Read, Grep, Glob, Write, Bash(mkdir:*), Bash(open:*), Bash(xdg-open:*)
---

Use the `visual-explainer` skill to produce a visual explanation of: $ARGUMENTS

If no topic was given, explain the overall architecture of the current repository.

1. Read the code needed to understand the topic. Cite `file:line` for every component you draw.
2. Pick the page structure from the skill: a flow diagram for processes, architecture cards for systems, a sequence diagram for request/response paths.
3. Write the page and open it, then reply with its path and a three-line summary.
