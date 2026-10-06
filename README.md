# Xatsr plugin marketplace

A [Claude Code](https://code.claude.com) plugin marketplace.

## Install

```shell
/plugin marketplace add Xatsr/Xatsr
/plugin install xatsr-toolkit@xatsr
```

## Plugins

### xatsr-toolkit

| Component | Name | What it does |
| --- | --- | --- |
| Command | `/xatsr-toolkit:review-changes [focus]` | Reviews uncommitted changes for bugs, risky edits and missing tests. |
| Agent | `code-explainer` | Walks through how a piece of code works, citing `file:line`. Read-only. |
| Skill | `changelog-writer` | Drafts a changelog entry from git history since the last tag. |

## Layout

```
.claude-plugin/marketplace.json      # marketplace catalog
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
3. Add an entry to `plugins` in `.claude-plugin/marketplace.json` with `"source": "./plugins/<name>"`.
4. Run `claude plugin validate .` before pushing.
