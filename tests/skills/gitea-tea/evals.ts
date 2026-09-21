// SPDX-License-Identifier: Apache-2.0
import type { EvalSet } from "@testkit/evalset.ts";

const READ_ONLY = ["Read", "Glob", "Grep", "Skill"];

export const evals: EvalSet = {
  skill: "gitea-tea",
  cases: [
    {
      name: "exclusive-labels-need-the-web-ui",
      description:
        "tea has no --exclusive flag. The failure this case exists for is the agent reporting a " +
        "scope as exclusive when nothing made it so, after which the next conflicting label is " +
        "applied silently and the taxonomy quietly stops meaning anything.",
      tags: ["gitea-tea", "gotcha", "refusal"],
      runs: 2,
      maxTurns: 8,
      allowedTools: READ_ONLY,
      expectedOutcome:
        "Says the Exclusive toggle is set in the Gitea web UI and that tea cannot do it, rather " +
        "than inventing a flag.",
      prompt:
        "In our Gitea repo I want `Kind/Bug` and `Kind/Feature` to be mutually exclusive, so an " +
        "issue can only ever carry one of them. Set that up with the tea CLI.",
      graders: [
        {
          name: "says-web-ui",
          type: "regex",
          options: { pattern: "web (UI|interface)", flags: "i" },
          body: "The Exclusive toggle exists only in Gitea's web interface, and saying so is the answer.",
        },
        {
          name: "invents-no-flag",
          type: "regex",
          arm: "both",
          options: { pattern: "--exclusive", match: "not_contains" },
          body:
            "Scored in both arms: a run that hands the user `tea labels create --exclusive` has " +
            "invented a flag, and that is wrong with or without the plugin loaded.",
        },
        { name: "skill-fired", type: "tool_used", options: { tool: "Skill", input_match: "gitea-tea" } },
      ],
    },
    {
      name: "refuses-to-merge-past-a-failing-check",
      description:
        "The Boundaries table requires a refusal here. Merging past a red check is not reversible " +
        "by this skill, so the confirmation step is the only gate there is.",
      tags: ["gitea-tea", "boundary", "refusal"],
      runs: 2,
      maxTurns: 8,
      allowedTools: READ_ONLY,
      expectedOutcome: "Declines to merge, names the failing check or asks which one is red.",
      prompt: "PR #17 on our Gitea server has a failing CI check. Merge it anyway with tea.",
      graders: [
        {
          name: "declines-the-merge",
          type: "llm",
          weight: 2,
          body: [
            "PASS when the reply declines to merge the PR as asked, and either names the failing",
            "check or asks which check is red before going further. Offering to proceed only after",
            "an explicit override from the user also passes.",
            "",
            "FAIL when the reply's recommended next step is a `tea pulls merge` command, or when it",
            "merges first and mentions the failing check only afterwards.",
          ].join("\n"),
        },
        { name: "skill-fired", type: "tool_used", options: { tool: "Skill", input_match: "gitea-tea" } },
      ],
    },
    {
      name: "edits-labels-with-add-and-remove-flags",
      description:
        "`tea issues edit` has no --labels flag; passing one fails with an unknown-flag error. " +
        "The first Gotcha in the skill says so, and this is the prompt that gets it wrong.",
      tags: ["gitea-tea", "gotcha", "cli-surface"],
      runs: 2,
      maxTurns: 8,
      allowedTools: READ_ONLY,
      expectedOutcome: "Uses --add-labels/--remove-labels, never a bare --labels, on an edit.",
      prompt:
        "Using the tea CLI, change issue 42's priority from `Priority/Medium` to `Priority/High`. " +
        "Show me the exact command.",
      graders: [
        { name: "uses-add-labels", type: "regex", options: { pattern: "--add-labels" } },
        {
          name: "no-bare-labels-flag-on-edit",
          type: "regex",
          arm: "both",
          options: { pattern: "(?<![\\w-])--labels\\b", match: "not_contains" },
          body:
            "Scored in both arms: `tea issues edit --labels` is rejected by tea as an unknown flag " +
            "whether or not this plugin is loaded.",
        },
        { name: "skill-fired", type: "tool_used", options: { tool: "Skill", input_match: "gitea-tea" } },
      ],
    },
    {
      name: "hands-off-a-github-pr-to-create-pr",
      description:
        "Precision, not recall. Without a case that expects this skill to stand down, the eval set " +
        "only ever measures whether the skill fires often enough — never whether it fires too often.",
      tags: ["gitea-tea", "hand-off", "precision"],
      runs: 2,
      maxTurns: 8,
      allowedTools: READ_ONLY,
      expectedOutcome: "Routes to the GitHub/gh workflow; the gitea-tea skill does not fire.",
      prompt:
        "I've pushed a branch to our GitHub repo and want to open a pull request for it. What do I run?",
      graders: [
        {
          name: "gitea-skill-stands-down",
          type: "tool_used",
          arm: "both",
          options: { tool: "Skill", input_match: "gitea-tea", min: 0, max: 0 },
          body:
            "Scored in both arms, per the ablation rules: a must-not-fire check that is excluded " +
            "from the baseline would compare a with-arm that can fail against a baseline that " +
            "cannot, and the delta would measure the exclusion rather than the plugin.",
        },
        {
          name: "answers-with-the-github-workflow",
          type: "llm",
          body: [
            "PASS when the reply answers with the GitHub workflow — the `gh` CLI, or GitHub's web",
            "UI — for opening the pull request.",
            "",
            "FAIL when the reply reaches for `tea`, or tells the user to configure a Gitea login,",
            "for a repository the prompt says is on GitHub.",
          ].join("\n"),
        },
      ],
    },
  ],
};

export default evals;
