// SPDX-License-Identifier: Apache-2.0
/**
 * The licence sweep, and proof that it fires.
 *
 * A lint that has only ever been run against a correct tree is a lint nobody has
 * seen work. Each rule below is given a tree broken in exactly the way it names.
 */
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { REPO_ROOT } from "@testkit/repo.ts";
import { runNodeScript, sh } from "@testkit/sh.ts";
import { SPDX_ID, lintLicense, marketplaceManifests, vendoredDirs } from "../../scripts/lint-license.ts";

const LINTER = join(REPO_ROOT, "scripts", "lint-license.ts");

/** A copy of the repository's licence-relevant files, safe to break. */
function scratchRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "license-lint-"));
  cpSync(join(REPO_ROOT, "LICENSE"), join(dir, "LICENSE"));
  for (const rel of ["package.json", "plugin.json", "THIRD-PARTY.md"]) {
    try {
      cpSync(join(REPO_ROOT, rel), join(dir, rel));
    } catch {
      /* not present yet; the rule that needs it will say so */
    }
  }
  cpSync(join(REPO_ROOT, "skills"), join(dir, "skills"), { recursive: true });
  for (const manifest of marketplaceManifests(REPO_ROOT)) {
    cpSync(join(REPO_ROOT, manifest), join(dir, manifest), { recursive: true });
  }
  return dir;
}

function editJson(dir: string, rel: string, edit: (data: any) => void): void {
  const path = join(dir, rel);
  const data = JSON.parse(readFileSync(path, "utf8"));
  edit(data);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function rules(dir: string): string[] {
  return [...new Set(lintLicense(dir).map((f) => f.rule))];
}

describe("the sweep fires on a tree broken in each way it names", () => {
  test("a missing LICENSE", () => {
    const dir = scratchRepo();
    rmSync(join(dir, "LICENSE"));
    expect(rules(dir), "a public repository with no LICENSE passed the sweep").toContain("license/root-file");
  });

  test("a LICENSE with the copyright placeholder left unfilled", () => {
    const dir = scratchRepo();
    const text = readFileSync(join(dir, "LICENSE"), "utf8").replace(/Copyright \d{4}.*/, "Copyright [yyyy] [name of copyright owner]");
    writeFileSync(join(dir, "LICENSE"), text);
    expect(rules(dir), "the appendix placeholder names no licensor and was accepted anyway").toContain("license/root-file");
  });

  test("a paraphrased LICENSE", () => {
    const dir = scratchRepo();
    writeFileSync(join(dir, "LICENSE"), "Apache 2.0. Do what you like.\n\nCopyright 2026 Someone\n");
    expect(rules(dir)).toContain("license/root-file");
  });

  test('`"license": "UNLICENSED"` in package.json', () => {
    const dir = scratchRepo();
    editJson(dir, "package.json", (d) => (d.license = "UNLICENSED"));
    const finding = lintLicense(dir).find((f) => f.rule === "license/package-json");
    expect(finding, "npm's UNLICENSED convention passed a field that expects SPDX").toBeDefined();
    expect(
      finding!.message,
      "the finding does not explain that `Unlicense` is a different thing entirely; without that, " +
        "the obvious fix is to swap one wrong value for its opposite.",
    ).toContain("Unlicense");
  });

  test('`"license": "Unlicense"` in package.json', () => {
    const dir = scratchRepo();
    editJson(dir, "package.json", (d) => (d.license = "Unlicense"));
    expect(
      rules(dir),
      "a public-domain dedication was accepted in place of Apache-2.0. It is a valid SPDX id, " +
        "which is exactly why only comparing against the repository's own id catches it.",
    ).toContain("license/package-json");
  });

  test("a plugin.json licence that disagrees with the repository", () => {
    const dir = scratchRepo();
    editJson(dir, "plugin.json", (d) => (d.license = "MIT"));
    expect(rules(dir)).toContain("license/plugin-json");
  });

  test("a SKILL.md with no licence in its frontmatter", () => {
    const dir = scratchRepo();
    const path = join(dir, "skills", "create-pr", "SKILL.md");
    writeFileSync(path, readFileSync(path, "utf8").replace(/^license: .*$/m, "compatibility_note: none"));
    expect(
      rules(dir),
      "a skill directory that can be vendored on its own carried no licence of its own",
    ).toContain("license/skill-frontmatter");
  });

  test("a SKILL.md that names no copyright holder", () => {
    const dir = scratchRepo();
    const path = join(dir, "skills", "create-pr", "SKILL.md");
    writeFileSync(path, readFileSync(path, "utf8").replace(/^ {2}copyright: .*\n/m, ""));
    expect(
      rules(dir),
      "the installed copy of a skill would name no licensor at all; the root LICENSE that names " +
        "one is the file an installer leaves behind.",
    ).toContain("license/skill-copyright");
  });

  test("a SKILL.md whose copyright names someone other than the licensor", () => {
    const dir = scratchRepo();
    const path = join(dir, "skills", "create-pr", "SKILL.md");
    writeFileSync(path, readFileSync(path, "utf8").replace(/^ {2}copyright: .*$/m, '  copyright: "2026 Someone Else"'));
    expect(
      rules(dir),
      "a skill claimed a different copyright holder from the one the root LICENSE grants on behalf " +
        "of, and the sweep accepted both.",
    ).toContain("license/skill-copyright");
  });

  test("a bundled script with no SPDX header", () => {
    const dir = scratchRepo();
    const path = join(dir, "skills", "create-pr", "scripts", "validate-pr-title.sh");
    writeFileSync(path, readFileSync(path, "utf8").replace(/^#\s*SPDX-License-Identifier: .*\n/m, ""));
    expect(
      rules(dir),
      "a script that ships inside the directory an installer copies carried no statement of its " +
        "terms, and the root LICENSE does not travel with it.",
    ).toContain("license/skill-bundle");
  });

  test("a marketplace entry with no licence", () => {
    const dir = scratchRepo();
    editJson(dir, marketplaceManifests(dir)[0], (d) => {
      for (const p of d.plugins) delete p.license;
    });
    expect(rules(dir)).toContain("license/marketplace-entries");
  });

  test("a vendored directory missing from THIRD-PARTY.md", () => {
    const dir = scratchRepo();
    cpSync(join(REPO_ROOT, ".agents", "skills", "skill-creator"), join(dir, "vendor", "skill-creator"), { recursive: true });
    expect(
      rules(dir),
      "someone else's Apache-2.0 code was redistributed with nothing recording whose it is",
    ).toContain("license/third-party");
  });

  test("a skill directory carrying a licence that is not ours", () => {
    // The distinction is by content, not by filename: shipping our own terms
    // beside our own work must stay free, and swapping in a different licence
    // must still be caught.
    const dir = scratchRepo();
    const path = join(dir, "skills", "create-pr", "LICENSE");
    writeFileSync(path, "MIT License\n\nCopyright 2026 Someone Else\n");
    expect(
      vendoredDirs(dir),
      "a skill directory was given someone else's licence and the sweep read it as our own",
    ).toContain(join("skills", "create-pr"));
    expect(rules(dir)).toContain("license/third-party");
  });
});

describe("nothing under a foreign licence is tracked", () => {
  test("every SKILL.md git tracks declares this repository's licence", async () => {
    // Scoped to what git tracks, not what is on disk: a skill installed here as
    // a tool is fine, and the only question is whether pushing would publish it.
    // `.agents/skills/` is tracked, so a proprietary skill dropped in there is
    // one `git add -f` — or one deleted .gitignore line — away from being public.
    const listed = await sh("git", ["ls-files", "*SKILL.md"], { cwd: REPO_ROOT });
    const tracked = listed.stdout.trim().split("\n").filter(Boolean);
    expect(tracked.length, "git tracks no SKILL.md at all; the check is looking in the wrong place").toBeGreaterThan(0);

    const thirdParty = (() => {
      try {
        return readFileSync(join(REPO_ROOT, "THIRD-PARTY.md"), "utf8");
      } catch {
        return "";
      }
    })();

    const foreign: string[] = [];
    for (const rel of tracked) {
      const head = readFileSync(join(REPO_ROOT, rel), "utf8").split("\n---")[0];
      const declared = head.match(/^license:\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
      if (declared === undefined || declared === SPDX_ID) continue;
      // A vendored directory recorded in THIRD-PARTY.md keeps its own terms.
      if (thirdParty.includes(rel.split("/").slice(0, -1).join("/"))) continue;
      foreign.push(`${rel}: ${declared}`);
    }

    expect(
      foreign,
      "these tracked files declare a licence that is neither this repository's nor recorded in " +
        "THIRD-PARTY.md. This repository is public: whatever git tracks is published on the next " +
        "push, and a file marked proprietary is the one thing that must never get there by " +
        "accident.",
    ).toEqual([]);
  });
});

describe("the sweep against this repository", () => {
  test("every licence field agrees with the root LICENSE", () => {
    const findings = lintLicense(REPO_ROOT);
    expect(
      findings.map((f) => `[${f.rule}] ${f.file}: ${f.message}`),
      "one licence, stated everywhere a consumer looks — the root file, both package manifests, " +
        "each SKILL.md, and every plugin entry in every marketplace manifest.",
    ).toEqual([]);
  });

  test("the vendored directories are the ones we know about", () => {
    expect(
      vendoredDirs(REPO_ROOT),
      "a directory carrying its own licence file appeared or disappeared. Either something was " +
        "vendored without being recorded, or a third-party licence file was deleted.",
    ).toEqual([".agents/skills/skill-creator"]);
  });

  test("every skill directory ships the licence its frontmatter declares", () => {
    // The installer copies a skill directory, not the repository, so a consumer
    // who installs one reads whatever is in that directory and nothing else.
    const ours = readFileSync(join(REPO_ROOT, "LICENSE"), "utf8");
    const missing = readdirSync(join(REPO_ROOT, "skills"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => {
        try {
          return readFileSync(join(REPO_ROOT, "skills", name, "LICENSE"), "utf8") !== ours;
        } catch {
          return true;
        }
      });

    expect(
      missing,
      "these skill directories declare " +
        SPDX_ID +
        " in their frontmatter and do not carry the text. Apache-2.0 §4(a) requires giving a " +
        "recipient a copy of the licence, and the recipient of a skill is whoever installs that " +
        "one directory.",
    ).toEqual([]);
  });

  test("the linter is runnable as a command and exits non-zero on findings", async () => {
    const clean = await runNodeScript(LINTER, ["--root", REPO_ROOT]);
    expect(clean.code, clean.stdout + clean.stderr).toBe(0);

    const dir = scratchRepo();
    rmSync(join(dir, "LICENSE"));
    const dirty = await runNodeScript(LINTER, ["--root", dir]);
    expect(dirty.code, "the linter reported findings and still exited 0, so CI would never notice").toBe(1);
  });

  test("--help and a bad --root are distinguishable exits", async () => {
    expect((await runNodeScript(LINTER, ["--help"])).code).toBe(0);
    expect((await runNodeScript(LINTER, ["--root"])).code).toBe(2);
  });

  test(`SPDX_ID is the id the root LICENSE actually grants`, () => {
    expect(SPDX_ID).toBe("Apache-2.0");
    expect(readFileSync(join(REPO_ROOT, "LICENSE"), "utf8")).toContain("Apache License");
  });
});
