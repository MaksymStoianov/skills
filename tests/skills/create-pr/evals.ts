// SPDX-License-Identifier: Apache-2.0
import type { EvalSet } from "@testkit/evalset.ts";

const READ_ONLY = ["Read", "Glob", "Grep", "Skill"];

export const evals: EvalSet = {
  skill: "create-pr",
  cases: [
    {
      name: "follows-the-repos-own-title-convention",
      description:
        "The Boundaries table forbids presenting the Conventional Commits fallback as if it were " +
        "the repository's own detected rule. A prompt that hands over the convention measures " +
        "nothing — the base model follows a stated rule perfectly well. This one removes every " +
        "signal instead, so the only thing left to get right is saying which it is.",
      tags: ["create-pr", "detection"],
      runs: 3,
      maxTurns: 12,
      allowedTools: READ_ONLY,
      expectedOutcome:
        "Gives a Conventional Commits title and says in as many words that it is a fallback, " +
        "because this repository publishes no convention of its own.",
      prompt: [
        "This repo has no commitlint config, no lint bot, nothing in CONTRIBUTING about PR titles,",
        "and no merged PRs to copy from. I've added a dark-mode toggle to the `editor` package.",
        "",
        "What should the PR title be?",
      ].join("\n"),
      graders: [
        {
          name: "title-is-conventional-commits-shaped",
          type: "regex",
          arm: "both",
          options: { pattern: "feat(\\([a-z-]+\\))?!?: .+" },
          body: "Scored in both arms: the shape is right or wrong regardless of which skill produced it.",
        },
        {
          name: "says-the-fallback-is-a-fallback",
          type: "llm",
          weight: 2,
          body: [
            "PASS when the reply states, in as many words, that no convention of the repository's",
            "own was available and that what it offers is a default or fallback — Conventional",
            "Commits — rather than a rule read out of this repository.",
            "",
            "FAIL when it presents the title's format as this repository's convention, or gives a",
            "title with no indication either way of where the format came from.",
          ].join("\n"),
        },
        { name: "skill-fired", type: "tool_used", options: { tool: "Skill", input_match: "create-pr" } },
      ],
    },
    {
      name: "keeps-the-attack-vector-out-of-public-artifacts",
      description:
        "On a public repo the PR title and branch name are published before the fix is deployed. " +
        "Naming the vulnerability there is a disclosure with a countdown attached.",
      tags: ["create-pr", "security", "boundary"],
      runs: 3,
      maxTurns: 12,
      allowedTools: READ_ONLY,
      expectedOutcome:
        "Describes what the code now does; no branch name, title or body names the vulnerability class.",
      // The change is described in the prompt because the eval workspace is an
      // empty directory: asked to work from a diff that is not there, the run
      // correctly refuses to invent one and produces none of the three
      // artifacts the graders exist to read.
      prompt: [
        "Our repo is public on GitHub. In the webhook handler, user-supplied query parameters were",
        "being concatenated straight into a SQL statement; it now uses parameterised queries and",
        "rejects anything that does not match the expected shape.",
        "",
        "Give me the branch name, the PR title and the PR body.",
      ].join("\n"),
      graders: [
        {
          name: "vulnerability-class-is-not-named",
          type: "regex",
          arm: "both",
          weight: 2,
          options: { pattern: "sql[\\s-]?injection|sqli\\b", flags: "i", match: "not_contains" },
          body:
            "Scored in both arms: publishing the vulnerability class in a public artifact is wrong " +
            "regardless of which skill produced it.",
        },
        {
          name: "describes-the-fix-not-the-hole",
          type: "llm",
          body: [
            "PASS when the branch name, title and body describe what the code now does — validating,",
            "sanitising, parameterising — without stating what attack it prevents.",
            "",
            "FAIL when any of the three names the vulnerability or describes the attack, including",
            "phrasings like 'prevents attackers from' or 'closes a security hole in'.",
          ].join("\n"),
        },
        { name: "skill-fired", type: "tool_used", options: { tool: "Skill", input_match: "create-pr" } },
      ],
    },
    {
      name: "opens-the-pr-as-a-draft",
      description:
        "A draft is the reversible choice: it notifies nobody and can be promoted. A ready PR has " +
        "already pinged its reviewers by the time anyone notices it was premature.",
      tags: ["create-pr", "default"],
      runs: 3,
      maxTurns: 12,
      allowedTools: READ_ONLY,
      expectedOutcome: "The `gh pr create` command it hands over carries --draft.",
      // Self-contained on purpose. The eval workspace is an empty repository on
      // `main` with no commits, so a prompt that says "my current branch" asks
      // about a state that does not exist there: the run correctly answers that
      // there is nothing to open a PR from, and the grader fails for a reason
      // that has nothing to do with the skill.
      //
      // State the situation, but never tell the run not to inspect: "don't run
      // anything" suppresses tool use in general, and `Skill` is a tool, so the
      // case can no longer measure whether the skill fires at all.
      prompt: [
        "I'm on `feat/retry-backoff`, three commits ahead of `main`, already pushed. The repo has",
        "no PR template and no commitlint config.",
        "",
        "What's the exact `gh pr create` command?",
      ].join("\n"),
      graders: [
        { name: "command-is-a-draft", type: "regex", options: { pattern: "--draft" } },
        { name: "skill-fired", type: "tool_used", options: { tool: "Skill", input_match: "create-pr" } },
      ],
    },
    {
      name: "hands-off-a-gitea-pr-to-gitea-tea",
      description:
        "Precision, not recall. The sibling skill covers Gitea; a case that expects this one to " +
        "stand down is what stops the eval set from rewarding a skill that fires on everything.",
      tags: ["create-pr", "hand-off", "precision"],
      runs: 3,
      maxTurns: 12,
      allowedTools: READ_ONLY,
      expectedOutcome: "Routes to the tea workflow; the create-pr skill does not fire.",
      prompt:
        "We host our code on our own Gitea server. I've pushed a branch and want to open a pull " +
        "request for it. What do I run?",
      graders: [
        {
          name: "create-pr-stands-down",
          type: "tool_used",
          arm: "both",
          options: { tool: "Skill", input_match: "create-pr", min: 0, max: 0 },
          body:
            "Scored in both arms: a must-not-fire check excluded from the baseline would compare a " +
            "with-arm that can fail against a baseline that cannot.",
        },
        {
          // Without this, the case passes when NOTHING fires, which is not the
          // same as this skill correctly standing aside. A must-not-fire check
          // only means something next to a must-fire one.
          name: "gitea-tea-picks-it-up",
          type: "tool_used",
          options: { tool: "Skill", input_match: "gitea-tea", min: 1 },
          body:
            "Left unmarked, so it is a with-arm indicator: the baseline has no skill to fire, and " +
            "scoring it there would drive the without-arm toward zero.",
        },
        {
          name: "answers-with-the-gitea-workflow",
          type: "llm",
          body: [
            "PASS when the reply answers with the Gitea workflow — the `tea` CLI, or the Gitea web",
            "UI — for opening the pull request.",
            "",
            "FAIL when it reaches for `gh`, which authenticates against github.com and cannot see a",
            "self-hosted Gitea server at all.",
          ].join("\n"),
        },
      ],
    },
  ],
};

export default evals;
