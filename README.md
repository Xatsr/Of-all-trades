# Of all trades

[Claude Code](https://code.claude.com) plugins by Xatsr.

## Use

Load a plugin directly from its folder:

```shell
claude --plugin-dir ./plugins/xatsr-toolkit
```

Or copy a single skill into your personal skills folder, e.g. `cp -r plugins/xatsr-toolkit/skills/changelog-writer ~/.claude/skills/`.

## Plugins

### xatsr-toolkit

| Component | Name | What it does |
| --- | --- | --- |
| Command | `/xatsr-toolkit:review-changes [focus]` | Reviews uncommitted changes for bugs, risky edits and missing tests. |
| Agent | `code-explainer` | Walks through how a piece of code works, citing `file:line`. Read-only. |
| Skill | `changelog-writer` | Drafts a changelog entry from git history since the last tag. |
| Skill | `study-page` | House style for HTML summaries and study pages: callouts for key points, mnemonics, pitfalls and pearls, tables, steps, self-check questions; light/dark mode and A4 print-to-PDF. |
| Skill | `review` | Exam-depth Thai review of a medical topic (CPG/NLEM, mnemonics, pitfalls), built on the `study-page` template. |

## Tools

### handoff-recorder

`tools/handoff-recorder/` records a ward handoff (ส่งเวร) live or from an iPhone audio file, transcribes Thai/English speech locally with Typhoon Whisper Turbo, and has Claude summarize it per patient by bed number. See its [README](tools/handoff-recorder/README.md).

📱 **iPhone web app:** [https://xatsr.github.io/Of-all-trades/tools/handoff-recorder/web/](https://xatsr.github.io/Of-all-trades/tools/handoff-recorder/web/)

## Layout

```
plugins/
  xatsr-toolkit/
    .claude-plugin/plugin.json       # plugin manifest
    commands/                        # slash commands
    agents/                          # subagents
    skills/                          # skills
```

## Adding a plugin

1. Create `plugins/<name>/.claude-plugin/plugin.json` with at least `name`, `version` and `description`.
2. Add `commands/`, `agents/`, `skills/`, `hooks/hooks.json` or `.mcp.json` as needed.
3. Run `claude plugin validate plugins/<name>` before pushing.
