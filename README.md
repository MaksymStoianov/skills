# Skills

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![skills.sh](https://skills.sh/b/MaksymStoianov/skills)](https://skills.sh/MaksymStoianov/skills)

Public skill collection by Maksym Stoianov, not tied to any single framework. Each skill is a self-contained directory under `skills/` with a `SKILL.md` file and, where useful, `scripts/`, `references/`, or `assets/`. The format follows the open [Agent Skills specification](https://agentskills.io/specification) — skills here work with any agent that implements it, not just Claude. [`llms.txt`](./llms.txt) at the root gives agents and crawlers a short index.

For skills specific to the [boot.gs](https://github.com/bootgs/boot) framework, see the separate [bootgs/skills](https://github.com/bootgs/skills) repository.

## Available skills

| Skill | Description |
|---|---|
| [`gitea-tea`](./skills/gitea-tea) | Issues, pull requests, labels, comments, and releases on Gitea via the official `tea` CLI. |
| [`create-pr`](./skills/create-pr) | Creates a GitHub PR via `gh` with a title matching the repo's own detected convention and a body from its own PR template. |

## Installation

### Claude Code

```
/plugin marketplace add MaksymStoianov/skills
```

### Gemini CLI

```bash
gemini extensions install https://github.com/MaksymStoianov/skills
```

The manifest is the root [`gemini-extension.json`](./gemini-extension.json), which picks up everything under `skills/` automatically.

### Any agent, via `npx skills`

```bash
npx skills add MaksymStoianov/skills
```

### What an installed skill carries

An installer copies `skills/<name>/` and nothing above it, so the root
[`LICENSE`](./LICENSE) does not travel with it. The terms ride inside the files
instead: `license: Apache-2.0` and `metadata.copyright` in the `SKILL.md`
frontmatter, and an `SPDX-License-Identifier: Apache-2.0` header in every file
bundled beside it. Passing an installed skill on to anyone else is
redistribution under Apache-2.0 — keep those notices with it, record where it
came from (`skills-lock.json` does that for skills installed with the CLI), and
include the [licence text](https://www.apache.org/licenses/LICENSE-2.0), which
the installed copy names by SPDX id but does not contain.

## Managing skills

`package.json` wraps the [`skills` CLI](https://github.com/vercel-labs/skills) (Create → Read → Update → Delete):

```bash
npm run skills:init             # scaffold a new SKILL.md
npm run skills:add -- <source>
npm run skills:list
npm run skills:find
npm run skills:use
npm run skills:update
npm run skills:remove
```

`skills:add` always targets `--agent '*'` — installs into `.agents/skills/` as the canonical copy and symlinks it only for agents that already have a footprint in the project.

## Adding a new skill

1. Copy `template/SKILL.md.template` to `skills/<skill-name>/SKILL.md`.
2. Fill in `name` and `description` in the frontmatter — `description` determines when an agent loads the skill on its own.
3. Give every file bundled beside `SKILL.md` an `SPDX-License-Identifier: Apache-2.0` header — a comment line for scripts and YAML, an HTML comment for markdown. That header is all an installed copy says about its terms.
4. Add `./skills/<skill-name>` to the relevant plugin (or a new one) in `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json`, and `.agents/plugins/marketplace.json`, each entry carrying `"license": "Apache-2.0"`.
5. Add `tests/skills/<skill-name>/contract.test.ts` with `describeSkill("<skill-name>")`, and an eval set in `tests/skills/<skill-name>/evals.ts`. Run `npm run test:behaviour:gen`, then `npm test`.

## Testing

See [`tests/README.md`](./tests/README.md) for what each layer proves.

```bash
npm test                        # contract, scripts, unit, integration, repo invariants
npm run test:live               # every cited URL, against the real internet
npm run test:behaviour:validate # load every eval case, spend nothing
npm run test:behaviour          # the release gate; every run is a real model call
npm run lint                    # one licence, stated everywhere a consumer looks
npm run typecheck
```

`npm test` needs to bind a loopback HTTP server for the integration layer; a
sandbox that forbids `listen` fails those cases with `EPERM` rather than an
assertion.

## License

[Apache License 2.0](./LICENSE) for everything here, except the vendored
directories recorded in [`THIRD-PARTY.md`](./THIRD-PARTY.md).
