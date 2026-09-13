# Skills

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

Публичная коллекция скилов Maksym Stoianov, не привязанных к конкретному фреймворку. Каждый скил — самостоятельная папка в `skills/` с файлом `SKILL.md` и, при необходимости, `scripts/`, `references/` или `assets/`. Формат соответствует открытой спецификации [Agent Skills](https://agentskills.io/specification) — скилы работают в любом агенте, который её поддерживает, не только в Claude. [`llms.txt`](./llms.txt) в корне даёт агентам и краулерам краткий индекс.

Для скилов, специфичных для фреймворка [boot.gs](https://github.com/bootgs/boot), см. отдельный репозиторий [bootgs/skills](https://github.com/bootgs/skills).

## Доступные скилы

Пока нет — репозиторий готовится к первому скилу.

## Установка

### Claude Code

```
/plugin marketplace add MaksymStoianov/skills
```

### Gemini CLI

```bash
gemini extensions install https://github.com/MaksymStoianov/skills
```

Манифест — корневой [`gemini-extension.json`](./gemini-extension.json), забирает всё содержимое `skills/` автоматически.

### Любой агент, через `npx skills`

```bash
npx skills add MaksymStoianov/skills
```

## Управление скилами

`package.json` оборачивает CLI [`skills`](https://github.com/vercel-labs/skills) (Create → Read → Update → Delete):

```bash
npm run skills:init             # создать новый SKILL.md
npm run skills:add -- <источник>
npm run skills:list
npm run skills:find
npm run skills:use
npm run skills:update
npm run skills:remove
```

`skills:add` всегда с `--agent '*'` — устанавливает в `.agents/skills/` как канонический источник и создаёт symlink только для агентов, у которых уже есть след в проекте.

## Добавление нового скила

1. Скопировать `template/SKILL.md.template` в `skills/<skill-name>/SKILL.md`.
2. Заполнить `name` и `description` во frontmatter — `description` определяет, когда агент сам подключит скил.
3. Добавить путь `./skills/<skill-name>` в соответствующий плагин (или новый) в `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json` и `.agents/plugins/marketplace.json`.

## Лицензия

[Apache License 2.0](./LICENSE)
