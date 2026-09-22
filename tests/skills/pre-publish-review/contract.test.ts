// SPDX-License-Identifier: Apache-2.0
import { describeSkill } from "@testkit/suite.ts";

describeSkill("pre-publish-review", ({ skill, test, expect }) => {
  test("all three axes are present, because the skill's whole claim is that it covers them", () => {
    const missing = ["## A.", "## B.", "## C."].filter((h) => !skill.body.includes(h));
    expect(
      missing,
      `axis heading(s) missing (${missing.join(", ")}). The description promises rights, legality ` +
        "and inclusion; a skill that drops one still fires on requests about it and answers from " +
        "whatever the model already believed.",
    ).toEqual([]);
  });

  test("every escalation row names a professional rather than saying to seek advice", () => {
    const section = skill.body.split(/^## /m).find((s) => s.startsWith("Escalate by name"));
    expect(section, "no escalation section to check.").toBeTruthy();

    const rows = section!
      .split("\n")
      .filter((l) => l.startsWith("|") && !/^\|\s*-+/.test(l) && !/\|\s*Situation\s*\|/.test(l));
    expect(rows.length, "the escalation table has no rows.").toBeGreaterThan(0);

    const vague = rows.filter((r) => !/attorney|lawyer|counsel|specialist/i.test(r.split("|")[2] ?? ""));
    expect(
      vague,
      `escalation row(s) route nowhere nameable (${vague.map((r) => r.slice(0, 60)).join(" / ")}). ` +
        '"Seek legal advice" is what the reader already knew; the value of the row is naming which ' +
        "professional owns the question, so they can act on it today.",
    ).toEqual([]);
  });

  test("every severity bucket the answer format promises is defined", () => {
    const required = ["Blocker", "Fix before publishing", "Consider", "Clear", "Unchecked"];
    const missing = required.filter((b) => !new RegExp(`\\*\\*${b}\\*\\*`).test(skill.body));
    expect(
      missing,
      `severity bucket(s) named nowhere (${missing.join(", ")}). The output contract is the buckets; ` +
        "an undefined one gets filled by guesswork, and `Unchecked` is the one that matters most — " +
        "drop it and an unverified rule silently reads as a passed check.",
    ).toEqual([]);
  });
});
