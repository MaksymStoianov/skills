---
name: "follows-the-repos-own-title-convention"
description: "The skill's whole claim is that it detects the repository's convention instead of assuming Conventional Commits with a capitalised summary. This case states a convention that contradicts the skill's own examples and checks which one wins."
tags: ["create-pr", "detection"]
plugins: ["../../../../.."]
runs: 2
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: "Produces a lowercase-summary title using an allowed type, and names where it would have found the rule."
---

Our repo's commitlint config allows only the types `feat`, `fix` and `chore`, and its
`subject-case` rule requires a lowercase summary. I've just added a dark-mode toggle to
the `editor` package.

Give me the PR title, and tell me where you would have looked for that rule if I hadn't
told you.
