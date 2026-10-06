---
description: Review uncommitted changes for bugs, risky edits, and missing tests
argument-hint: "[path or focus area]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Read, Grep, Glob
---

Review the current uncommitted changes in this repository.

Context:
- Status: !`git status --short`
- Diff: !`git diff HEAD`

Focus: $ARGUMENTS

Instructions:
1. Read the diff and any surrounding code needed to understand it.
2. Report concrete problems only: bugs, unhandled edge cases, security issues, and behavior changes without tests.
3. For each finding give `file:line`, what goes wrong, and a suggested fix.
4. If nothing is wrong, say so in one line. Do not pad the review with style nits.
