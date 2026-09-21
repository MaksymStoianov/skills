// SPDX-License-Identifier: Apache-2.0
import type { EvalSet } from "@testkit/evalset.ts";

const READ_ONLY = ["Read", "Glob", "Grep", "Skill"];

export const evals: EvalSet = {
  skill: "create-pr",
  cases: [
    {
      name: "follows-the-repos-own-title-convention",
      description:
        "The skill's whole claim is that it detects the repository's convention instead of " +
        "assuming Conventional Commits with a capitalised summary. This case states a convention " +
        "that contradicts the skill's own examples and checks which one wins.",
      tags: ["create-pr", "detection"],
      runs: 2,
      maxTurns: 8,
      allowedTools: READ_ONLY,
      expectedOutcome:
        "Produces a lowercase-summary title using an allowed type, and names where it would have " +
        "found the rule.",
      prompt: [
        "Our repo's commitlint config allows only the types `feat`, `fix` and `chore`, and its",
        "`subject-case` rule requires a lowercase summary. I've just added a dark-mode toggle to",
        "the `editor` package.",
        "",
        "Give me the PR title, and tell me where you would have looked for that rule if I hadn't",
        "told you.",
      ].join("\n"),
      graders: [
        {
          name: "title-obeys-the-stated-rule",
          type: "regex",
          arm: "both",
          options: { pattern: "feat\\(editor\\): [a-z]" },
          body:
            "Scored in both arms: a capitalised summary fails this repository's CI whether or not " +
            "the plugin is loaded. The skill's own Examples section shows capitalised summaries, " +
            "so a run that copies them has taken the example for the rule.",
        },
        {
          name: "names-where-the-convention-lives",
          type: "llm",
          body: [
            "PASS when the reply says it would find the convention in the repository itself —",
            "a commitlint or semantic-pull-request config, a title-lint workflow, CONTRIBUTING",
            "docs, or the titles of recent merged PRs.",
            "",
            "FAIL when it gives no source, or answers that Conventional Commits is simply the",
            "standard, with no mention of checking what this repository actually enforces.",
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
      runs: 2,
      maxTurns: 10,
      allowedTools: READ_ONLY,
      expectedOutcome:
        "Describes what the code now does; no branch name, title or body names the vulnerability class.",
      prompt: [
        "I've fixed an SQL injection in the webhook handler of our open-source repo (it's public on",
        "GitHub). Give me the branch name, the PR title and the PR body.",
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
      runs: 2,
      maxTurns: 8,
      allowedTools: READ_ONLY,
      expectedOutcome: "The `gh pr create` command it hands over carries --draft.",
      prompt:
        "Show me the exact `gh pr create` command you would run to open the PR for my current branch.",
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
      runs: 2,
      maxTurns: 8,
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
