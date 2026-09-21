// SPDX-License-Identifier: Apache-2.0
/**
 * Every URL this repository cites, against the live internet.
 *
 * Gated behind LIVE=1 and run by `npm run test:live`, never by `npm test`: it
 * makes real requests to other people's servers, at one per second per host, and
 * a suite that does that on every commit is a suite that gets the repository
 * rate-limited for no new information.
 *
 * The point is specific. These skills tell an agent to verify a claim against a
 * linked upstream source; a link that has rotted turns that instruction into a
 * dead end the agent will route around by guessing.
 */
import { describe, expect, test } from "vitest";

import { CACHE_DIR, checkUrls, collectCitations } from "../../scripts/linkcheck.ts";

const live = process.env.LIVE === "1";

describe.skipIf(!live)("cited URLs resolve", () => {
  test("every http(s) URL in a tracked text file answers", async () => {
    const citations = collectCitations();
    expect(citations.length, "no URLs were collected at all; the collector is broken, not the links").toBeGreaterThan(5);

    const results = await checkUrls(citations, { cacheDir: CACHE_DIR });

    // Reported, not asserted on: a host that refuses bots has not told us its
    // link is dead, and failing here would send someone to fix a working URL.
    const unverified = results.filter((r) => r.verdict === "unverifiable");
    if (unverified.length) {
      console.warn(
        `not verified (${unverified.length}):\n` + unverified.map((r) => `  ${r.url} — ${r.reason}`).join("\n"),
      );
    }

    const broken = results.filter((r) => r.verdict === "broken").map((r) => `${r.url} (cited in ${r.file}) — ${r.reason}`);
    expect(
      broken,
      "these cited URLs did not resolve. A skill that says 'check the upstream source' and links " +
        "somewhere that no longer exists has replaced a verifiable claim with an unverifiable one.",
    ).toEqual([]);
  }, 600_000);
});

test("the live suite is skipped unless it was asked for", () => {
  expect(
    live || process.env.npm_lifecycle_event !== "test:live",
    "`npm run test:live` ran without LIVE=1, so the live checks were silently skipped and the " +
      "command reported success without checking anything.",
  ).toBe(true);
});
