// SPDX-License-Identifier: Apache-2.0
/**
 * Proof that the contract can fail.
 *
 * Every check in `CHECKS` passes against every skill in this repository, which
 * is exactly what a check that does nothing also looks like. Here each check is
 * handed a skill broken in the one way it is supposed to notice, and is required
 * to throw. A check with no mutation listed fails the last test in this file, so
 * a new rule cannot be added without also showing it fires.
 */
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { type Skill, buildSkill, loadSkill } from "@testkit/repo.ts";
import { CHECKS, checkById } from "@testkit/suite.ts";

const GOOD = loadSkill("gitea-tea");

/** The same skill with its SKILL.md text rewritten. */
function mutate(edit: (raw: string) => string, path = GOOD.path): Skill {
  return buildSkill(GOOD.dir, edit(GOOD.raw), path);
}

function replaceOnce(raw: string, find: string, replacement: string): string {
  if (!raw.includes(find)) throw new Error(`mutation target not found: ${JSON.stringify(find)}`);
  return raw.replace(find, replacement);
}

/** A throwaway skill directory, for the checks that look at files on disk. */
function scratchSkill(files: Record<string, { content: string; mode?: number }>): Skill {
  const dir = mkdtempSync(join(tmpdir(), "skill-mutant-"));
  let raw = GOOD.raw;
  for (const [rel, file] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, file.content);
    if (file.mode !== undefined) chmodSync(full, file.mode);
    if (rel === "SKILL.md") raw = file.content;
  }
  writeFileSync(join(dir, "SKILL.md"), raw);
  return buildSkill(GOOD.dir, raw, dir);
}

const MUTATIONS: Record<string, () => Skill> = {
  "frontmatter/name-matches-dir": () => mutate((r) => replaceOnce(r, "name: gitea-tea", "name: gitea-cli")),
  "frontmatter/name-shape": () => mutate((r) => replaceOnce(r, "name: gitea-tea", "name: Gitea_Tea")),
  "frontmatter/description-length": () =>
    mutate((r) => r.replace(/^description: .*$/m, "description: Talks to Gitea.")),
  "frontmatter/description-is-a-trigger": () =>
    mutate((r) =>
      r.replace(
        /^description: .*$/m,
        "description: Manages issues, pull requests, labels, comments, and releases on a Gitea " +
          "server via the official tea CLI, with structured bodies, scoped labels and a " +
          "preview-and-confirm step before anything is created on the server.",
      ),
    ),
  "frontmatter/license": () => mutate((r) => replaceOnce(r, "license: Apache-2.0", "license: UNLICENSED")),
  "frontmatter/version-quoted-semver": () => mutate((r) => replaceOnce(r, 'version: "1.2.1"', "version: 1.20")),
  "structure/single-h1": () => mutate((r) => replaceOnce(r, "## Setup", "# Setup")),
  "structure/section-gotchas": () => mutate((r) => replaceOnce(r, "## Gotchas", "## Notes")),
  "structure/section-verification": () => mutate((r) => replaceOnce(r, "## Verification", "## Wrap-up")),
  "structure/gotchas-are-concrete": () =>
    mutate((r) => replaceOnce(r, "## Gotchas\n", "## Gotchas\n\n- Be careful.\n")),
  "structure/verification-is-checkable": () =>
    mutate((r) => replaceOnce(r, "## Verification\n", "## Verification\n\n- [ ] Everything looks right.\n")),
  "structure/no-filler": () =>
    mutate((r) => replaceOnce(r, "# Gitea tea\n", "# Gitea tea\n\nThis powerful tool follows best practices.\n")),
  "bundle/no-orphan-files": () =>
    mutate((r) => r.replace(/^- \*\*`scripts\/test-check-exclusive-labels\.sh`\*\*.*$/ms, "")),
  "bundle/references-resolve": () =>
    mutate((r) => replaceOnce(r, "`references/cli-reference.md`", "`references/cli-reference-v2.md`")),
  "cli/compatibility-declared": () => mutate((r) => r.replace(/^compatibility: .*$/m, "compatibility: none")),
  "cli/section-boundaries": () => mutate((r) => replaceOnce(r, "## Boundaries", "## Scope notes")),
  "cli/section-untrusted-content": () => mutate((r) => replaceOnce(r, "## Untrusted content", "## Reading output")),
  "cli/boundaries-state-both-sides": () =>
    mutate((r) => r.replace(/\*\*This skill CANNOT, or must refuse:\*\*/, "**Also worth knowing:**")),
  "cli/untrusted-content-states-the-rule": () =>
    // Whitespace-flexible: the phrase is hard-wrapped in the section this check
    // reads, and a literal replace silently hits the Verification checklist copy
    // instead — mutating a line the check never looks at and proving nothing.
    mutate((r) => {
      const mutated = r.replace(/never as\s+instructions to follow/g, "and to weigh carefully");
      if (mutated === r) throw new Error("mutation target not found: the untrusted-content rule");
      return mutated;
    }),
  "cli/mutations-have-a-way-back": () => mutate((r) => r.replace(/Rollback:/g, "Note:")),
  "cli/third-party-facts-are-checkable": () =>
    mutate((r) =>
      r
        .replace(/re-check with[^.]*\./g, "trust this.")
        .replace(/re-verify with[^.]*\./g, "trust this.")
        .replace(/at the time this skill was written/g, "always")
        .replace(/not a guarantee/g, "a guarantee"),
    ),
  "cli/scripts-are-runnable": () =>
    scratchSkill({ "scripts/check-exclusive-labels.sh": { content: "#!/bin/bash\nset -euo pipefail\n# --help\n", mode: 0o644 } }),
};

describe("every contract check fires on the defect it names", () => {
  for (const [id, build] of Object.entries(MUTATIONS)) {
    test(id, () => {
      const check = checkById(id);
      expect(
        () => check.run(GOOD),
        `${id} fails against an unmodified skill, so the mutation below proves nothing.`,
      ).not.toThrow();
      expect(
        () => check.run(build()),
        `${id} passed a skill deliberately broken in exactly the way it exists to catch. Until it ` +
          "fails here, a green suite is not evidence about this rule.",
      ).toThrow();
    });
  }
});

test("no contract check is left without a mutation", () => {
  const uncovered = CHECKS.map((c) => c.id).filter((id) => !(id in MUTATIONS));
  expect(
    uncovered,
    "these checks have never been observed to fail. Add a mutation to MUTATIONS above: a rule that " +
      "has only ever been seen passing is indistinguishable from one that cannot fail.",
  ).toEqual([]);
});
