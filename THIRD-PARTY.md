# Third-party code

Everything in this repository is [Apache-2.0](./LICENSE) except the directories
listed below, which belong to someone else and are redistributed here under
their own terms. Each keeps its licence file verbatim, where the licence
requires it to travel with the code.

## `.agents/skills/skill-creator`

| | |
|---|---|
| **Upstream** | [`anthropics/skills`](https://github.com/anthropics/skills), `skills/skill-creator/` |
| **Copyright** | Copyright 2026 Anthropic, PBC. |
| **Licence** | Apache-2.0, retained verbatim at [`.agents/skills/skill-creator/LICENSE.txt`](./.agents/skills/skill-creator/LICENSE.txt) |
| **Pinned at** | The `computedHash` recorded for it in [`skills-lock.json`](./skills-lock.json) |
| **NOTICE** | None. Upstream ships no `NOTICE` file at its root (checked: `NOTICE`, `NOTICE.txt` and `LICENSE` all 404 on `raw.githubusercontent.com/anthropics/skills/main/`), so Apache-2.0 §4(d) adds nothing to propagate beyond the licence file itself. |

It is vendored, not authored here: it is the authoring tool this collection's
own skills were written with, installed by `npm run skills:add`. Changes belong
upstream.

## Checking this file is still true

`node scripts/lint-license.ts` fails when a directory carrying its own licence
file is not listed here, and `tests/repo/license.test.ts` asserts the set of such
directories has not changed. Neither can tell you the upstream terms changed —
re-read the upstream licence when you update the pin in `skills-lock.json`.
