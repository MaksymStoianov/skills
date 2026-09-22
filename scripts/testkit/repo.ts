// SPDX-License-Identifier: Apache-2.0
/**
 * Repository model for the test suite: where the skills are, what is in them,
 * and which family each one belongs to.
 *
 * The frontmatter parser below is written INDEPENDENTLY of anything the
 * repository ships. A test that parses a skill with the same code the skill is
 * validated by can never catch that code being wrong: both sides agree by
 * construction. This parser accepts only the subset of YAML a SKILL.md is
 * allowed to use and rejects everything else loudly, so an unparseable
 * frontmatter is a test failure rather than a silently empty object.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
export const SKILLS_DIR = join(REPO_ROOT, "skills");

// --- frontmatter -----------------------------------------------------------

export type FrontmatterValue = string | Record<string, string>;
export type Frontmatter = Record<string, FrontmatterValue>;

export interface ParsedDocument {
  /** Parsed frontmatter keys, in file order. */
  data: Frontmatter;
  /** Top-level keys in the order they appeared, so order can be asserted. */
  keys: string[];
  /** Everything after the closing `---`, with no leading blank line. */
  body: string;
  /** 1-based line number of the first body line, for error messages. */
  bodyStartLine: number;
}

export class FrontmatterError extends Error {}

/** Strip one layer of matching quotes; report whether the value was quoted. */
function unquote(raw: string): { value: string; quoted: boolean } {
  const t = raw.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return { value: t.slice(1, -1), quoted: true };
  }
  return { value: t, quoted: false };
}

/**
 * Parse `---`-delimited frontmatter at the head of a markdown document.
 *
 * Accepted: `key: value` at column 0, and one level of nesting where a key with
 * an empty value is followed by exactly-two-space-indented `key: value` lines.
 * Rejected: tabs, lists, block scalars, deeper nesting, duplicate keys, and a
 * missing or unterminated delimiter.
 */
export function parseFrontmatter(text: string): ParsedDocument {
  if (text.includes("\r")) {
    throw new FrontmatterError("file uses CRLF line endings; SKILL.md must be LF-only");
  }
  const lines = text.split("\n");
  if (lines[0] !== "---") {
    throw new FrontmatterError("file does not open with a `---` frontmatter delimiter on line 1");
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) {
    throw new FrontmatterError("frontmatter is never closed by a `---` line");
  }

  const data: Frontmatter = {};
  const keys: string[] = [];
  let currentParent: string | null = null;

  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    if (line.trim() === "") {
      currentParent = null;
      continue;
    }
    if (line.includes("\t")) {
      throw new FrontmatterError(`line ${lineNo}: frontmatter contains a tab; YAML forbids tabs for indentation`);
    }
    if (line.startsWith("- ")) {
      throw new FrontmatterError(`line ${lineNo}: block sequences are not part of the accepted frontmatter subset`);
    }

    const indent = line.length - line.trimStart().length;
    const colon = line.indexOf(":");
    if (colon === -1) {
      throw new FrontmatterError(`line ${lineNo}: no \`key: value\` separator in ${JSON.stringify(line)}`);
    }
    const key = line.slice(indent, colon).trim();
    const rest = line.slice(colon + 1);
    if (key === "") {
      throw new FrontmatterError(`line ${lineNo}: empty key in ${JSON.stringify(line)}`);
    }
    if (rest !== "" && !rest.startsWith(" ")) {
      throw new FrontmatterError(`line ${lineNo}: \`${key}:\` needs a space after the colon`);
    }

    if (indent === 0) {
      const { value } = unquote(rest);
      if (value === "") {
        if (key in data) throw new FrontmatterError(`line ${lineNo}: duplicate key \`${key}\``);
        data[key] = {};
        keys.push(key);
        currentParent = key;
      } else {
        if (key in data) throw new FrontmatterError(`line ${lineNo}: duplicate key \`${key}\``);
        if (value === "|" || value === ">" || value.startsWith("|") || value.startsWith(">")) {
          throw new FrontmatterError(`line ${lineNo}: block scalars are not part of the accepted frontmatter subset`);
        }
        data[key] = value;
        keys.push(key);
        currentParent = null;
      }
      continue;
    }

    if (indent !== 2) {
      throw new FrontmatterError(`line ${lineNo}: expected 0 or 2 spaces of indentation, found ${indent}`);
    }
    if (currentParent === null) {
      throw new FrontmatterError(`line ${lineNo}: indented \`${key}:\` has no parent key above it`);
    }
    const parent = data[currentParent];
    if (typeof parent === "string") {
      throw new FrontmatterError(`line ${lineNo}: \`${currentParent}\` already has a scalar value, so it cannot also be a map`);
    }
    if (key in parent) {
      throw new FrontmatterError(`line ${lineNo}: duplicate key \`${currentParent}.${key}\``);
    }
    parent[key] = unquote(rest).value;
  }

  let bodyStart = end + 1;
  while (bodyStart < lines.length && lines[bodyStart].trim() === "") bodyStart++;
  return {
    data,
    keys,
    body: lines.slice(bodyStart).join("\n"),
    bodyStartLine: bodyStart + 1,
  };
}

/** True when the raw frontmatter value was written quoted (`version: "1.2.1"`). */
export function isQuotedInSource(text: string, path: string[]): boolean {
  const lines = text.split("\n");
  const indent = "  ".repeat(path.length - 1);
  const needle = `${indent}${path[path.length - 1]}:`;
  for (const line of lines) {
    if (line.startsWith(needle)) return unquote(line.slice(needle.length)).quoted;
  }
  return false;
}

// --- sections --------------------------------------------------------------

export interface Section {
  title: string;
  /** Body of the section, excluding its own `## ` heading line. */
  content: string;
}

/**
 * Split a markdown body into its `## ` sections.
 *
 * Deliberately a line walk and not a lookahead regex, for two reasons. Under the
 * `m` flag `$` matches at the first newline, so `/^## (.+)\n([\s\S]*?)(?=^## |$)/m`
 * matches an empty string for every section and quietly reports that every
 * skill's prose is blank — every content check then passes by measuring nothing.
 * And a `## ` line inside a fenced block is a shell comment, not a heading:
 * splitting on it cuts a section in half at a line the author never wrote as one.
 */
export function extractSections(body: string): Section[] {
  const out: Section[] = [];
  let current: { title: string; lines: string[] } | null = null;
  let fence: string | null = null;

  for (const line of body.split("\n")) {
    const fenceMatch = line.match(/^[ \t]*(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
    }
    if (fence === null && line.startsWith("## ")) {
      if (current) out.push({ title: current.title, content: current.lines.join("\n").trimEnd() });
      current = { title: line.slice(3).trim(), lines: [] };
      continue;
    }
    current?.lines.push(line);
  }
  if (current) out.push({ title: current.title, content: current.lines.join("\n").trimEnd() });
  return out;
}

/** Fenced code blocks, so prose checks can exclude them (and vice versa). */
export function codeBlocks(markdown: string): string[] {
  const out: string[] = [];
  const re = /^```[^\n]*\n([\s\S]*?)^```/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) out.push(m[1]);
  return out;
}

/** The same text with every fenced block and inline-code span removed. */
export function proseOnly(markdown: string): string {
  return markdown.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");
}

// --- skills ----------------------------------------------------------------

export type Family = "cli-wrapper" | "authoring";

export interface Skill {
  /** Directory name under `skills/`, which must equal frontmatter `name`. */
  dir: string;
  path: string;
  skillMdPath: string;
  raw: string;
  data: Frontmatter;
  keys: string[];
  body: string;
  sections: Section[];
  /** Every file in the skill directory, repo-relative, sorted. */
  files: string[];
  family: Family;
}

function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(full.slice(base.length + 1));
  }
  return out.sort();
}

/**
 * Family is derived from what the skill actually is, never from a hand-written
 * list: a skill whose `compatibility:` names an external binary it shells out to
 * is held to the CLI-wrapper contract (boundaries, rollback, untrusted output);
 * anything else is held only to the shared contract.
 */
export function classifyFamily(data: Frontmatter, body: string): Family {
  const compat = typeof data.compatibility === "string" ? data.compatibility : "";
  const mentionsCli = /\bCLI\b|\bcommand line\b/i.test(compat);
  const hasShellExamples = /^\s*```(bash|sh|shell)\s*$/m.test(body);
  return mentionsCli && hasShellExamples ? "cli-wrapper" : "authoring";
}

export function skillNames(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => {
      try {
        return statSync(join(SKILLS_DIR, n, "SKILL.md")).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

const cache = new Map<string, Skill>();

/**
 * Build a Skill from raw text rather than from disk. The mutation tests in
 * `tests/repo/` use this to hand the contract a deliberately broken skill and
 * assert the matching check fails — a check that has never been seen to fire is
 * indistinguishable from one that cannot.
 */
export function buildSkill(dir: string, raw: string, path = join(SKILLS_DIR, dir)): Skill {
  const parsed = parseFrontmatter(raw);
  let files: string[] = [];
  try {
    files = walk(path);
  } catch {
    files = ["SKILL.md"];
  }
  return {
    dir,
    path,
    skillMdPath: join(path, "SKILL.md"),
    raw,
    data: parsed.data,
    keys: parsed.keys,
    body: parsed.body,
    sections: extractSections(parsed.body),
    files,
    family: classifyFamily(parsed.data, parsed.body),
  };
}

export function loadSkill(dir: string): Skill {
  const hit = cache.get(dir);
  if (hit) return hit;
  const path = join(SKILLS_DIR, dir);
  const skill = buildSkill(dir, readFileSync(join(path, "SKILL.md"), "utf8"), path);
  cache.set(dir, skill);
  return skill;
}

export function allSkills(): Skill[] {
  return skillNames().map(loadSkill);
}

export function section(skill: Skill, title: string): Section | undefined {
  return skill.sections.find((s) => s.title.toLowerCase() === title.toLowerCase());
}

/** Repo-root-relative read, for tests that assert on files outside `skills/`. */
export function readRepoFile(relative: string): string {
  return readFileSync(join(REPO_ROOT, relative), "utf8");
}
