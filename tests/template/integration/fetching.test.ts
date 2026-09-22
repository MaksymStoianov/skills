// SPDX-License-Identifier: Apache-2.0
/**
 * The fetching rules, bound over a real socket.
 *
 * The unit layer proves the rules against an injected transport; that shows the
 * decisions are right but not that they survive HTTP. These run against a
 * loopback fixture, so what is asserted is what a host would actually have seen
 * in its access log.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { DisallowedError, PoliteFetcher, StopError, USER_AGENT_TOKEN } from "../../../scripts/fetch.ts";
import { HttpFixture, robots, text } from "@testkit/httpfix.ts";

let fixture: HttpFixture;

beforeEach(async () => {
  fixture = new HttpFixture();
  await fixture.start();
});

afterEach(async () => {
  // closeAllConnections() first; close() alone waits out keep-alive sockets.
  await fixture.stop();
});

function fetcher(overrides: Partial<ConstructorParameters<typeof PoliteFetcher>[0]> = {}): PoliteFetcher {
  // Sleep is stubbed by default so the suite does not pay the 1s floor on every
  // case; the case that is about the floor uses the real clock.
  return new PoliteFetcher({ version: "test", sleep: async () => {}, ...overrides });
}

describe("what the host sees", () => {
  test("the first request is robots.txt and it carries our User-Agent", async () => {
    fixture.route("/robots.txt", robots({})).route("/page", text("hello"));
    await fetcher().fetch(fixture.url("/page"));

    expect(fixture.log.map((r) => r.path)).toEqual(["/robots.txt", "/page"]);
    const ua = String(fixture.log[0].headers["user-agent"]);
    expect(
      ua.includes(USER_AGENT_TOKEN) && ua.includes("github.com/MaksymStoianov/skills"),
      `the host saw User-Agent ${JSON.stringify(ua)}. A request that does not name the script and ` +
        "the repository cannot be attributed, so an operator with a complaint has no one to send " +
        "it to and blocks the address instead.",
    ).toBe(true);
  });

  test("a disallowed path is never requested", async () => {
    fixture.route("/robots.txt", robots({ disallow: ["/private"] })).route("/private/secret", text("nope"));
    await expect(fetcher().fetch(fixture.url("/private/secret"))).rejects.toBeInstanceOf(DisallowedError);
    expect(
      fixture.requestsTo("/private/secret"),
      "the fetcher decided the path was disallowed and requested it anyway. Deciding after the " +
        "request is indistinguishable, from the host's side, from not checking at all.",
    ).toEqual([]);
  });

  test("an unreadable robots.txt (500) blocks the page request", async () => {
    fixture.route("/robots.txt", text("boom", 500)).route("/page", text("hello"));
    await expect(fetcher().fetch(fixture.url("/page"))).rejects.toBeInstanceOf(DisallowedError);
    expect(fixture.requestsTo("/page"), "the page was fetched under rules we failed to read.").toEqual([]);
  });

  test("a robots.txt that times out blocks the page request", async () => {
    fixture.route("/robots.txt", { ...text("slow"), delayMs: 400 }).route("/page", text("hello"));
    await expect(
      fetcher({ timeoutMs: 100 }).fetch(fixture.url("/page")),
      "a robots.txt we timed out on was treated as permission. A timeout is the case where we " +
        "know least about what the host allows.",
    ).rejects.toBeInstanceOf(DisallowedError);
    expect(fixture.requestsTo("/page")).toEqual([]);
  });

  test("a missing robots.txt (404) allows the page", async () => {
    fixture.route("/page", text("hello")); // /robots.txt falls through to 404
    const res = await fetcher().fetch(fixture.url("/page"));
    expect(res.status).toBe(200);
    expect(res.body).toBe("hello");
    expect(res.source, "a live fetch was reported as coming from a stored copy").toBe("live");
  });
});

describe("stop means stop", () => {
  for (const status of [403, 429, 503]) {
    test(`${status} ends the host for the rest of the run`, async () => {
      fixture.route("/robots.txt", robots({})).route("/a", text("", status)).route("/b", text("fine"));
      const f = fetcher();
      await expect(f.fetch(fixture.url("/a"))).rejects.toBeInstanceOf(StopError);
      await expect(f.fetch(fixture.url("/b"))).rejects.toBeInstanceOf(StopError);
      expect(
        fixture.requestsTo("/b"),
        `after ${status} another request went out to the same host. Continuing after a stop is ` +
          "what turns a temporary rate limit into a permanent block.",
      ).toEqual([]);
    });
  }
});

describe("rate limiting against the clock", () => {
  test("two requests to one host are at least a second apart on the wire", async () => {
    fixture.route("/robots.txt", robots({})).route("/a", text("a")).route("/b", text("b"));
    // No stubbed sleep here: the point is the gap the host actually observes.
    const f = new PoliteFetcher({ version: "test" });
    await f.fetch(fixture.url("/a"));
    await f.fetch(fixture.url("/b"));

    const [a, b] = [fixture.requestsTo("/a")[0], fixture.requestsTo("/b")[0]];
    const gap = b.at - a.at;
    expect(
      gap,
      `the host saw two requests ${gap}ms apart. One per second per host is the promise this ` +
        "tooling makes in its User-Agent; breaking it is what gets the repository's traffic dropped.",
    ).toBeGreaterThanOrEqual(950);
  }, 10_000);
});
