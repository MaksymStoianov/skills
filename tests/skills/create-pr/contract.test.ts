// SPDX-License-Identifier: Apache-2.0
import { describeSkill } from "@testkit/suite.ts";

describeSkill("create-pr", ({ skill, test, expect, shellBlocks }) => {
  test("PR creation defaults to a draft", () => {
    const create = shellBlocks()
      .join("\n")
      .split("\n")
      .filter((l) => /gh pr create\b/.test(l));
    expect(create.length, "no `gh pr create` example to check.").toBeGreaterThan(0);
    for (const line of create) {
      expect(
        /--draft\b/.test(line),
        `example \`${line.trim()}\` opens a non-draft PR. A draft is the reversible choice: it ` +
          "notifies no reviewers and can be promoted, while a ready PR has already pinged everyone " +
          "by the time anyone notices it was premature.",
      ).toBe(true);
    }
  });

  test("the security-fix rule is scoped to public repositories and says how to establish that", () => {
    const body = skill.body;
    expect(
      /gh repo view[^\n]*isPrivate/.test(body),
      "the Security Fixes section never shows how to establish whether the repo is public. Without " +
        "a command to check, the agent guesses, and guessing wrong in the unsafe direction " +
        "publishes the attack vector.",
    ).toBe(true);
  });
});
