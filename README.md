# Skills

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

Public skill collection by Maksym Stoianov, not tied to any single framework. Each skill is a self-contained directory under `skills/` with a `SKILL.md` file and, where useful, `scripts/`, `references/`, or `assets/`. The format follows the open [Agent Skills specification](https://agentskills.io/specification) — skills here work with any agent that implements it, not just Claude. [`llms.txt`](./llms.txt) at the root gives agents and crawlers a short index.

For skills specific to the [boot.gs](https://github.com/bootgs/boot) framework, see the separate [bootgs/skills](https://github.com/bootgs/skills) repository.

## Available skills

None yet — the repository is scaffolded and ready for the first one.

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
3. Add `./skills/<skill-name>` to the relevant plugin (or a new one) in `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json`, and `.agents/plugins/marketplace.json`.

## License

[Apache License 2.0](./LICENSE)
