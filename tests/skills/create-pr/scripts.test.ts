// SPDX-License-Identifier: Apache-2.0
/**
 * `scripts/validate-pr-title.sh`, against the contract its own header states.
 * Step 7 of the skill gates PR creation on this script, so a title it wrongly
 * accepts becomes a PR that fails CI after it already exists and has notified
 * reviewers.
 */
import { describe, expect, test } from "vitest";

import { loadSkill } from "@testkit/repo.ts";
import { runSkillScript } from "@testkit/sh.ts";

const skill = loadSkill("create-pr");
const run = (args: string[]) => runSkillScript(skill.path, "scripts/validate-pr-title.sh", args);

describe("validate-pr-title.sh", () => {
  test.each([
    ["feat(editor): Add dark mode toggle"],
    ["fix!: Remove deprecated v1 endpoint"],
    ["chore: Update dependencies"],
    ["feat(api)!: Remove deprecated v1 endpoints"],
  ])("accepts %s", async (title) => {
    const r = await run([title]);
    expect(r.code, `a title the skill's own Examples section shows was rejected: ${r.stderr}`).toBe(0);
  });

  test.each([
    ["no type at all", "Add dark mode toggle"],
    ["an unknown type", "feet(editor): Add dark mode"],
    ["a trailing period", "feat: Add dark mode."],
    ["no summary", "feat(editor):"],
  ])("rejects %s", async (_label, title) => {
    const r = await run([title]);
    expect(
      r.code,
      `${JSON.stringify(title)} was accepted. The skill runs this before \`gh pr create\`, so a ` +
        "title that passes here and fails the repository's CI produces a red PR that has already " +
        "pinged its reviewers.",
    ).toBe(1);
  });

  test("--types narrows the accepted vocabulary", async () => {
    expect((await run(["docs: Update the readme", "--types", "feat,fix"])).code).toBe(1);
    expect((await run(["fix: Correct the readme", "--types", "feat,fix"])).code).toBe(0);
  });

  test("--pattern overrides the built-in shape entirely", async () => {
    const r = await run(["JIRA-123 Add dark mode", "--pattern", "^[A-Z]+-[0-9]+ .+$"]);
    expect(
      r.code,
      "a repository whose convention is not Conventional Commits could not express it. Step 2 of " +
        "the skill detects the repo's own rule; without --pattern the script can only enforce the " +
        "fallback the skill is told not to assume.",
    ).toBe(0);
  });

  test("usage errors exit 2, distinct from a rejected title", async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(["a title", "extra"])).code).toBe(2);
  });

  test("--help exits 0 and documents the exit codes", async () => {
    const r = await run(["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Exit status:");
  });
});
