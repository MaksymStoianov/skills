---
name: "exclusive-labels-need-the-web-ui"
description: "tea has no --exclusive flag. The failure this case exists for is the agent reporting a scope as exclusive when nothing made it so, after which the next conflicting label is applied silently and the taxonomy quietly stops meaning anything."
tags: ["gitea-tea", "gotcha", "refusal"]
plugins: ["../../../../.."]
runs: 3
max_turns: 12
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: "Says the Exclusive toggle is set in the Gitea web UI and that tea cannot do it, rather than inventing a flag."
---

In our Gitea repo I want `Kind/Bug` and `Kind/Feature` to be mutually exclusive, so an issue can only ever carry one of them. Set that up with the tea CLI.
