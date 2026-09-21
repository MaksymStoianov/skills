// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "vitest";

import {
  DisallowedError,
  MIN_INTERVAL_MS,
  PoliteFetcher,
  REPOSITORY_URL,
  STOP_STATUSES,
  StopError,
  USER_AGENT_TOKEN,
  userAgent,
} from "../../../scripts/fetch.ts";

/** A transport that answers from a table and records what it was asked. */
function stubTransport(table: Record<string, { status: number; body: string }>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const transport = async (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => {
    calls.push({ url, headers: init.headers });
    const path = new URL(url).pathname;
    const hit = table[path] ?? { status: 404, body: "" };
    return new Response(hit.body, { status: hit.status });
  };
  return { transport, calls };
}

describe("user agent", () => {
  test("names the script and the repository and impersonates nothing", () => {
    const ua = userAgent("1.2.3");
    expect(ua).toContain(USER_AGENT_TOKEN);
    expect(ua).toContain(REPOSITORY_URL);
    expect(
      /mozilla|chrome|safari|webkit/i.test(ua),
      `User-Agent ${JSON.stringify(ua)} imitates a browser. An operator reading their access log ` +
        "cannot tell this apart from a person, so they cannot block it, rate-limit it, or ask us " +
        "to stop — which is the whole point of identifying a bot.",
    ).toBe(false);
  });
});

describe("robots.txt is read before anything else on a host", () => {
  test("the first request to a host is /robots.txt", async () => {
    const { transport, calls } = stubTransport({ "/robots.txt": { status: 200, body: "" }, "/page": { status: 200, body: "hi" } });
    const fetcher = new PoliteFetcher({ transport, sleep: async () => {} });
    await fetcher.fetch("https://example.test/page");
    expect(
      new URL(calls[0].url).pathname,
      "the fetcher went for the page before asking whether it was allowed to. Reading robots.txt " +
        "afterwards is the same as not reading it.",
    ).toBe("/robots.txt");
  });

  test("robots.txt is fetched once per host, not once per URL", async () => {
    const { transport, calls } = stubTransport({ "/robots.txt": { status: 200, body: "" }, "/a": { status: 200, body: "" }, "/b": { status: 200, body: "" } });
    const fetcher = new PoliteFetcher({ transport, sleep: async () => {} });
    await fetcher.fetch("https://example.test/a");
    await fetcher.fetch("https://example.test/b");
    expect(
      calls.filter((c) => c.url.endsWith("/robots.txt")).length,
      "robots.txt was re-fetched for every URL; on a host with many cited links that doubles the " +
        "request count we promised to keep to one per second.",
    ).toBe(1);
  });

  test("an unreadable robots.txt (5xx) disallows everything", async () => {
    const { transport } = stubTransport({ "/robots.txt": { status: 500, body: "" }, "/page": { status: 200, body: "" } });
    const fetcher = new PoliteFetcher({ transport, sleep: async () => {} });
    await expect(
      fetcher.fetch("https://example.test/page"),
      "a 5xx robots.txt was treated as permission. The host's rules exist and we failed to read " +
        "them; proceeding is crawling against rules we know we have not seen.",
    ).rejects.toBeInstanceOf(DisallowedError);
  });

  test("a missing robots.txt (4xx) allows everything", async () => {
    const { transport } = stubTransport({ "/robots.txt": { status: 404, body: "" }, "/page": { status: 200, body: "ok" } });
    const fetcher = new PoliteFetcher({ transport, sleep: async () => {} });
    const res = await fetcher.fetch("https://example.test/page");
    expect(
      res.status,
      "a 404 robots.txt was treated as a prohibition. A host that published no rules has not " +
        "objected, and refusing to fetch reports every link on it as broken.",
    ).toBe(200);
  });

  test("a transport failure on robots.txt disallows everything", async () => {
    const transport = async (url: string) => {
      if (url.endsWith("/robots.txt")) throw new Error("connect ECONNREFUSED");
      return new Response("ok", { status: 200 });
    };
    const fetcher = new PoliteFetcher({ transport, sleep: async () => {} });
    await expect(fetcher.fetch("https://example.test/page")).rejects.toBeInstanceOf(DisallowedError);
  });
});

describe("rate limiting", () => {
  test("never faster than one request per second per host", async () => {
    const { transport } = stubTransport({ "/robots.txt": { status: 404, body: "" } });
    let clock = 1000;
    const slept: number[] = [];
    const fetcher = new PoliteFetcher({
      transport,
      minIntervalMs: 10, // asking for faster than the floor must not lower it
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    await fetcher.fetch("https://example.test/a");
    await fetcher.fetch("https://example.test/b");
    expect(
      slept.at(-1),
      `the second request waited ${slept.at(-1)}ms. The floor of ${MIN_INTERVAL_MS}ms is not a ` +
        "default to be tuned down; a caller that lowers it is the caller that gets the repository " +
        "blocked.",
    ).toBe(MIN_INTERVAL_MS);
  });

  test("a longer crawl-delay from the host wins over our floor", async () => {
    const { transport } = stubTransport({ "/robots.txt": { status: 200, body: "User-agent: *\nCrawl-delay: 5\n" } });
    let clock = 0;
    const slept: number[] = [];
    const fetcher = new PoliteFetcher({ transport, now: () => clock, sleep: async (ms) => { slept.push(ms); clock += ms; } });
    await fetcher.fetch("https://example.test/a");
    await fetcher.fetch("https://example.test/b");
    expect(
      slept.at(-1),
      "the host asked for 5s between requests and got less. Crawl-delay is the one number the " +
        "operator gets to set, and ignoring it is the difference between polite and merely quiet.",
    ).toBe(5000);
  });
});

describe("stop statuses", () => {
  for (const status of STOP_STATUSES) {
    test(`${status} stops the host and is reported, not retried`, async () => {
      const { transport, calls } = stubTransport({ "/robots.txt": { status: 404, body: "" }, "/a": { status, body: "" }, "/b": { status: 200, body: "" } });
      const fetcher = new PoliteFetcher({ transport, sleep: async () => {} });
      await expect(fetcher.fetch("https://example.test/a")).rejects.toBeInstanceOf(StopError);
      const before = calls.length;
      await expect(
        fetcher.fetch("https://example.test/b"),
        `after ${status} the fetcher went back to the same host. ${status} is the host saying stop; ` +
          "continuing turns a rate limit into a block.",
      ).rejects.toBeInstanceOf(StopError);
      expect(calls.length, "a request was sent to a host that had already said stop.").toBe(before);
    });
  }

  test("a 404 on a page is a result, not a stop", async () => {
    const { transport } = stubTransport({ "/robots.txt": { status: 404, body: "" }, "/gone": { status: 404, body: "" } });
    const fetcher = new PoliteFetcher({ transport, sleep: async () => {} });
    const res = await fetcher.fetch("https://example.test/gone");
    expect(
      res.status,
      "a missing page was escalated to a stop, which would abandon every other link on the host " +
        "because one of them rotted.",
    ).toBe(404);
  });
});
