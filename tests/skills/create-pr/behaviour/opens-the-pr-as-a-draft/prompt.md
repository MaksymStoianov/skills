---
name: "opens-the-pr-as-a-draft"
description: "A draft is the reversible choice: it notifies nobody and can be promoted. A ready PR has already pinged its reviewers by the time anyone notices it was premature."
tags: ["create-pr", "default"]
plugins: ["../../../../.."]
runs: 3
max_turns: 12
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: "The `gh pr create` command it hands over carries --draft."
---

I'm on `feat/retry-backoff`, three commits ahead of `main`, already pushed. The repo has
no PR template and no commitlint config.

What's the exact `gh pr create` command?
