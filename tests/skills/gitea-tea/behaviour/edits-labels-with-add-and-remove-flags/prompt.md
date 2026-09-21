---
name: "edits-labels-with-add-and-remove-flags"
description: "`tea issues edit` has no --labels flag; passing one fails with an unknown-flag error. The first Gotcha in the skill says so, and this is the prompt that gets it wrong."
tags: ["gitea-tea", "gotcha", "cli-surface"]
plugins: ["../../../../.."]
runs: 2
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: "Uses --add-labels/--remove-labels, never a bare --labels, on an edit."
---

Using the tea CLI, change issue 42's priority from `Priority/Medium` to `Priority/High`. Show me the exact command.
