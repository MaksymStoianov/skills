---
name: "opens-the-pr-as-a-draft"
description: "A draft is the reversible choice: it notifies nobody and can be promoted. A ready PR has already pinged its reviewers by the time anyone notices it was premature."
tags: ["create-pr", "default"]
plugins: ["../../../../.."]
runs: 2
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: "The `gh pr create` command it hands over carries --draft."
---

Show me the exact `gh pr create` command you would run to open the PR for my current branch.
