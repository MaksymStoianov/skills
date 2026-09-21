// SPDX-License-Identifier: Apache-2.0
/**
 * Rules about the repository itself: things that cost a whole debugging session
 * once and should cost nothing again.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

import { REPO_ROOT, readRepoFile } from "@testkit/repo.ts";
import { sh } from "@testkit/sh.ts";

function walk(dir: string, match: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", ".cache", ".idea", ".junie"].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, match, out);
    else if (match.test(entry.name)) out.push(relative(REPO_ROOT, full));
  }
  return out;
}

const OUR_TS = [...walk(join(REPO_ROOT, "scripts"), /\.ts$/), ...walk(join(REPO_ROOT, "tests"), /\.ts$/)];

/** Source with comments removed: these files discuss the traps they avoid, and
 * a check that matches the prose fires on the explanation rather than the code. */
function codeOf(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("the traps stay closed", () => {
  test("nothing in scripts/ or tests/ spawns a child process synchronously", () => {
    // This file is excluded from its own check: the pattern it searches for is
    // spelled out in the regex below, and a rule that flags its own definition
    // can never be satisfied.
    const offenders = OUR_TS.filter(
      (rel) => rel !== "tests/repo/hygiene.test.ts" && /\b(execFileSync|execSync|spawnSync)\b/.test(codeOf(rel)),
    );
    expect(
      offenders,
      "these files call a child process synchronously. A synchronous spawn blocks Node's event " +
        "loop, so any test that starts the HTTP fixture in-process and then calls a child this way " +
        "deadlocks: the server cannot accept the connection the child is waiting on, and every " +
        "request fails as a timeout that looks like a network fault. Use @testkit/sh.ts, which " +
        "wraps promisify(execFile), and await it.",
    ).toEqual([]);
  });

  test("a server the fixture opens is closed with closeAllConnections() first", () => {
    const fixture = readRepoFile("scripts/testkit/httpfix.ts");
    const closeAll = fixture.indexOf("closeAllConnections");
    const close = fixture.indexOf("server.close(");
    expect(closeAll, "the fixture never calls closeAllConnections()").toBeGreaterThan(-1);
    expect(
      closeAll < close,
      "close() is called before closeAllConnections(). close() alone waits for every keep-alive " +
        "socket to go idle, so a client that holds its connection open hangs the shutdown and the " +
        "run times out with no failing assertion to explain it.",
    ).toBe(true);
  });

  test("the harness imports its own siblings relatively, not through the alias", () => {
    const offenders = OUR_TS.filter((rel) => rel.startsWith("scripts/") && /@testkit\//.test(codeOf(rel)));
    expect(
      offenders,
      "these files under scripts/ import through the @testkit alias. Only vitest resolves that " +
        "alias, so the file loads under test and fails with ERR_MODULE_NOT_FOUND under bare node — " +
        "which is how gen-behaviour.ts, linkcheck.ts and lint-license.ts are all documented to run. " +
        "The alias is for test cases, whose only runner is vitest.",
    ).toEqual([]);
  });

  test("every relative import of a .ts file carries its extension", () => {
    const offenders: string[] = [];
    for (const rel of OUR_TS) {
      for (const m of codeOf(rel).matchAll(/from\s+"((?:\.{1,2}\/|@testkit\/)[^"]+)"/g)) {
        if (!m[1].endsWith(".ts") && !m[1].endsWith(".json")) offenders.push(`${rel}: ${m[1]}`);
      }
    }
    expect(
      offenders,
      "these relative imports have no `.ts` extension. vitest resolves them anyway, so the file " +
        "works under test and fails the first time anyone runs it with bare node — which is how " +
        "every one of these tools documents itself being run.",
    ).toEqual([]);
  });

  test("no Python in this repository writes JSON with the default ASCII escaping", () => {
    const python = [...walk(join(REPO_ROOT, "skills"), /\.(py|sh)$/)];
    const offenders = python.filter((rel) => {
      const text = readFileSync(join(REPO_ROOT, rel), "utf8");
      return /json\.dumps?\(/.test(text) && !/ensure_ascii\s*=\s*False/.test(text);
    });
    expect(
      offenders,
      "these call json.dump/json.dumps without `ensure_ascii=False`. The default escapes every " +
        "non-ASCII character, so an em dash written by a skill comes back as \\u2014 and the file " +
        "reads as mojibake to everything downstream.",
    ).toEqual([]);
  });
});

describe("nothing fetched is under version control", () => {
  test(".gitignore covers the eval runner's result directory", () => {
    expect(
      /^tests\/skills\/results\/?$/m.test(readRepoFile(".gitignore")),
      "`tests/skills/results/` is not git-ignored. `claude plugin eval` writes a full transcript " +
        "of every run there, including the model's replies; committing them puts run artifacts in " +
        "the history and makes every eval run show up as a dirty working tree.",
    ).toBe(true);
  });

  test("a fetched page is git-ignored", async () => {
    // Asserted through git rather than by reading .gitignore: what matters is
    // whether a file that lands there would be committed, not how the rule that
    // stops it happens to be spelled.
    const ignored = await sh("git", ["check-ignore", "-q", ".cache/linkcheck/deadbeef.json"], { cwd: REPO_ROOT });
    expect(
      ignored.code,
      "a stored copy under .cache/ is not git-ignored. That directory holds other people's pages, " +
        "fetched to verify a citation; committing them redistributes content this repository has " +
        "no licence to redistribute.",
    ).toBe(0);
  });

  test("git tracks the corpus README and nothing else under .cache/", async () => {
    const tracked = await sh("git", ["ls-files", "--", ".cache"], { cwd: REPO_ROOT });
    expect(
      tracked.stdout.trim().split("\n").filter(Boolean),
      "the directory's README is tracked so the rule travels with the repository; anything else " +
        "under .cache/ is fetched content that was committed.",
    ).toEqual([".cache/README.md"]);
  });
});

describe("provenance", () => {
  test("every file we wrote carries an SPDX identifier", () => {
    const missing = OUR_TS.filter((rel) => !readFileSync(join(REPO_ROOT, rel), "utf8").includes("SPDX-License-Identifier:"));
    expect(
      missing,
      "these files carry no `SPDX-License-Identifier:` header. A file copied out of this " +
        "repository then travels with no statement of its terms, which is the situation the " +
        "header costs one line to prevent.",
    ).toEqual([]);
  });
});

describe("the first-party validator agrees", () => {
  test("`claude plugin validate .` passes", async () => {
    const probe = await sh("sh", ["-c", "command -v claude || true"], { cwd: REPO_ROOT });
    if (!probe.stdout.trim()) {
      // Reported rather than silently skipped: a check that quietly does
      // nothing on a machine without the CLI is a check that quietly does
      // nothing in CI too.
      console.warn("claude CLI not installed; `claude plugin validate` was not run");
      return;
    }
    const run = await sh("claude", ["plugin", "validate", "."], { cwd: REPO_ROOT });
    expect(
      run.code,
      `claude plugin validate reported a problem:\n${run.stdout}\n${run.stderr}\nThis is the ` +
        "validator that runs when a user installs the marketplace, so its verdict is the one that " +
        "decides whether the install works.",
    ).toBe(0);
  }, 60_000);
});

describe("test layout", () => {
  test("vitest never tries to run the behaviour cases", () => {
    const config = readRepoFile("vitest.config.ts");
    expect(
      config.includes("tests/skills/**/behaviour/**"),
      "the behaviour directories are not excluded from vitest. Those cases are prompts for " +
        "`claude plugin eval`, not vitest tests; collecting them here either fails to parse or, " +
        "worse, passes while testing nothing.",
    ).toBe(true);
  });

  test("tests/ holds test cases and nothing else", () => {
    // `evals.ts` is a case source, not harness: it is the authored behaviour set
    // that `behaviour/` is generated from, and it belongs beside the skill it
    // describes for the same reason the contract test does.
    const strays = walk(join(REPO_ROOT, "tests"), /.*/).filter(
      (rel) =>
        !/\.test\.ts$/.test(rel) &&
        !/\/evals\.ts$/.test(rel) &&
        !/\/behaviour\//.test(rel) &&
        // `claude plugin eval` writes its run artifacts to <eval dir>/results/.
        !/^tests\/skills\/results\//.test(rel) &&
        !/README\.md$/.test(rel),
    );
    expect(
      strays,
      "these files live under tests/ but are not test cases. The harness belongs in " +
        "scripts/testkit/ and is reached through the @testkit alias, so that moving it never " +
        "touches a case.",
    ).toEqual([]);
  });
});
