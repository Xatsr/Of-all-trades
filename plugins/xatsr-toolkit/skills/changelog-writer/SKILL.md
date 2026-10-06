---
name: changelog-writer
description: Writes or updates a CHANGELOG entry from recent git history. Use when the user asks for release notes, a changelog entry, or a summary of changes since a tag.
---

# Changelog writer

1. Find the range: the latest tag (`git describe --tags --abbrev=0`) to `HEAD`, or the range the user gives.
2. Read the commits in that range (`git log --no-merges --format='%h %s' <range>`).
3. Group them under these headings, omitting empty ones:
   - **Added** – new features
   - **Changed** – changes to existing behavior
   - **Fixed** – bug fixes
   - **Removed** – removed features
4. Rewrite each item for users, not developers: say what changed for them, not which function moved. Drop pure refactors, CI, and chore commits.
5. If `CHANGELOG.md` exists, insert the new section at the top following its existing format ([Keep a Changelog](https://keepachangelog.com) style otherwise). If it does not exist, show the entry and ask before creating the file.
