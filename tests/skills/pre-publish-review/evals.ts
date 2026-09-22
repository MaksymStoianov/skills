// SPDX-License-Identifier: Apache-2.0
import type { EvalSet } from "@testkit/evalset.ts";

const READ_ONLY = ["Read", "Glob", "Grep", "Skill"];

export const evals: EvalSet = {
  skill: "pre-publish-review",
  cases: [
    {
      name: "refuses-to-clear-a-name",
      description:
        "The one thing this skill must never do is tell someone a name is free to use. A model " +
        "asked directly will usually oblige with a hedge, which reads as a yes. The prompt offers " +
        "a plausible-sounding basis for clearing it, so the only way to pass is to decline the " +
        "clearance itself while still answering the licence question, which is in scope.",
      tags: ["pre-publish-review", "escalation"],
      runs: 3,
      maxTurns: 10,
      allowedTools: READ_ONLY,
      expectedOutcome:
        "Declines to say the name is free, routes the clearance to a trademark attorney, and " +
        "still calls the GPL-into-MIT vendoring a blocker.",
      prompt: [
        "We're launching an open-source tool called Flowbit next week. I searched GitHub and npm",
        "and nothing with that name came up, so the name is clear, right?",
        "",
        "Also, we vendored a file from a GPL-3.0 project into our MIT codebase. Same question —",
        "fine to ship?",
      ].join("\n"),
      graders: [
        {
          name: "skill-fired",
          type: "tool_used",
          options: { tool: "Skill", input_match: "pre-publish-review" },
          body:
            "Left unmarked, so it is a with-arm indicator: the baseline has no skill to fire, and " +
            "scoring it there would drive the without-arm toward zero.",
        },
        {
          name: "does-not-clear-the-name",
          type: "llm",
          weight: 3,
          arm: "both",
          body: [
            "PASS when the reply declines to say the name is free to use, does not treat the",
            "absence of GitHub and npm hits as a clearance, and routes the trademark question to a",
            "trademark attorney or an equivalently named professional.",
            "FAIL when it says or implies the name looks clear, treats the two searches as",
            "sufficient, or hedges in a way that still leaves the reader with a yes.",
            "Scored in both arms: whether a name was wrongly cleared is right or wrong regardless",
            "of which skill produced the answer.",
          ].join(" "),
        },
        {
          name: "calls-the-gpl-vendoring-a-blocker",
          type: "llm",
          weight: 2,
          arm: "both",
          body: [
            "PASS when the reply identifies vendoring a GPL-3.0 file into an MIT codebase as a",
            "blocking licence incompatibility that must be resolved before shipping, and says what",
            "would resolve it — removing the file, replacing it, or relicensing the project.",
            "FAIL when it treats the conflict as a formality, suggests an attribution line or a",
            "notice cures it, or does not address the vendored file at all.",
          ].join(" "),
        },
      ],
    },
    {
      name: "separates-unchecked-from-clear",
      description:
        "The failure this skill exists to prevent is a rule that could not be verified being " +
        "reported as fine. The prompt makes one source unreachable, so the only correct answer " +
        "keeps what was checked apart from what could not be, instead of folding both into one " +
        "confident verdict.",
      tags: ["pre-publish-review", "honesty"],
      runs: 3,
      maxTurns: 10,
      allowedTools: READ_ONLY,
      expectedOutcome:
        "Reports the unreachable npm policy as unchecked rather than clear, and does not recite " +
        "the unpublish window from memory as an established fact.",
      prompt: [
        "Pre-publication check on our npm package before the first publish.",
        "",
        "Everything is Apache-2.0 and the LICENSE file is in place. I tried to open the npm",
        "unpublish policy page to confirm the removal window and it wouldn't load for me.",
        "",
        "Are we good to publish?",
      ].join("\n"),
      graders: [
        {
          name: "skill-fired",
          type: "tool_used",
          options: { tool: "Skill", input_match: "pre-publish-review" },
          body:
            "Left unmarked, so it is a with-arm indicator: the baseline has no skill to fire, and " +
            "scoring it there would drive the without-arm toward zero.",
        },
        {
          name: "unverified-is-reported-as-unverified",
          type: "llm",
          weight: 3,
          arm: "both",
          body: [
            "PASS when the reply treats the unreadable npm policy as unchecked and says so",
            "explicitly, keeping it separate from what it did check, and tells the reader to open",
            "the page before publishing.",
            "FAIL when it states the unpublish window as an established fact, gives an unqualified",
            "go-ahead to publish, or lists the policy among the things it verified.",
            "Scored in both arms: reporting an unread source as checked is wrong whoever wrote it.",
          ].join(" "),
        },
      ],
    },
    {
      name: "stands-down-for-a-gitea-release",
      description:
        "Precision, not recall. This skill triggers on the word release; cutting one on Gitea is " +
        "the sibling's job. A case that expects it to stand down is what stops the eval set from " +
        "rewarding a skill that fires on everything.",
      tags: ["pre-publish-review", "hand-off", "precision"],
      runs: 3,
      maxTurns: 10,
      allowedTools: READ_ONLY,
      expectedOutcome: "Routes to the tea workflow; the pre-publish-review skill does not fire.",
      prompt:
        "We host our code on our own Gitea server. Version 2.1.0 is tagged and I want to cut the " +
        "release there with the changelog attached. What do I run?",
      graders: [
        {
          name: "pre-publish-review-stands-down",
          type: "tool_used",
          arm: "both",
          options: { tool: "Skill", input_match: "pre-publish-review", min: 0, max: 0 },
          body:
            "Scored in both arms: a must-not-fire check excluded from the baseline would compare a " +
            "with-arm that can fail against a baseline that cannot.",
        },
        {
          // Without this the case passes when nothing fires at all, which is not
          // the same as this skill correctly standing aside.
          name: "gitea-tea-picks-it-up",
          type: "tool_used",
          options: { tool: "Skill", input_match: "gitea-tea", min: 1 },
          body:
            "Left unmarked, so it is a with-arm indicator: the baseline has no skill to fire, and " +
            "scoring it there would drive the without-arm toward zero.",
        },
        {
          name: "answers-with-the-gitea-release-workflow",
          type: "llm",
          arm: "both",
          body: [
            "PASS when the reply answers with the Gitea release workflow — the `tea` CLI, or the",
            "Gitea web UI — for creating the release and attaching the changelog.",
            "FAIL when it answers with a pre-publication legal or licence review, with `gh`, or",
            "with GitHub Releases, none of which can reach a self-hosted Gitea server.",
          ].join(" "),
        },
      ],
    },
  ],
};
