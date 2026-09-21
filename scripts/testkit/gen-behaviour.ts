#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Generate each skill's behaviour cases from its authored eval set.
 *
 * Source: `tests/skills/<name>/evals.ts`.
 * Output: `tests/skills/<name>/behaviour/<case>/prompt.md` and `graders/*.md`,
 * which is the layout `claude plugin eval` reads.
 *
 * The generated tree is committed, so a reviewer sees the prompts and rubrics in
 * the diff rather than having to run a generator to find out what changed, and
 * `tests/repo/behaviour-drift.test.ts` fails when the tree no longer matches its
 * source.
 *
 * Usage:
 *   node scripts/testkit/gen-behaviour.ts            # write the tree
 *   node scripts/testkit/gen-behaviour.ts --check    # report drift, write nothing
 *   node scripts/testkit/gen-behaviour.ts --help
 *
 * Exit status: 0 in sync (or written), 1 drifted under --check, 2 usage error.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { REPO_ROOT, skillNames } from "./repo.ts";
import type { EvalCase, EvalGrader, EvalSet } from "./evalset.ts";

export const BEHAVIOUR_DIR = "behaviour";

/** A generated file, as a path relative to the repository root. */
export type GeneratedTree = Map<string, string>;

function scalar(value: string | number | boolean): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // JSON's string form is valid YAML double-quoted scalar syntax, and it is the
  // one quoting rule that never needs a case-by-case judgement about colons,
  // hashes, backslashes or leading dashes in a pattern.
  return JSON.stringify(value);
}

function flowSequence(values: string[]): string {
  return `[${values.join(", ")}]`;
}

function frontmatter(lines: [string, string][], body: string): string {
  return ["---", ...lines.map(([k, v]) => `${k}: ${v}`), "---", "", body.trimEnd(), ""].join("\n");
}

/** Path from a case directory back to the plugin root, as `plugins:` wants it. */
export function pluginPathFrom(caseDir: string): string {
  return relative(join(REPO_ROOT, caseDir), REPO_ROOT).split("\\").join("/");
}

export function renderPrompt(evalCase: EvalCase, caseDir: string): string {
  const fields: [string, string][] = [
    ["name", scalar(evalCase.name)],
    ["description", scalar(evalCase.description)],
    ["tags", flowSequence(evalCase.tags.map(scalar))],
    // Spelled out rather than left to auto-detection: with the eval directory
    // nested under tests/, the nearest enclosing plugin is not found from the
    // case directory, and the run reports "ablation requested but no plugin
    // resolved" instead of producing a baseline.
    ["plugins", flowSequence([scalar(pluginPathFrom(caseDir))])],
    ["runs", String(evalCase.runs ?? 3)],
    ["max_turns", String(evalCase.maxTurns ?? 10)],
    ["timeout_seconds", String(evalCase.timeoutSeconds ?? 300)],
    ["allowed_tools", flowSequence(evalCase.allowedTools)],
  ];
  if (evalCase.expectedOutcome) fields.push(["expected_outcome", scalar(evalCase.expectedOutcome)]);
  return frontmatter(fields, evalCase.prompt);
}

export function renderGrader(grader: EvalGrader): string {
  const fields: [string, string][] = [["type", grader.type]];
  if (grader.weight !== undefined) fields.push(["weight", String(grader.weight)]);
  if (grader.arm !== undefined) fields.push(["arm", grader.arm]);
  for (const [key, value] of Object.entries(grader.options ?? {})) fields.push([key, scalar(value)]);
  return frontmatter(fields, grader.body ?? `${grader.type} check`);
}

export async function loadEvalSet(skill: string): Promise<EvalSet | undefined> {
  const source = join(REPO_ROOT, "tests", "skills", skill, "evals.ts");
  if (!existsSync(source)) return undefined;
  const module = (await import(source)) as { evals?: EvalSet; default?: EvalSet };
  const set = module.evals ?? module.default;
  if (!set) throw new Error(`${relative(REPO_ROOT, source)} exports no eval set`);
  if (set.skill !== skill) {
    throw new Error(
      `${relative(REPO_ROOT, source)} declares skill ${JSON.stringify(set.skill)} but sits in the ` +
        `${JSON.stringify(skill)} directory; the cases would be generated for the wrong skill.`,
    );
  }
  return set;
}

/** Everything the generator would write, without touching the disk. */
export async function generate(skills = skillNames()): Promise<GeneratedTree> {
  const tree: GeneratedTree = new Map();
  for (const skill of skills) {
    const set = await loadEvalSet(skill);
    if (!set) continue;
    for (const evalCase of set.cases) {
      const caseDir = join("tests", "skills", skill, BEHAVIOUR_DIR, evalCase.name);
      tree.set(join(caseDir, "prompt.md"), renderPrompt(evalCase, caseDir));
      for (const grader of evalCase.graders) {
        tree.set(join(caseDir, "graders", `${grader.name}.md`), renderGrader(grader));
      }
    }
  }
  return tree;
}

/** What is on disk now, for the same set of skills. */
export function onDisk(skills = skillNames()): GeneratedTree {
  const tree: GeneratedTree = new Map();
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) tree.set(relative(REPO_ROOT, full), readFileSync(full, "utf8"));
    }
  };
  for (const skill of skills) walk(join(REPO_ROOT, "tests", "skills", skill, BEHAVIOUR_DIR));
  return tree;
}

export interface Drift {
  missing: string[];
  stale: string[];
  extra: string[];
}

export function diff(expected: GeneratedTree, actual: GeneratedTree): Drift {
  const missing: string[] = [];
  const stale: string[] = [];
  for (const [path, content] of expected) {
    if (!actual.has(path)) missing.push(path);
    else if (actual.get(path) !== content) stale.push(path);
  }
  const extra = [...actual.keys()].filter((p) => !expected.has(p));
  return { missing: missing.sort(), stale: stale.sort(), extra: extra.sort() };
}

export function hasDrifted(drift: Drift): boolean {
  return drift.missing.length + drift.stale.length + drift.extra.length > 0;
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      [
        "Usage: node scripts/testkit/gen-behaviour.ts [--check]",
        "",
        "Generates tests/skills/<name>/behaviour/ from tests/skills/<name>/evals.ts.",
        "--check reports drift and writes nothing.",
        "",
        "Exit status: 0 in sync or written, 1 drifted under --check, 2 usage error.",
        "",
      ].join("\n"),
    );
    return 0;
  }
  const unknown = argv.filter((a) => a.startsWith("-") && a !== "--check");
  if (unknown.length) {
    process.stderr.write(`Unknown option: ${unknown.join(", ")}. See --help.\n`);
    return 2;
  }

  const expected = await generate();
  const drift = diff(expected, onDisk());

  if (argv.includes("--check")) {
    if (!hasDrifted(drift)) {
      process.stdout.write(`ok  ${expected.size} generated files match their eval sets\n`);
      return 0;
    }
    for (const p of drift.missing) process.stdout.write(`missing  ${p}\n`);
    for (const p of drift.stale) process.stdout.write(`stale    ${p}\n`);
    for (const p of drift.extra) process.stdout.write(`extra    ${p}\n`);
    process.stderr.write("\nRun `npm run test:behaviour:gen` to bring the tree back in step.\n");
    return 1;
  }

  // Remove first: a case renamed in the eval set would otherwise leave its old
  // directory behind, and `claude plugin eval` would keep running the case that
  // no longer exists in the source.
  for (const skill of skillNames()) {
    rmSync(join(REPO_ROOT, "tests", "skills", skill, BEHAVIOUR_DIR), { recursive: true, force: true });
  }
  for (const [path, content] of [...expected].sort(([a], [b]) => a.localeCompare(b))) {
    const full = join(REPO_ROOT, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  process.stdout.write(`wrote ${expected.size} files from ${skillNames().length} skills' eval sets\n`);
  return 0;
}

if (import.meta.filename === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}
