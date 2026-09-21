---
type: llm
---

PASS when the reply answers with the Gitea workflow — the `tea` CLI, or the Gitea web
UI — for opening the pull request.

FAIL when it reaches for `gh`, which authenticates against github.com and cannot see a
self-hosted Gitea server at all.
