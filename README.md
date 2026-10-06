# Xatsr plugin marketplace

A [Claude Code](https://code.claude.com) plugin marketplace.

## Install

```shell
/plugin marketplace add Xatsr/Xatsr
/plugin install xatsr-toolkit@xatsr
/plugin install visual-explainer@xatsr
```

## Plugins

### xatsr-toolkit

| Component | Name | What it does |
| --- | --- | --- |
| Command | `/xatsr-toolkit:review-changes [focus]` | Reviews uncommitted changes for bugs, risky edits and missing tests. |
| Agent | `code-explainer` | Walks through how a piece of code works, citing `file:line`. Read-only. |
| Skill | `changelog-writer` | Drafts a changelog entry from git history since the last tag. |

### visual-explainer

Renders explanations as self-contained HTML pages (Mermaid diagrams, architecture cards, comparison tables) in `~/.agent/diagrams/` and opens them in the browser. Pages follow the system light/dark theme.

| Component | Name | What it does |
| --- | --- | --- |
| Skill | `visual-explainer` | Builds the page. Triggers on requests for diagrams, architecture overviews or visual explanations, and when a terminal answer would be a large table or long flow. |
| Command | `/visual-explainer:explain <topic>` | Explains a module, flow or concept as a visual page. |
| Command | `/visual-explainer:diff-review [ref]` | Renders current changes as a review page: summary, files table, before/after diagram, findings. |

## Layout

```
.claude-plugin/marketplace.json      # marketplace catalog
plugins/
  xatsr-toolkit/
    .claude-plugin/plugin.json       # plugin manifest
    commands/                        # slash commands
    agents/                          # subagents
    skills/                          # skills
  visual-explainer/
    .claude-plugin/plugin.json
    commands/
    skills/visual-explainer/
      SKILL.md
      templates/base.html            # page skeleton with theme tokens and Mermaid
      references/patterns.md         # section markup snippets
```

## Adding a plugin

1. Create `plugins/<name>/.claude-plugin/plugin.json` with at least `name`, `version` and `description`.
2. Add `commands/`, `agents/`, `skills/`, `hooks/hooks.json` or `.mcp.json` as needed.
3. Add an entry to `plugins` in `.claude-plugin/marketplace.json` with `"source": "./plugins/<name>"`.
4. Run `claude plugin validate .` before pushing.
