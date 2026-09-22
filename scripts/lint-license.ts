#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Licence sweep: one licence, stated everywhere a consumer might look.
 *
 * This repository is public, so the failure mode is not leaking anything — it is
 * shipping a file whose terms a reader cannot establish. Each rule below covers
 * one place someone actually looks: the root LICENSE, the two package manifests,
 * each SKILL.md (which is what a consumer vendoring a single skill directory
 * gets), every file bundled beside it, and every plugin entry in every
 * marketplace manifest, which is what they read at install time.
 *
 * An installer copies the skill directory and nothing above it, so the root
 * LICENSE does not travel. The terms therefore ride in the files themselves —
 * `license:` in the SKILL.md frontmatter, an SPDX header in everything bundled
 * with it — rather than in a licence file inside the directory, which in this
 * tree is the marker that the directory belongs to someone else (THIRD-PARTY.md).
 *
 * Usage:
 *   node scripts/lint-license.ts [--json] [--root <dir>] [--help]
 *
 * Exit status: 0 clean, 1 at least one finding, 2 usage error.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const SPDX_ID = "Apache-2.0";

/** npm's own convention for "no licence", not an SPDX id — and not `Unlicense`,
 * which is a public-domain dedication meaning very nearly the opposite. */
const NOT_AN_SPDX_ID = ["UNLICENSED", "SEE LICENSE IN", "Unlicense"];

export interface Finding {
  rule: string;
  file: string;
  message: string;
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/** A frontmatter value without parsing the whole document; `key` may be indented. */
function frontmatterValue(text: string, key: RegExp): string | undefined {
  const end = text.indexOf("\n---", 4);
  const head = end === -1 ? text : text.slice(0, end);
  return head.match(key)?.[1].trim().replace(/^["']|["']$/g, "");
}

function frontmatterLicense(text: string): string | undefined {
  return frontmatterValue(text, /^license:\s*(.+)$/m);
}

/** The copyright holder the root LICENSE's appendix actually names. */
function licensedBy(root: string): string | undefined {
  try {
    return readFileSync(join(root, "LICENSE"), "utf8").match(/^\s*Copyright \d{4} (.+)$/m)?.[1].trim();
  } catch {
    return undefined;
  }
}

/** Every file in a skill directory except its SKILL.md, skill-relative. */
function bundledFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...bundledFiles(full, base));
    else if (full !== join(base, "SKILL.md")) out.push(relative(base, full));
  }
  return out.sort();
}

function checkSpdxField(value: unknown, rule: string, file: string, where: string, out: Finding[]): void {
  if (value === undefined || value === "") {
    out.push({ rule, file, message: `${where} states no licence. A consumer reading only this file cannot establish the terms of what they are installing.` });
    return;
  }
  const text = String(value);
  const bogus = NOT_AN_SPDX_ID.find((b) => text.toUpperCase().startsWith(b.toUpperCase()));
  if (bogus) {
    out.push({
      rule,
      file,
      message:
        `${where} is ${JSON.stringify(text)}, which is not an SPDX identifier. "UNLICENSED" is npm's ` +
        `own convention for a private package, and "Unlicense" is a public-domain dedication meaning ` +
        `close to the opposite of it — neither belongs in a field that expects SPDX. Use "${SPDX_ID}".`,
    });
    return;
  }
  if (text !== SPDX_ID) {
    out.push({ rule, file, message: `${where} is ${JSON.stringify(text)}, but the repository is licensed ${SPDX_ID}. Two licences stated for one artifact is a licence nobody can rely on.` });
  }
}

/**
 * Directories vendored from elsewhere, identified by carrying their own licence.
 *
 * A licence file identical to the root one is not that: it is this repository
 * shipping its own terms beside its own work, which a skill directory has to
 * do because the installer copies the directory and not the repository. Only a
 * *different* licence means someone else's code.
 */
export function vendoredDirs(root: string): string[] {
  const out: string[] = [];
  const skip = new Set([".git", "node_modules", ".cache", ".idea", ".junie"]);
  const ourLicence = (() => {
    try {
      return readFileSync(join(root, "LICENSE"), "utf8");
    } catch {
      return null;
    }
  })();
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const licence = entries.find((e) => e.isFile() && /^LICEN[CS]E(\.\w+)?$/i.test(e.name));
    const isOurs =
      licence !== undefined &&
      ourLicence !== null &&
      (() => {
        try {
          return readFileSync(join(dir, licence.name), "utf8") === ourLicence;
        } catch {
          return false;
        }
      })();
    if (licence !== undefined && !isOurs && dir !== root) out.push(relative(root, dir));
    for (const entry of entries) {
      if (entry.isDirectory() && !skip.has(entry.name)) walk(join(dir, entry.name));
    }
  };
  walk(root);
  return out.sort();
}

export function lintLicense(root: string): Finding[] {
  const out: Finding[] = [];

  // 1. The root LICENSE, with the copyright placeholder actually filled in.
  const licensePath = join(root, "LICENSE");
  if (!exists(licensePath)) {
    out.push({ rule: "license/root-file", file: "LICENSE", message: "no LICENSE at the repository root. A public repository with no licence file grants nobody any rights, whatever its manifests claim." });
  } else {
    const text = readFileSync(licensePath, "utf8");
    for (const marker of ["Apache License", "Version 2.0, January 2004", "END OF TERMS AND CONDITIONS"]) {
      if (!text.includes(marker)) {
        out.push({ rule: "license/root-file", file: "LICENSE", message: `LICENSE is missing ${JSON.stringify(marker)}, so it is not the canonical ${SPDX_ID} text. A paraphrased licence is a different licence.` });
      }
    }
    if (text.includes("[yyyy]") || text.includes("[name of copyright owner]")) {
      out.push({ rule: "license/root-file", file: "LICENSE", message: "LICENSE still carries the appendix placeholders `[yyyy]` / `[name of copyright owner]`; the copyright line names nobody, so there is no identified licensor." });
    } else if (!/^\s*Copyright \d{4}/m.test(text)) {
      out.push({ rule: "license/root-file", file: "LICENSE", message: "LICENSE has no `Copyright <year> <holder>` line; Apache-2.0's appendix is where the licensor is named, and without it the grant has no grantor." });
    }
  }

  // 2/3. The two package manifests.
  const pkg = readJson(join(root, "package.json"));
  if (pkg) checkSpdxField(pkg.license, "license/package-json", "package.json", "package.json `license`", out);
  const plugin = readJson(join(root, "plugin.json"));
  if (plugin) checkSpdxField(plugin.license, "license/plugin-json", "plugin.json", "plugin.json `license`", out);

  // 4. Each skill directory: what an installer copies, and all it copies. The
  //    SKILL.md states the terms and names the licensor; every file bundled
  //    beside it carries the id, because a script lifted out of an installed
  //    skill travels on its own from there.
  const skillsDir = join(root, "skills");
  const holder = licensedBy(root);
  if (exists(skillsDir)) {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillDir = join(root, "skills", entry.name);
      const file = join("skills", entry.name, "SKILL.md");
      if (!exists(join(root, file))) continue;
      const text = readFileSync(join(root, file), "utf8");
      checkSpdxField(
        frontmatterLicense(text),
        "license/skill-frontmatter",
        file,
        `${file} frontmatter \`license:\``,
        out,
      );

      const copyright = frontmatterValue(text, /^ {2}copyright:\s*(.+)$/m);
      if (!copyright) {
        out.push({
          rule: "license/skill-copyright",
          file,
          message:
            `${file} frontmatter has no \`metadata.copyright:\`. An installer copies this directory ` +
            "and leaves the root LICENSE behind, so this line is the only place the installed copy " +
            `names its licensor — and Apache-2.0 §4 asks whoever passes it on to keep that notice.`,
        });
      } else if (holder && !copyright.includes(holder)) {
        out.push({
          rule: "license/skill-copyright",
          file,
          message:
            `${file} is copyright ${JSON.stringify(copyright)} but the root LICENSE grants on behalf ` +
            `of ${JSON.stringify(holder)}. Two licensors stated for one file leaves a consumer unable ` +
            "to tell who actually granted them anything.",
        });
      } else if (!/^\d{4} /.test(copyright)) {
        out.push({
          rule: "license/skill-copyright",
          file,
          message:
            `${file} states copyright ${JSON.stringify(copyright)}, which carries no four-digit year. ` +
            "Apache-2.0's own notice form is `Copyright [yyyy] [name]`; a notice without the year is " +
            "not the one the appendix asks to be reproduced.",
        });
      }

      for (const rel of bundledFiles(skillDir)) {
        const bundled = join("skills", entry.name, rel);
        let body: string;
        try {
          body = readFileSync(join(root, bundled), "utf8");
        } catch {
          continue; // not text; nothing to carry a header
        }
        if (!body.includes(`SPDX-License-Identifier: ${SPDX_ID}`)) {
          out.push({
            rule: "license/skill-bundle",
            file: bundled,
            message:
              `${bundled} carries no \`SPDX-License-Identifier: ${SPDX_ID}\` header. It ships inside ` +
              "the skill directory an installer copies, so the root LICENSE never reaches it; once " +
              "someone lifts this one file out, nothing on it says what they may do with it.",
          });
        }
      }
    }
  }

  // 5. Every plugin entry in every marketplace manifest, which is what a
  //    consumer reads at install time.
  for (const manifest of marketplaceManifests(root)) {
    const data = readJson(join(root, manifest));
    const plugins = Array.isArray(data?.plugins) ? (data!.plugins as Record<string, unknown>[]) : [];
    for (const entry of plugins) {
      checkSpdxField(
        entry.license,
        "license/marketplace-entries",
        manifest,
        `${manifest} → plugin ${JSON.stringify(entry.name ?? "?")} \`license\``,
        out,
      );
    }
  }

  // 6. Anything here that belongs to someone else.
  const vendored = vendoredDirs(root);
  const thirdPartyPath = join(root, "THIRD-PARTY.md");
  if (vendored.length && !exists(thirdPartyPath)) {
    out.push({ rule: "license/third-party", file: "THIRD-PARTY.md", message: `this repository vendors ${vendored.join(", ")} but has no THIRD-PARTY.md. Someone else's code is being redistributed with nothing saying whose it is or under what terms.` });
  } else if (vendored.length) {
    const listed = readFileSync(thirdPartyPath, "utf8");
    for (const dir of vendored) {
      if (!listed.includes(dir)) {
        out.push({ rule: "license/third-party", file: "THIRD-PARTY.md", message: `${dir} carries its own licence file but is not listed in THIRD-PARTY.md, so it redistributes as if it were ours.` });
      }
    }
  }

  return out;
}

export function marketplaceManifests(root: string): string[] {
  const candidates = [
    join(".claude-plugin", "marketplace.json"),
    join(".cursor-plugin", "marketplace.json"),
    join(".agents", "plugins", "marketplace.json"),
  ];
  return candidates.filter((c) => exists(join(root, c)));
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      [
        "Usage: node scripts/lint-license.ts [--json] [--root <dir>]",
        "",
        "Checks that one licence is stated everywhere a consumer looks: LICENSE,",
        "package.json, plugin.json, each SKILL.md and the files bundled beside it,",
        "and every plugin entry in every marketplace manifest, plus THIRD-PARTY.md",
        "for anything vendored.",
        "",
        "Exit status: 0 clean, 1 at least one finding, 2 usage error.",
        "",
      ].join("\n"),
    );
    return 0;
  }
  const rootIndex = argv.indexOf("--root");
  if (rootIndex !== -1 && !argv[rootIndex + 1]) {
    process.stderr.write("--root needs a directory. See --help.\n");
    return 2;
  }
  const root = rootIndex === -1 ? process.cwd() : argv[rootIndex + 1];
  const findings = lintLicense(root);

  if (argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ findings }, null, 2) + "\n");
  } else if (findings.length === 0) {
    process.stdout.write(`ok  one licence (${SPDX_ID}) stated in every place a consumer reads it\n`);
  } else {
    for (const f of findings) process.stdout.write(`FAIL [${f.rule}] ${f.file}\n     ${f.message}\n`);
  }
  return findings.length ? 1 : 0;
}

if (import.meta.filename === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
