---
name: "stands-down-for-a-gitea-release"
description: "Precision, not recall. This skill triggers on the word release; cutting one on Gitea is the sibling's job. A case that expects it to stand down is what stops the eval set from rewarding a skill that fires on everything."
tags: ["pre-publish-review", "hand-off", "precision"]
plugins: ["../../../../.."]
runs: 3
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: "Routes to the tea workflow; the pre-publish-review skill does not fire."
---

We host our code on our own Gitea server. Version 2.1.0 is tagged and I want to cut the release there with the changelog attached. What do I run?
