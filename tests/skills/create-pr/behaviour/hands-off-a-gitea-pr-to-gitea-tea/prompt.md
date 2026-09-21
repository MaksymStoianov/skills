---
name: "hands-off-a-gitea-pr-to-gitea-tea"
description: "Precision, not recall. The sibling skill covers Gitea; a case that expects this one to stand down is what stops the eval set from rewarding a skill that fires on everything."
tags: ["create-pr", "hand-off", "precision"]
plugins: ["../../../../.."]
runs: 2
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: "Routes to the tea workflow; the create-pr skill does not fire."
---

We host our code on our own Gitea server. I've pushed a branch and want to open a pull request for it. What do I run?
