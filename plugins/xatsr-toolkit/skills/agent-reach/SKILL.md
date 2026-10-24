---
name: agent-reach
description: Reads content from the web and social platforms through the Agent Reach CLI (YouTube subtitles and transcripts, web pages and search, RSS, GitHub, Reddit, Bilibili and more). Use when the user pastes a link or asks to search, read or summarize something and the built-in web tools are unavailable, fail or miss the body, comments or subtitles; or when they want to install, update, add or remove a channel, log in, or check the status of Agent Reach. Read-only.
---

# Agent Reach

[Agent Reach](https://github.com/Panniantong/Agent-Reach) gives an agent one read-only command, `agent-reach`, that routes to the right upstream tool for each platform (yt-dlp for YouTube, Jina Reader and Exa for the web, feedparser for RSS, and so on). Before using it, say "Using the agent-reach skill (<channel> channel)".

## Pick the route

- Public content first goes through your own web search and fetch tools (add `site:<domain>` where useful). Check separately whether you got the body, the comments and the subtitles you need. If you did, answer and stop: no installs, no logins.
- Use Agent Reach when your own tools are unavailable, miss part of what the user asked for, or the user wants an on-site action a channel offers. Run `agent-reach channels` when unsure which actions and arguments exist.
- A platform name or link only identifies the source. It never triggers an install or a login by itself.
- A summary, page shell, comment count or list of subtitle tracks is not the body, comments or subtitles. Say which parts you actually got.

```bash
agent-reach channels                         # every channel, its actions and arguments
agent-reach <channel> <action> [args]        # e.g. agent-reach youtube search "sepsis bundle" --limit 5
agent-reach read <url>                       # picks the channel from the link
```

## Results and errors

Each command prints one JSON object.

- `ok: true`: content is in `items`, each with `title / url / author / published_at / text`; raw data is in `raw`.
- `ok: false`: read `error.code` and follow `error.hint`.

| error.code | What to do |
| --- | --- |
| `NEED_SETUP` | Missing dependency or key. Run `agent-reach add <channel>`; if a key is needed, the user provides it and you run `agent-reach configure <key>`. |
| `NEED_LOGIN` | Keep what you already have and tell the user a login is needed. `agent-reach login <channel>` opens a browser where the user signs in themselves. |
| `UPSTREAM_BROKEN` | The platform is having trouble. Tell the user which platform and roughly why. Only if the message says the tool is outdated, offer `agent-reach update` and run it once after they agree. Do not retry in a loop. |
| `TIMEOUT` | Check `agent-reach doctor --text`. Do not keep retrying. |
| `RATE_LIMITED` | Wait `retry_after_seconds`. Do not switch backends. |
| `PLATFORM_BLOCKED` | Captcha or risk check. Stop and ask the user to clear it on the official site. |
| `BUSY` | The shared browser is full or a login window is open. Try again later. |
| `NOT_FOUND` | Check the link or ID. |
| `BAD_INPUT` | Check usage with `agent-reach channels`. |

On `PLATFORM_BLOCKED`, `RATE_LIMITED`, `NEED_LOGIN` or `BUSY`, stop this attempt. A network failure is not proof that a platform requires login.

## Channels

| Channel | Tier | What it does | Needs |
| --- | --- | --- | --- |
| youtube | default | Video info, search, subtitles, speech-to-text | Nothing; transcription needs a Groq or OpenAI key |
| web | default | Web search and page reading (fallback for any site) | Nothing; Exa search uses a free key |
| github | default | Search repos, read READMEs, issues and PRs with comments | Nothing |
| bilibili | default | Search, video info, trending, subtitles | Subtitles need a login |
| v2ex | default | Hot topics, nodes, threads and replies | Nothing |
| reddit | optional | Search, posts, comments, subreddits | Login |
| linkedin | optional | Job search and job details | Login for on-site search |
| xiaohongshu, xueqiu, boss, xiaoyuzhou | optional | Notes, stock quotes, job listings, podcast transcripts | Login or Groq key |
| twitter, facebook, instagram | experimental | Search, profiles, posts | Login; may break at any time |

The list changes between versions; `agent-reach channels` is the source of truth.

## Summarizing a YouTube video

1. `agent-reach read <youtube-url>` (or `agent-reach youtube` with the subtitle action from `agent-reach channels`) to get subtitles.
2. No subtitles? Use the speech-to-text action, which needs a Groq or OpenAI key configured by the user.
3. Summarize from the transcript text only. Say if you worked from auto-generated captions.

## Managing Agent Reach

| User says | You run |
| --- | --- |
| Install it | See [Install](#install) |
| Add a platform | `agent-reach add <channel>`; tell the user only what they must do (log in or give a key) |
| Remove a platform | `agent-reach remove <channel>` |
| Log in / login expired | `agent-reach login <channel>`; the user signs in in the window that opens |
| Log out | `agent-reach logout <channel>` |
| What works? | `agent-reach doctor --text`; for a live test `agent-reach check <channel> --text` |
| Update | `agent-reach update` |
| Uninstall | Show `agent-reach uninstall --dry-run` first, then `agent-reach uninstall` after they confirm |
| Let another AI use it | `agent-reach skill link <that AI's skill folder>` |

When a result carries `meta.update`, mention the new version once per conversation with one to three points from `meta.update.notes`, and run `agent-reach update` only if the user agrees.

## Install

The PyPI package named `agent-reach` is a different project. Install only from the GitHub release.

1. Check `agent-reach version`. JSON output means 1.6 or later (run `agent-reach update`); a plain line like `Agent Reach v1.5.0` means an old pip/pipx install that should be upgraded with step 3 using `--force`.
2. Install [uv](https://docs.astral.sh/uv/) if missing:
   - Windows: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
   - macOS / Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`
3. Install and set up:
   ```bash
   uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
   agent-reach setup
   ```
   If `agent-reach` is not found afterwards, run `uv tool update-shell` and open a new shell.
4. Show `result.installation_report.markdown` from the setup output to the user as is.

Settings and keys live in `~/.agent-reach/config.yaml` and survive upgrades. Full guide: [install.md](https://github.com/Panniantong/Agent-Reach/blob/main/docs/install.md).

## Hard rules

- Read-only. Never post, comment, like or send messages.
- Never log in for the user, and never ask for or print passwords, cookies or other credentials.
- Ordinary queries do not install dependencies or update anything.
