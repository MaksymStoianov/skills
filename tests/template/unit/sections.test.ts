// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "vitest";

import { codeBlocks, extractSections, proseOnly } from "@testkit/repo.ts";

const doc = [
  "# Title",
  "",
  "Intro.",
  "",
  "## First",
  "",
  "One line.",
  "Another line.",
  "",
  "## Second",
  "",
  "```bash",
  "## not a heading, a shell comment",
  "echo hi",
  "```",
  "",
  "Tail.",
  "",
  "## Third",
].join("\n");

describe("extractSections", () => {
  test("returns every section with its content intact", () => {
    const sections = extractSections(doc);
    expect(sections.map((s) => s.title)).toEqual(["First", "Second", "Third"]);
    expect(
      sections[0].content.trim(),
      "the section came back empty. A `(?=^## |$)` lookahead under the `m` flag ends at the first " +
        "newline, so it matches nothing and every section silently reports as blank — which makes " +
        "every content check pass by measuring an empty string.",
    ).toBe("One line.\nAnother line.");
  });

  test("a trailing section with no content is still a section", () => {
    expect(extractSections(doc).at(-1)).toEqual({ title: "Third", content: "" });
  });

  test("a `##` line inside a fenced block does not start a section", () => {
    const second = extractSections(doc).find((s) => s.title === "Second")!;
    expect(
      second.content.includes("echo hi"),
      "a shell comment inside a fenced block was read as a heading and split the section in two.",
    ).toBe(true);
  });
});

describe("codeBlocks and proseOnly are complements", () => {
  test("codeBlocks returns the fenced content", () => {
    expect(codeBlocks(doc)[0]).toContain("echo hi");
  });

  test("proseOnly drops fences and inline spans", () => {
    const prose = proseOnly("Run `npm test` now.\n\n```bash\nnpm test\n```\n");
    expect(prose).not.toContain("npm test");
    expect(prose).toContain("Run");
  });
});
