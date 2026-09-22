// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "vitest";

import { ALLOW_ALL, DENY_ALL, USER_AGENT_TOKEN, isAllowed, parseRobots } from "../../../scripts/fetch.ts";

describe("parseRobots", () => {
  test("picks the group naming our token over the wildcard group", () => {
    const rules = parseRobots(
      ["User-agent: *", "Disallow: /", "", `User-agent: ${USER_AGENT_TOKEN}`, "Disallow: /admin"].join("\n"),
      USER_AGENT_TOKEN,
    );
    expect(
      isAllowed(rules, "/docs"),
      "a host that wrote a group for us was ignored in favour of the wildcard's blanket Disallow. " +
        "Reading the wrong group means refusing to fetch pages the host explicitly opened to us.",
    ).toBe(true);
    expect(isAllowed(rules, "/admin")).toBe(false);
  });

  test("consecutive User-agent lines share one group", () => {
    const rules = parseRobots(["User-agent: alpha", `User-agent: ${USER_AGENT_TOKEN}`, "Disallow: /x"].join("\n"), USER_AGENT_TOKEN);
    expect(
      isAllowed(rules, "/x"),
      "a group introduced by several User-agent lines was split, so the rules under it were " +
        "attributed to only the first agent and silently skipped for ours.",
    ).toBe(false);
  });

  test("an empty Disallow is a permission, not a prohibition", () => {
    const rules = parseRobots("User-agent: *\nDisallow:\n", USER_AGENT_TOKEN);
    expect(
      isAllowed(rules, "/anything"),
      "`Disallow:` with no path means nothing is disallowed. Reading it as `Disallow: /` refuses " +
        "the whole host and reports every link on it as unreachable.",
    ).toBe(true);
  });

  test("the longest matching rule wins, and Allow breaks a tie", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /a\nAllow: /a/b\n", USER_AGENT_TOKEN);
    expect(isAllowed(rules, "/a/x")).toBe(false);
    expect(
      isAllowed(rules, "/a/b/c"),
      "a more specific Allow lost to a shorter Disallow; the host's own carve-out was ignored.",
    ).toBe(true);
  });

  test("comments and `$` anchors are honoured", () => {
    const rules = parseRobots("User-agent: *  # everyone\nDisallow: /*.pdf$\n", USER_AGENT_TOKEN);
    expect(isAllowed(rules, "/report.pdf")).toBe(false);
    expect(isAllowed(rules, "/report.pdf.html")).toBe(true);
  });

  test("crawl-delay is read in seconds and reported in milliseconds", () => {
    expect(parseRobots("User-agent: *\nCrawl-delay: 2.5\n", USER_AGENT_TOKEN).crawlDelayMs).toBe(2500);
  });

  test("a robots.txt that names no applicable group allows everything", () => {
    const rules = parseRobots("User-agent: someone-else\nDisallow: /\n", USER_AGENT_TOKEN);
    expect(
      isAllowed(rules, "/"),
      "rules written for another crawler were applied to us; a host blocking one bot would block " +
        "this one too, for no stated reason.",
    ).toBe(true);
  });
});

describe("the two fallbacks are opposites, deliberately", () => {
  test("ALLOW_ALL permits and DENY_ALL refuses", () => {
    expect(isAllowed(ALLOW_ALL, "/x")).toBe(true);
    expect(
      isAllowed(DENY_ALL, "/x"),
      "an unreadable robots.txt must disallow everything: not knowing what a host permits is not " +
        "the same as being permitted, and guessing the permissive way is how a crawler gets banned.",
    ).toBe(false);
  });
});
