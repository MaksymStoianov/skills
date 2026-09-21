// SPDX-License-Identifier: Apache-2.0
/**
 * `describeSkill()` — the contract every skill in this repository is held to.
 *
 * The skill is the unit under test. `tests/skills/<name>/contract.test.ts` is a
 * thin file that names the skill and adds whatever is true only of that skill;
 * everything shared lives here, so a new rule lands in one place.
 *
 * The contract is family-aware: a skill that shells out to a third-party CLI
 * carries obligations (boundaries, rollback, untrusted-output handling) that an
 * authoring skill has no way to satisfy, and holding the second to the first's
 * rules would be a check firing on correct content.
 *
 * Checks are values, not `test()` calls: `describeSkill` wraps each one in a
 * vitest test, and `tests/repo/contract-fires.test.ts` runs them directly
 * against deliberately broken skills to prove each can fail.
 */

import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  type Family,
  type Skill,
  codeBlocks,
  isQuotedInSource,
  loadSkill,
  proseOnly,
  section,
} from "./repo.ts";

/** Every threshold the contract enforces, in one place. */
export const LIMITS = {
  /** Agent Skills spec: `name` is at most 64 characters. */
  nameMaxChars: 64,
  /** Agent Skills spec: `description` is at most 1024 characters. */
  descriptionMaxChars: 1024,
  /** A description shorter than this cannot carry both capability and trigger. */
  descriptionMinChars: 120,
  /** Below this a Gotchas section is decoration rather than a warning. */
  minGotchas: 3,
  /** A gotcha shorter than this names a caution, not a symptom. */
  gotchaMinChars: 40,
  /** Below this a Verification section cannot cover a multi-step procedure. */
  minVerificationItems: 4,
  /** A checklist item shorter than this is a label, not a check. */
  verificationItemMinChars: 25,
  /** Below this a Boundaries table is an example rather than a rule set. */
  minBoundaryRows: 3,
  /** SPDX id every licence field in the repository must carry. */
  spdxId: "Apache-2.0",
  /** Required sections for every skill, whatever its family. */
  requiredSections: ["Gotchas", "Verification"] as const,
  /** Extra sections a skill that drives a third-party CLI must carry. */
  cliWrapperSections: ["Boundaries", "Untrusted content"] as const,
} as const;

/** Prose that reads as marketing or throat-clearing rather than instruction. */
export const FILLER_PHRASES = [
  "best practices",
  "cutting-edge",
  "state-of-the-art",
  "seamlessly",
  "robust solution",
  "powerful tool",
  "it is important to note",
  "as we all know",
  "in today's world",
  "leverage the power",
];

/** Verification items that cannot come back false. */
export const UNFALSIFIABLE_PHRASES = [
  "looks right",
  "looks good",
  "double-check everything",
  "make sure everything",
  "seems correct",
  "no issues",
];

/**
 * Phrases that declare a third-party fact unpinnable — the author saying "this
 * was true when checked, here is how to re-establish it" instead of asserting it
 * indefinitely. A stated exception is auditable; silence looks identical to an
 * oversight.
 */
export const FRESHNESS_DECLARATIONS = [
  "at the time this skill was written",
  "at the time of writing",
  "re-check",
  "re-verify",
  "check with",
  "confirm with",
  "not a guarantee",
];

// --- text helpers ----------------------------------------------------------

/** Drop fenced blocks but keep inline code spans. */
export function stripFences(markdown: string): string {
  return markdown.replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, "");
}

/** Fenced blocks tagged as shell, wherever they are indented. */
export function shellBlocks(markdown: string): string[] {
  const out: string[] = [];
  const re = /^[ \t]*```(?:bash|sh|shell)[ \t]*\n([\s\S]*?)^[ \t]*```/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) out.push(m[1]);
  return out;
}

function bullets(content: string): string[] {
  return stripFences(content)
    .split("\n")
    .filter((l) => /^\s*-\s+(?!\[[ x]\])/.test(l))
    .map((l) => l.replace(/^\s*-\s+/, "").trim())
    .filter(Boolean);
}

function checkboxes(content: string): string[] {
  return content
    .split("\n")
    .filter((l) => /^\s*-\s+\[[ x]\]/.test(l))
    .map((l) => l.replace(/^\s*-\s+\[[ x]\]\s*/, "").trim())
    .filter(Boolean);
}

/** Paths the SKILL.md points at: markdown links and backticked bundle paths. */
export function referencedPaths(skill: Skill): string[] {
  const out = new Set<string>();
  const link = /\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = link.exec(skill.body)) !== null) {
    const target = m[1].split("#")[0].trim();
    if (target && !/^[a-z]+:/i.test(target)) out.add(target.replace(/^\.\//, ""));
  }
  const code = /`([^`\n]+)`/g;
  while ((m = code.exec(skill.body)) !== null) {
    const t = m[1].trim();
    if (/^(references|scripts|assets)\/\S+$/.test(t)) out.add(t.replace(/\/$/, ""));
  }
  return [...out].sort();
}

function exists(root: string, relative: string): boolean {
  try {
    statSync(join(root, relative));
    return true;
  } catch {
    return false;
  }
}

// --- the contract ----------------------------------------------------------

export interface Check {
  /** Stable id, so a mutation test can name the check it expects to fire. */
  id: string;
  group: string;
  title: string;
  /** Families this check applies to; omitted means every family. */
  families?: Family[];
  run(skill: Skill): void;
}

export const CHECKS: Check[] = [
  {
    id: "frontmatter/name-matches-dir",
    group: "frontmatter",
    title: "`name` matches the directory the skill is loaded from",
    run(skill) {
      expect(
        skill.data.name,
        `frontmatter name is ${JSON.stringify(skill.data.name)} but the directory is ` +
          `"${skill.dir}"; an agent resolves a skill by directory and reports it by name, so the ` +
          "two disagreeing means every reference to this skill points somewhere the user cannot find.",
      ).toBe(skill.dir);
    },
  },
  {
    id: "frontmatter/name-shape",
    group: "frontmatter",
    title: "`name` is kebab-case and within the spec's length limit",
    run(skill) {
      const name = String(skill.data.name);
      expect(
        /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name),
        `name ${JSON.stringify(name)} is not kebab-case; the loader derives paths and invocation ` +
          "names from it, so an underscore or a capital makes the skill unaddressable.",
      ).toBe(true);
      expect(
        name.length,
        `name is ${name.length} characters; the Agent Skills spec caps it at ${LIMITS.nameMaxChars}, ` +
          "and a loader that enforces the cap rejects the skill outright.",
      ).toBeLessThanOrEqual(LIMITS.nameMaxChars);
    },
  },
  {
    id: "frontmatter/description-length",
    group: "frontmatter",
    title: "`description` is long enough to route on and inside the spec's cap",
    run(skill) {
      const d = String(skill.data.description ?? "");
      expect(
        d.length,
        `description is ${d.length} characters; under ${LIMITS.descriptionMinChars} it cannot state ` +
          "both what the skill does and when to reach for it, so the agent never loads it at the " +
          "right moment.",
      ).toBeGreaterThanOrEqual(LIMITS.descriptionMinChars);
      expect(
        d.length,
        `description is ${d.length} characters; the Agent Skills spec caps it at ` +
          `${LIMITS.descriptionMaxChars}, past which a loader may truncate or reject it.`,
      ).toBeLessThanOrEqual(LIMITS.descriptionMaxChars);
    },
  },
  {
    id: "frontmatter/description-is-a-trigger",
    group: "frontmatter",
    title: "`description` states triggers, not only a capability summary",
    run(skill) {
      const d = String(skill.data.description ?? "");
      expect(
        /\buse (this )?(skill )?when\b|\bwhen the user\b|\btrigger(s|ed)? on\b/i.test(d),
        "description never says when to fire. A description is a trigger, not a summary: without " +
          "an explicit 'Use when …' clause the routing logic has only vocabulary overlap to go on, " +
          "and reaches for whichever sibling shares more words.",
      ).toBe(true);
    },
  },
  {
    id: "frontmatter/license",
    group: "frontmatter",
    title: `license is the repository's SPDX id (${LIMITS.spdxId})`,
    run(skill) {
      expect(
        skill.data.license,
        `SKILL.md frontmatter declares license ${JSON.stringify(skill.data.license)}. A consumer ` +
          "who vendors this directory on its own reads its licence from here; a missing or " +
          "divergent id leaves them with a file whose terms they cannot establish.",
      ).toBe(LIMITS.spdxId);
    },
  },
  {
    id: "frontmatter/version-quoted-semver",
    group: "frontmatter",
    title: "`metadata.version` is a quoted semver string",
    run(skill) {
      const meta = skill.data.metadata;
      expect(
        typeof meta === "object" && meta !== null,
        "no `metadata:` map in frontmatter; without a version there is no way to tell a consumer " +
          "which revision of this skill they have.",
      ).toBe(true);
      const version = (meta as Record<string, string>).version;
      expect(
        /^\d+\.\d+\.\d+$/.test(String(version)),
        `metadata.version is ${JSON.stringify(version)}, which is not semver; consumers compare ` +
          "versions to decide whether to update, and a non-semver value makes that comparison " +
          "meaningless.",
      ).toBe(true);
      expect(
        isQuotedInSource(skill.raw, ["metadata", "version"]),
        `metadata.version ${JSON.stringify(version)} is unquoted. YAML reads a bare 1.20 as the ` +
          "number 1.2, so an unquoted version silently loses its trailing zero on the next bump.",
      ).toBe(true);
    },
  },
  {
    id: "structure/single-h1",
    group: "structure",
    title: "body opens with exactly one H1",
    run(skill) {
      const h1 = stripFences(skill.body)
        .split("\n")
        .filter((l) => /^# \S/.test(l));
      expect(
        h1.length,
        `found ${h1.length} H1 headings (${h1.join(" | ")}). The body is injected into a prompt ` +
          "whole; a second H1 reads to the model as a second document and its content gets " +
          "attributed to the wrong skill.",
      ).toBe(1);
      expect(
        /^# \S/.test(skill.body),
        "the body does not start with its H1; anything above the title is prose no heading owns.",
      ).toBe(true);
    },
  },
  ...LIMITS.requiredSections.map(
    (title): Check => ({
      id: `structure/section-${title.toLowerCase().replace(/\s+/g, "-")}`,
      group: "structure",
      title: `has a \`## ${title}\` section`,
      run(skill) {
        expect(
          section(skill, title),
          `no \`## ${title}\` section. Every skill here carries one; a reader who has learned the ` +
            "shape of this collection will look for it, not find it, and assume the skill has " +
            "nothing to say there.",
        ).toBeDefined();
      },
    }),
  ),
  {
    id: "structure/gotchas-are-concrete",
    group: "structure",
    title: "`## Gotchas` names concrete failure symptoms",
    run(skill) {
      const items = bullets(section(skill, "Gotchas")?.content ?? "");
      expect(
        items.length,
        `only ${items.length} gotchas. Gotchas are the highest-value section in a skill: they are ` +
          "the traps a competent reader would otherwise pay for by hitting them.",
      ).toBeGreaterThanOrEqual(LIMITS.minGotchas);
      for (const item of items) {
        expect(
          item.length,
          `gotcha ${JSON.stringify(item)} is too short to name a symptom; a one-line caution tells ` +
            "the reader to be careful without telling them what going wrong looks like.",
        ).toBeGreaterThan(LIMITS.gotchaMinChars);
      }
    },
  },
  {
    id: "structure/verification-is-checkable",
    group: "structure",
    title: "`## Verification` items are checkable",
    run(skill) {
      const items = checkboxes(section(skill, "Verification")?.content ?? "");
      expect(
        items.length,
        `only ${items.length} verification checkboxes. A checklist shorter than the procedure ` +
          "cannot confirm the procedure ran.",
      ).toBeGreaterThanOrEqual(LIMITS.minVerificationItems);
      for (const item of items) {
        expect(
          item.length,
          `verification item ${JSON.stringify(item)} is a label, not a check; there is nothing in ` +
            "it to go and look at.",
        ).toBeGreaterThanOrEqual(LIMITS.verificationItemMinChars);
        const lower = item.toLowerCase();
        for (const phrase of UNFALSIFIABLE_PHRASES) {
          expect(
            lower.includes(phrase),
            `verification item ${JSON.stringify(item)} contains ${JSON.stringify(phrase)}, which ` +
              "cannot come back false. An unfalsifiable item is always ticked and therefore checks " +
              "nothing.",
          ).toBe(false);
        }
      }
    },
  },
  {
    id: "structure/no-filler",
    group: "structure",
    title: "prose carries no marketing filler",
    run(skill) {
      const text = proseOnly(skill.body).toLowerCase();
      for (const phrase of FILLER_PHRASES) {
        expect(
          text.includes(phrase),
          `body contains ${JSON.stringify(phrase)}. The body is spent context: every sentence that ` +
            "says nothing the agent did not already know displaces one that would have.",
        ).toBe(false);
      }
    },
  },
  {
    id: "bundle/no-orphan-files",
    group: "bundle",
    title: "every bundled file is introduced in the body",
    run(skill) {
      const bundled = skill.files.filter((f) => f !== "SKILL.md");
      const mentioned = new Set(referencedPaths(skill));
      const introduced = (f: string): boolean => {
        if (mentioned.has(f)) return true;
        const parts = f.split("/");
        for (let i = parts.length - 1; i > 0; i--) {
          const prefix = parts.slice(0, i).join("/");
          if (mentioned.has(prefix) || mentioned.has(`${prefix}/`)) return true;
        }
        return false;
      };
      expect(
        bundled.filter((f) => !introduced(f)),
        "these files sit in the skill directory but are never named in SKILL.md. Progressive " +
          "disclosure only works if the body says what exists and when to load it; an unmentioned " +
          "file is shipped weight the agent will never open.",
      ).toEqual([]);
    },
  },
  {
    id: "bundle/references-resolve",
    group: "bundle",
    title: "every path the body points at exists",
    run(skill) {
      const missing = referencedPaths(skill).filter((p) => !exists(skill.path, p));
      expect(
        missing,
        "SKILL.md points at these paths and they are not in the skill directory. A reference that " +
          "does not resolve sends the agent to read a file that is not there, and it continues " +
          "without the content the body said it needed.",
      ).toEqual([]);
    },
  },

  // --- cli-wrapper family --------------------------------------------------

  {
    id: "cli/compatibility-declared",
    group: "cli-wrapper family",
    title: "`compatibility` names what has to be installed",
    families: ["cli-wrapper"],
    run(skill) {
      const compat = skill.data.compatibility;
      expect(
        typeof compat === "string" && compat.length > 20,
        "a skill that shells out to a third-party binary has no `compatibility:` line. The agent " +
          "discovers the missing dependency by running a command that fails, which reads as the " +
          "skill being broken rather than the tool being absent.",
      ).toBe(true);
    },
  },
  ...LIMITS.cliWrapperSections.map(
    (title): Check => ({
      id: `cli/section-${title.toLowerCase().replace(/\s+/g, "-")}`,
      group: "cli-wrapper family",
      title: `has a \`## ${title}\` section`,
      families: ["cli-wrapper"],
      run(skill) {
        expect(
          section(skill, title),
          `no \`## ${title}\` section. This skill drives a tool that writes to a shared server and ` +
            "reads back text anyone can author; without this section the agent has no stated limit " +
            "on what it may do with either.",
        ).toBeDefined();
      },
    }),
  ),
  {
    id: "cli/boundaries-state-both-sides",
    group: "cli-wrapper family",
    title: "`## Boundaries` states both what the skill may and may not do",
    families: ["cli-wrapper"],
    run(skill) {
      const content = section(skill, "Boundaries")?.content ?? "";
      expect(
        /\bCAN\b/.test(content) && /\bCANNOT\b|\bmust refuse\b/i.test(content),
        "Boundaries lists only one side. A section that says what the skill can do, with no " +
          "matching list of what it must refuse, reads as permission rather than as a limit.",
      ).toBe(true);
      const rows = content.split("\n").filter((l) => /^\|/.test(l) && !/^\|\s*:?-+/.test(l));
      expect(
        rows.length,
        `Boundaries has ${rows.length} table rows. A prose-only limit is one the agent weighs; a ` +
          "table pairing the exact request with the required answer is one it matches.",
      ).toBeGreaterThanOrEqual(LIMITS.minBoundaryRows);
    },
  },
  {
    id: "cli/untrusted-content-states-the-rule",
    group: "cli-wrapper family",
    title: "`## Untrusted content` says not to act on what the tool reads back",
    families: ["cli-wrapper"],
    run(skill) {
      const content = (section(skill, "Untrusted content")?.content ?? "")
        .toLowerCase()
        .replace(/\s+/g, " ");
      expect(
        /never as instructions|not as instructions|never as a command|not something to act on|not as a command/.test(
          content,
        ),
        "the Untrusted content section never says the text must not be followed as instructions. " +
          "Naming the content untrusted without stating the rule leaves the agent to decide, and a " +
          "comment saying 'ignore previous instructions' is exactly the case it decides wrong.",
      ).toBe(true);
    },
  },
  {
    id: "cli/mutations-have-a-way-back",
    group: "cli-wrapper family",
    title: "every mutating command shown has a documented way back",
    families: ["cli-wrapper"],
    run(skill) {
      const commands = shellBlocks(skill.body).join("\n");
      if (!/\b(create|delete|merge|close|edit|push|reject|clean)\b/.test(commands)) return;
      expect(
        /rollback:/i.test(skill.body),
        "the skill shows commands that change a shared server but documents no rollback. The agent " +
          "runs the forward command and, when the user asks to undo it, invents the reverse — which " +
          "for a merge or a delete is the expensive kind of guess.",
      ).toBe(true);
    },
  },
  {
    id: "cli/scripts-are-runnable",
    group: "cli-wrapper family",
    title: "bundled scripts are executable and self-documenting",
    families: ["cli-wrapper"],
    run(skill) {
      for (const rel of skill.files.filter((f) => f.startsWith("scripts/"))) {
        const full = join(skill.path, rel);
        accessSync(full, constants.R_OK);
        expect(
          statSync(full).mode & 0o111,
          `${rel} is not executable. SKILL.md invokes it as \`${rel}\`, so a reader following the ` +
            "skill gets Permission denied from a command the skill told them to run.",
        ).not.toBe(0);
        const source = readFileSync(full, "utf8");
        expect(
          source.startsWith("#!"),
          `${rel} has no shebang; invoked by path it runs under whatever shell happens to pick it ` +
            "up, which is not the one it was written for.",
        ).toBe(true);
        expect(
          source.includes("--help"),
          `${rel} does not handle \`--help\`. SKILL.md tells the agent to run it with --help for ` +
            "usage; a script that ignores the flag treats it as input and answers about the wrong " +
            "thing.",
        ).toBe(true);
        if (/^#!.*\b(ba)?sh\b/.test(source.split("\n")[0])) {
          const setLine = source.match(/^set -\S+( \S+)*$/m)?.[0] ?? "";
          expect(
            /-\w*u/.test(setLine) && /pipefail/.test(setLine),
            `${rel} does not \`set -u\` and \`set -o pipefail\` (found ${JSON.stringify(setLine)}). ` +
              "An unset variable expands to the empty string and a failing command mid-pipe is " +
              "masked by the exit status of the last one, so the script reports success on input " +
              "it never actually processed.",
          ).toBe(true);
          // `-e` is required everywhere except a test runner, which has to
          // survive a failing case in order to report it.
          if (!rel.split("/").pop()!.startsWith("test-")) {
            expect(
              /-\w*e/.test(setLine),
              `${rel} does not \`set -e\` (found ${JSON.stringify(setLine)}); a failing command in ` +
                "the middle leaves the script running on state it never produced and exiting 0.",
            ).toBe(true);
          }
        }
      }
    },
  },
  {
    id: "cli/third-party-facts-are-checkable",
    group: "cli-wrapper family",
    title: "third-party facts are pinned or declared checkable",
    families: ["cli-wrapper"],
    run(skill) {
      const lower = proseOnly(section(skill, "Gotchas")?.content ?? "").toLowerCase();
      expect(
        FRESHNESS_DECLARATIONS.some((p) => lower.includes(p)),
        "no gotcha tells the reader how to re-establish a claim about the third-party CLI. Flag " +
          "surfaces move without notice; a paraphrase with no stated way to re-check ages into a " +
          "confident wrong answer that reads exactly like a correct one.",
      ).toBe(true);
    },
  },
];

/** The checks that apply to a given family. */
export function checksFor(family: Family): Check[] {
  return CHECKS.filter((c) => !c.families || c.families.includes(family));
}

export function checkById(id: string): Check {
  const found = CHECKS.find((c) => c.id === id);
  if (!found) throw new Error(`no contract check with id ${JSON.stringify(id)}`);
  return found;
}

// --- entry point -----------------------------------------------------------

export interface SkillContext {
  skill: Skill;
  test: typeof test;
  expect: typeof expect;
  /** Fenced shell blocks in the body, for skill-specific assertions. */
  shellBlocks: () => string[];
  /** Fenced blocks of every language. */
  codeBlocks: () => string[];
}

export function describeSkill(name: string, extra?: (ctx: SkillContext) => void): void {
  const skill = loadSkill(name);
  describe(`${name} (${skill.family})`, () => {
    const byGroup = new Map<string, Check[]>();
    for (const check of checksFor(skill.family)) {
      const list = byGroup.get(check.group) ?? [];
      list.push(check);
      byGroup.set(check.group, list);
    }
    for (const [group, checks] of byGroup) {
      describe(group, () => {
        for (const check of checks) test(check.title, () => check.run(skill));
      });
    }
    extra?.({
      skill,
      test,
      expect,
      shellBlocks: () => shellBlocks(skill.body),
      codeBlocks: () => codeBlocks(skill.body),
    });
  });
}
