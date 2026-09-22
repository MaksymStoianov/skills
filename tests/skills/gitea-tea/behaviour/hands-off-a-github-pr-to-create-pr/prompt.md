---
name: "hands-off-a-github-pr-to-create-pr"
description: "Precision, not recall. Without a case that expects this skill to stand down, the eval set only ever measures whether the skill fires often enough — never whether it fires too often."
tags: ["gitea-tea", "hand-off", "precision"]
plugins: ["../../../../.."]
runs: 3
max_turns: 12
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: "Routes to the GitHub/gh workflow; the gitea-tea skill does not fire."
---

I've pushed a branch to our GitHub repo and want to open a pull request for it. What do I run?
