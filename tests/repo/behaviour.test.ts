// SPDX-License-Identifier: Apache-2.0
/**
 * The behaviour layer, checked without spending anything.
 *
 * `claude plugin eval` is the only thing that can say whether a skill changes
 * what the model does, and every run of it is a real model call. Everything here
 * is what can be established for free: that the committed case tree still
 * matches the eval sets it was generated from, that the ablation markings are
 * the ones the scoring rules require, and that every case loads.
 */
import { describe, expect, test } from "vitest";

import { readRepoFile, skillNames } from "@testkit/repo.ts";
import { sh } from "@testkit/sh.ts";
import { diff, generate, loadEvalSet, onDisk } from "@testkit/gen-behaviour.ts";

const skills = skillNames();

describe("the committed cases match their source", () => {
  test("no drift between tests/skills/*/evals.ts and behaviour/", async () => {
    const drift = diff(await generate(), onDisk());
    expect(
      drift,
      "the committed behaviour tree no longer matches the eval sets it is generated from. Whichever " +
        "side was edited, the release gate is now running cases nobody reviewed. Run " +
        "`npm run test:behaviour:gen`.",
    ).toEqual({ missing: [], stale: [], extra: [] });
  });
});

describe("each skill's eval set measures precision, not only recall", () => {
  for (const skill of skills) {
    test(`${skill} has an authored eval set`, async () => {
      const set = await loadEvalSet(skill);
      expect(
        set?.cases.length ?? 0,
        `${skill} has no cases in tests/skills/${skill}/evals.ts. Without one the contract layer can ` +
          "say the skill is well-formed and nothing can say it changes what the model does.",
      ).toBeGreaterThan(0);
    });

    test(`${skill} expects to stand down in favour of a sibling`, async () => {
      const set = await loadEvalSet(skill);
      const declines = (set?.cases ?? []).filter((c) => c.tags.includes("precision"));
      expect(
        declines.length,
        `${skill} has no case tagged "precision" — none that expects it NOT to fire. A suite of ` +
          "cases that all expect the skill to answer measures recall only: a skill that fired on " +
          "every prompt in the repository would score full marks.",
      ).toBeGreaterThan(0);

      for (const c of declines) {
        const mustNotFire = c.graders.find(
          (g) => g.type === "tool_used" && g.options?.tool === "Skill" && g.options?.max === 0,
        );
        expect(
          mustNotFire,
          `${skill}'s case "${c.name}" is tagged precision but has no grader asserting the skill ` +
            "was not invoked, so nothing in it can fail when the skill fires anyway.",
        ).toBeDefined();
        expect(
          mustNotFire!.arm,
          `${skill}'s case "${c.name}" has a must-not-fire grader that is not marked \`arm: both\`. ` +
            "Left unmarked, a `tool_used: Skill` grader is excluded from the score in both arms, so " +
            "the one check that makes this case mean anything would not be scored at all.",
        ).toBe("both");
      }
    });

    test(`${skill}'s skill-fired graders are left as with-arm indicators`, async () => {
      const set = await loadEvalSet(skill);
      for (const c of set?.cases ?? []) {
        for (const g of c.graders) {
          if (g.type !== "tool_used" || g.options?.tool !== "Skill" || g.options?.max === 0) continue;
          expect(
            g.arm,
            `${skill}'s case "${c.name}" forces its skill-fired grader into the baseline arm. The ` +
              "baseline has no skill to fire, so scoring it there drives the without-arm toward zero " +
              "and inflates Δ into evidence of nothing.",
          ).toBeUndefined();
        }
      }
    });
  }

  test("a case that costs a judge call says what PASS and FAIL look like", async () => {
    for (const skill of skills) {
      const set = await loadEvalSet(skill);
      for (const c of set?.cases ?? []) {
        for (const g of c.graders.filter((g) => g.type === "llm")) {
          const body = g.body ?? "";
          expect(
            /PASS/.test(body) && /FAIL/.test(body),
            `${skill}/${c.name}/${g.name} is an llm grader whose rubric states no explicit PASS and ` +
              "FAIL condition. A small judge model asked to decide whether an answer is 'good' " +
              "returns a different verdict on wording alone, and the case's score becomes noise.",
          ).toBe(true);
        }
      }
    }
  });
});

describe("the eval directory is recorded once", () => {
  test("plugin.json points `claude plugin eval` at tests/skills", () => {
    const manifest = JSON.parse(readRepoFile("plugin.json")) as { experimental?: { evals?: string } };
    expect(
      manifest.experimental?.evals,
      "plugin.json does not record the eval directory, so a bare `claude plugin eval .` — the " +
        "invocation the documentation gives — looks in `evals/`, finds nothing, and reports a " +
        "suite of zero cases as if the repository had none.",
    ).toBe("tests/skills");
  });

  test("the npm scripts pass the same directory the manifest names", () => {
    const pkg = JSON.parse(readRepoFile("package.json")) as { scripts: Record<string, string> };
    const manifest = JSON.parse(readRepoFile("plugin.json")) as { experimental?: { evals?: string } };
    for (const [name, script] of Object.entries(pkg.scripts)) {
      const flag = script.match(/--eval-dir\s+(\S+)/)?.[1];
      if (!flag) continue;
      expect(
        flag,
        `npm script "${name}" passes --eval-dir ${flag} while plugin.json names ` +
          `${manifest.experimental?.evals}. The flag wins, so the two disagreeing means the suite a ` +
          "collaborator runs by hand is not the suite CI runs.",
      ).toBe(manifest.experimental?.evals);
    }
  });
});

describe("the suite loads", () => {
  test("`claude plugin eval --max-cost-usd 0` loads every case and spends nothing", async () => {
    const probe = await sh("sh", ["-c", "command -v claude || true"]);
    if (!probe.stdout.trim()) {
      console.warn("claude CLI not installed; the eval suite was not loaded");
      return;
    }
    const run = await sh(
      "claude",
      ["plugin", "eval", ".", "--eval-dir", "tests/skills", "--max-cost-usd", "0", "--trust-plugin"],
      { timeoutMs: 180_000 },
    );
    const output = run.stdout + run.stderr;

    expect(
      /failed to load/.test(output),
      `a case file failed to load:\n${output}\nA case that does not load is silently not run, so ` +
        "the gate reports on a suite smaller than the one in the repository.",
    ).toBe(false);

    const expected = (await generate()).size;
    const cases = [...(await generate()).keys()].filter((p) => p.endsWith("prompt.md")).length;
    expect(expected).toBeGreaterThan(0);
    expect(
      output,
      `the run did not report ${cases} cases. --max-cost-usd 0 is the free validation of this ` +
        "suite; if the count is wrong, cases are being skipped before anyone pays to find out.",
    ).toContain(`× ${cases} cases`);
  }, 200_000);
});
