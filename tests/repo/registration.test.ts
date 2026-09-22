// SPDX-License-Identifier: Apache-2.0
/**
 * Invariants no single skill can see: that every skill is reachable from every
 * manifest a consumer might install through, and that the skills can be told
 * apart from one another.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { REPO_ROOT, allSkills, readRepoFile, skillNames } from "@testkit/repo.ts";
import { hasHandOffClause, siblingGroups, taskPhrasesIn } from "@testkit/siblings.ts";
import { marketplaceManifests } from "../../scripts/lint-license.ts";

interface Manifest {
  metadata?: { version?: string };
  plugins?: { name?: string; description?: string; skills?: string[]; license?: string }[];
}

function manifest(rel: string): Manifest {
  return JSON.parse(readFileSync(join(REPO_ROOT, rel), "utf8")) as Manifest;
}

const MANIFESTS = marketplaceManifests(REPO_ROOT);

describe("every skill is reachable from every manifest", () => {
  test("the three marketplace manifests are all present", () => {
    expect(
      MANIFESTS,
      "a marketplace manifest disappeared. Each one is a different ecosystem's front door; losing " +
        "one silently removes this collection from that ecosystem.",
    ).toEqual([".claude-plugin/marketplace.json", ".cursor-plugin/marketplace.json", ".agents/plugins/marketplace.json"]);
  });

  for (const rel of MANIFESTS) {
    test(`${rel} lists every skill under skills/`, () => {
      const listed = (manifest(rel).plugins ?? []).map((p) => p.name).filter(Boolean) as string[];
      const missing = skillNames().filter((n) => !listed.includes(n));
      expect(
        missing,
        `these skills exist under skills/ but ${rel} never mentions them. A skill absent from a ` +
          "marketplace manifest is a skill that ecosystem's users cannot install, however complete " +
          "the directory is.",
      ).toEqual([]);
    });

    test(`${rel} lists no plugin whose skill directory is gone`, () => {
      const names = skillNames();
      const dangling = (manifest(rel).plugins ?? []).map((p) => p.name).filter((n) => n && !names.includes(n));
      expect(
        dangling,
        `${rel} advertises plugins with no matching directory under skills/. Installing one gets ` +
          "the user an entry that resolves to nothing.",
      ).toEqual([]);
    });

    test(`${rel} gives every plugin a description`, () => {
      for (const plugin of manifest(rel).plugins ?? []) {
        expect(
          (plugin.description ?? "").length,
          `plugin ${JSON.stringify(plugin.name)} in ${rel} has no description. The marketplace ` +
            "listing is the only thing a user reads before installing.",
        ).toBeGreaterThan(40);
      }
    });
  }

  test(".claude-plugin and .cursor-plugin point at the skill directories that exist", () => {
    for (const rel of [".claude-plugin/marketplace.json", ".cursor-plugin/marketplace.json"]) {
      for (const plugin of manifest(rel).plugins ?? []) {
        for (const path of plugin.skills ?? []) {
          const name = path.replace(/^\.\/skills\//, "");
          expect(
            skillNames(),
            `${rel} points plugin ${JSON.stringify(plugin.name)} at ${path}, which does not exist.`,
          ).toContain(name);
        }
      }
    }
  });

  test("the README table lists every skill", () => {
    const readme = readRepoFile("README.md");
    const missing = skillNames().filter((n) => !readme.includes(`./skills/${n}`));
    expect(
      missing,
      "these skills are not in the README's table. The README is the repository's own index; a " +
        "skill missing from it is one nobody browsing the project will find.",
    ).toEqual([]);
  });
});

describe("one version for one repository", () => {
  test("every root manifest that carries a version agrees", () => {
    const versions: Record<string, string> = {};
    for (const rel of ["package.json", "plugin.json", "gemini-extension.json"]) {
      const v = (JSON.parse(readRepoFile(rel)) as { version?: string }).version;
      if (v) versions[rel] = v;
    }
    for (const rel of MANIFESTS) {
      const v = manifest(rel).metadata?.version;
      if (v) versions[rel] = v;
    }
    expect(
      new Set(Object.values(versions)).size,
      `the manifests describe this one repository at ${JSON.stringify(versions)}. A consumer picks ` +
        "whichever file their ecosystem reads, so disagreeing versions mean two installs of the " +
        "same commit report different versions and neither is wrong.",
    ).toBe(1);
  });
});

describe("skills can be told apart", () => {
  /** Words too common to distinguish anything. */
  const STOP = new Set(
    ("a an the and or of for to in on with via this that use used using when user users skill " +
      "from its it as by be is are creating create creates manages manage managing not just " +
      "each own before instead say says").split(" "),
  );

  function terms(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w)),
    );
  }

  test("no two descriptions are so alike that routing has to guess", () => {
    const skills = allSkills();
    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        const a = terms(String(skills[i].data.description));
        const b = terms(String(skills[j].data.description));
        const shared = [...a].filter((w) => b.has(w));
        const overlap = shared.length / Math.min(a.size, b.size);
        if (overlap < 0.35) continue;

        // Overlapping vocabulary is fine as long as each description names
        // something the other does not: that token is what routing discriminates
        // on. Two descriptions sharing this much with nothing to separate them
        // means the agent picks whichever it saw first.
        const onlyA = [...a].filter((w) => !b.has(w));
        const onlyB = [...b].filter((w) => !a.has(w));
        expect(
          onlyA.length > 0 && onlyB.length > 0,
          `${skills[i].dir} and ${skills[j].dir} share ${Math.round(overlap * 100)}% of their ` +
            "description vocabulary and neither names anything the other does not. A description " +
            "is a trigger, not a summary; with nothing to separate them the router is choosing at " +
            "random between two skills that do different things.",
        ).toBe(true);
      }
    }
  });
});

describe("skills that answer the same request say where the boundary is", () => {
  test("the grouping is by task, and it fires on a real pair", () => {
    // Proof the rule is not inert: these two fixtures compete and are caught.
    const groups = siblingGroups([
      { dir: "alpha", data: { description: "Opens a pull request on Forge A." } },
      { dir: "beta", data: { description: "Opens a pull request on Forge B." } },
      { dir: "gamma", data: { description: "Formats a spreadsheet." } },
    ]);
    expect(groups).toEqual([{ phrase: "pull request", skills: ["alpha", "beta"] }]);
    expect(hasHandOffClause("Opens a pull request on Forge A."), "a bare summary counted as a hand-off").toBe(false);
    expect(hasHandOffClause("Opens a pull request on Forge A; for Forge B use beta instead.")).toBe(true);
  });

  test("every skill with a same-task sibling states the hand-off", () => {
    const skills = allSkills();
    for (const group of siblingGroups(skills)) {
      for (const dir of group.skills) {
        const skill = skills.find((s) => s.dir === dir)!;
        const description = String(skill.data.description);
        const others = group.skills.filter((s) => s !== dir).join(", ");
        expect(
          hasHandOffClause(description),
          `${dir} competes with ${others} for the phrase "${group.phrase}" and its description ` +
            "never says when it is the wrong choice. Two skills that both trigger on the same " +
            "sentence, neither of which names the condition that sends the request to the other, " +
            "leave the router choosing on vocabulary — and the user gets the sibling's tool pointed " +
            "at their server.",
        ).toBe(true);
      }
    }
  });

  test("the phrase list still matches what these skills are about", () => {
    const covered = allSkills().filter((s) => taskPhrasesIn(String(s.data.description)).length > 0);
    expect(
      covered.map((s) => s.dir),
      "a skill's description no longer contains any known task phrase, so it is in no group and " +
        "the hand-off rule cannot see it. Add the phrase to TASK_PHRASES rather than leaving the " +
        "skill silently ungrouped.",
    ).toEqual(skillNames());
  });
});
