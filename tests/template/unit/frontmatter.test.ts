// SPDX-License-Identifier: Apache-2.0
/**
 * The frontmatter parser is written independently of anything this repository
 * ships, so these tests are what stands behind it. A parser validated only by
 * the documents it already accepts agrees with itself and catches nothing.
 */
import { describe, expect, test } from "vitest";

import { FrontmatterError, isQuotedInSource, parseFrontmatter } from "@testkit/repo.ts";

const ok = ["---", "name: demo", 'version: "1.0.0"', "metadata:", "  author: Someone", "---", "", "# Demo", "", "Body."].join("\n");

describe("accepts the subset a SKILL.md is allowed to use", () => {
  test("scalars, a nested map, and the body", () => {
    const doc = parseFrontmatter(ok);
    expect(doc.data.name).toBe("demo");
    expect(doc.data.version).toBe("1.0.0");
    expect(doc.data.metadata).toEqual({ author: "Someone" });
    expect(doc.keys, "key order is lost, so a test cannot assert on it").toEqual(["name", "version", "metadata"]);
    expect(doc.body.startsWith("# Demo"), "leading blank lines were left on the body").toBe(true);
  });

  test("a value containing a colon is kept whole", () => {
    const doc = parseFrontmatter(["---", "description: Does X. Use when: the user asks.", "---", "", "# T"].join("\n"));
    expect(
      doc.data.description,
      "the value was truncated at its first inner colon. Descriptions routinely contain one, and " +
        "a truncated description routes on half a sentence.",
    ).toBe("Does X. Use when: the user asks.");
  });

  test("quoting is visible to the caller", () => {
    expect(isQuotedInSource(ok, ["version"])).toBe(true);
    expect(isQuotedInSource(ok, ["metadata", "author"])).toBe(false);
  });
});

describe("rejects what it cannot faithfully represent", () => {
  const cases: [string, string][] = [
    ["no opening delimiter", "# Just a heading\n"],
    ["unterminated frontmatter", "---\nname: demo\n\n# Demo\n"],
    ["a tab in the frontmatter", "---\nname:\tdemo\n---\n\n# D"],
    ["a duplicate top-level key", "---\nname: a\nname: b\n---\n\n# D"],
    ["a duplicate nested key", "---\nmeta:\n  a: 1\n  a: 2\n---\n\n# D"],
    ["a block sequence", "---\ntags:\n- one\n---\n\n# D"],
    ["a block scalar", "---\ndescription: |\n  text\n---\n\n# D"],
    ["three-space indentation", "---\nmeta:\n   a: 1\n---\n\n# D"],
    ["an indented key with no parent", "---\n  a: 1\n---\n\n# D"],
    ["a missing space after the colon", "---\nname:demo\n---\n\n# D"],
    ["CRLF line endings", "---\r\nname: demo\r\n---\r\n\r\n# D"],
  ];
  for (const [label, source] of cases) {
    test(`throws on ${label}`, () => {
      expect(
        () => parseFrontmatter(source),
        `${label} parsed without complaint. A parser that quietly returns an empty object for ` +
          "malformed frontmatter makes every downstream check pass on a file no loader can read.",
      ).toThrow(FrontmatterError);
    });
  }

  test("the error says which line is at fault", () => {
    expect(() => parseFrontmatter("---\nname: a\nname: b\n---\n\n# D")).toThrow(/line 3/);
  });
});
