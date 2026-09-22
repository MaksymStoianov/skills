---
name: "follows-the-repos-own-title-convention"
description: "The Boundaries table forbids presenting the Conventional Commits fallback as if it were the repository's own detected rule. A prompt that hands over the convention measures nothing — the base model follows a stated rule perfectly well. This one removes every signal instead, so the only thing left to get right is saying which it is."
tags: ["create-pr", "detection"]
plugins: ["../../../../.."]
runs: 3
max_turns: 12
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: "Gives a Conventional Commits title and says in as many words that it is a fallback, because this repository publishes no convention of its own."
---

This repo has no commitlint config, no lint bot, nothing in CONTRIBUTING about PR titles,
and no merged PRs to copy from. I've added a dark-mode toggle to the `editor` package.

What should the PR title be?
