// SPDX-License-Identifier: Apache-2.0
import { describeSkill } from "@testkit/suite.ts";

describeSkill("gitea-tea", ({ skill, test, expect, shellBlocks }) => {
  test("every label-editing example on an existing issue avoids the bare `--labels` flag", () => {
    // The skill's own first gotcha: `tea issues edit` has no `--labels`. An
    // example that uses it teaches the exact failure the gotcha warns about.
    for (const block of shellBlocks()) {
      for (const line of block.split("\n")) {
        if (!/tea (issues?|pulls?) edit\b/.test(line)) continue;
        expect(
          / --labels\b/.test(line),
          `example \`${line.trim()}\` passes --labels to an edit subcommand, which tea rejects as ` +
            "an unknown flag. The skill's own Gotchas say so; an example that contradicts it is the " +
            "line the agent will copy.",
        ).toBe(false);
      }
    }
  });

  test("the exclusive-label claim is stated as needing the web UI, not the CLI", () => {
    expect(
      /web ui/i.test(skill.body),
      "the skill never says the Exclusive toggle lives in the Gitea web UI. tea has no --exclusive " +
        "flag, so an agent that believes otherwise reports a scope as exclusive when nothing made " +
        "it so, and the next conflicting label is applied silently.",
    ).toBe(true);
  });
});
