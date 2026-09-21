// SPDX-License-Identifier: Apache-2.0
/**
 * `scripts/check-exclusive-labels.sh`, against the contract its own header
 * states. The skill tells the agent to gate a `tea` call on this script's exit
 * status, so an exit code that drifts from the documented one does not fail —
 * it applies a conflicting label set and reports success.
 */
import { describe, expect, test } from "vitest";

import { loadSkill } from "@testkit/repo.ts";
import { runSkillScript } from "@testkit/sh.ts";

const skill = loadSkill("gitea-tea");
const SCRIPT = "scripts/check-exclusive-labels.sh";
const run = (args: string[]) => runSkillScript(skill.path, SCRIPT, args);

describe("check-exclusive-labels.sh", () => {
  test("exits 0 when no two labels share a scope", async () => {
    const r = await run(["Kind/Bug,Priority/High"]);
    expect(r.code, `expected 0 for a conflict-free set, got ${r.code}: ${r.stderr}`).toBe(0);
  });

  test("exits 2 and names the scope when two labels collide", async () => {
    const r = await run(["Kind/Bug,Kind/Feature"]);
    expect(
      r.code,
      "a conflicting label set passed the gate. The skill runs this script with `&&` before `tea`, " +
        "so a wrong exit code here means the conflicting set is sent and the server silently drops " +
        "one of the two labels.",
    ).toBe(2);
    expect(r.stderr, "the conflict was reported without naming the scope it is in").toContain("Kind");
  });

  test("the scope is everything before the LAST slash, as Gitea defines it", async () => {
    expect((await run(["scope/sub/a,scope/sub/b"])).code, "nested scopes were not compared as one scope").toBe(2);
    expect(
      (await run(["a/x,b/x"])).code,
      "two labels with the same leaf but different scopes were reported as conflicting; the check " +
        "would block a label set that is perfectly legal.",
    ).toBe(0);
  });

  test("a label with no slash has no scope and is never flagged", async () => {
    expect((await run(["duplicate,duplicate"])).code).toBe(0);
  });

  test("bad usage exits 1, distinct from a conflict", async () => {
    expect((await run([])).code).toBe(1);
    expect((await run([""])).code).toBe(1);
    expect((await run(["a", "b"])).code).toBe(1);
  });

  test("--help exits 0 and prints the usage line", async () => {
    const r = await run(["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Usage:");
    expect(r.stdout, "the help text does not document the exit codes it is gated on").toContain("Exit codes:");
  });

  test("a label crafted as Python source is data, not code", async () => {
    // The vector this script was fixed for: the argument used to be spliced
    // into a `python3 -c` program, so a quote in a label name ended the string
    // literal and everything after it ran.
    const payload = `x', file=__import__('sys').stderr); __import__('sys').exit(99) #`;
    const r = await run([payload]);
    expect(
      r.code,
      `the injected payload chose the exit code (${r.code}). A label name comes from whatever the ` +
        "agent was asked to apply, so an injection here runs attacker-chosen code on the " +
        "developer's machine.",
    ).not.toBe(99);
    expect([0, 2]).toContain(r.code);
  });

  test("the repository's own regression suite for this script still passes", async () => {
    const r = await runSkillScript(skill.path, "scripts/test-check-exclusive-labels.sh", []);
    expect(r.code, `the bundled regression suite failed:\n${r.stdout}\n${r.stderr}`).toBe(0);
  });
});
