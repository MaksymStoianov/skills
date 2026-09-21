// SPDX-License-Identifier: Apache-2.0
/**
 * The link checker as a user runs it: a real child process, against a real
 * socket.
 *
 * Two traps are load-bearing here and both produce failures that look like
 * something else:
 *
 *   - the child is spawned with `promisify(execFile)` and awaited. `execFileSync`
 *     would block the event loop of this process — the one hosting the fixture —
 *     so the server could never accept the child's connection and every case
 *     would fail as a network timeout;
 *   - the fixture is stopped with `closeAllConnections()` before `close()`, or a
 *     child that kept its connection alive holds the suite open until vitest
 *     kills it.
 */
import { mkdtempSync, readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { REPO_ROOT } from "@testkit/repo.ts";
import { HttpFixture, robots, text } from "@testkit/httpfix.ts";
import { runNodeScript } from "@testkit/sh.ts";

const CLI = join(REPO_ROOT, "scripts", "linkcheck.ts");

let fixture: HttpFixture;

beforeEach(async () => {
  fixture = new HttpFixture();
  await fixture.start();
});

afterEach(async () => {
  await fixture.stop();
});

function cacheDir(): string {
  return mkdtempSync(join(tmpdir(), "linkcheck-"));
}

describe("scripts/linkcheck.ts", () => {
  test("runs under bare node and reports a resolving URL", async () => {
    fixture.route("/robots.txt", robots({})).route("/doc", text("hello"));
    const run = await runNodeScript(CLI, [fixture.url("/doc"), "--json"], {
      env: { LINKCHECK_CACHE_DIR: cacheDir() },
    });

    expect(
      run.code,
      `the CLI exited ${run.code}: ${run.stderr}. Bare node resolves relative imports literally, ` +
        "so a missing `.ts` extension in one of them works under vitest and fails only here — the " +
        "first time anyone runs the tool the way its usage line says to.",
    ).toBe(0);
    const report = JSON.parse(run.stdout);
    expect(report.results[0]).toMatchObject({ ok: true, status: 200, source: "live" });
    expect(fixture.log.map((r) => r.path)).toEqual(["/robots.txt", "/doc"]);
  });

  test("a 404 link fails the run with a non-zero exit", async () => {
    fixture.route("/robots.txt", robots({}));
    const run = await runNodeScript(CLI, [fixture.url("/missing")], { env: { LINKCHECK_CACHE_DIR: cacheDir() } });
    expect(
      run.code,
      "a cited URL that 404s exited 0. A link checker that cannot fail is a link checker nobody " +
        "will notice has stopped working.",
    ).toBe(1);
    expect(run.stdout).toContain("FAIL");
  });

  test("a robots.txt disallow is reported as unverified, not as a broken link", async () => {
    fixture.route("/robots.txt", robots({ disallow: ["/closed"] })).route("/closed", text("hello"));
    const run = await runNodeScript(CLI, [fixture.url("/closed"), "--json"], { env: { LINKCHECK_CACHE_DIR: cacheDir() } });

    const result = JSON.parse(run.stdout).results[0];
    expect(result.reason).toContain("disallowed by robots.txt");
    expect(
      result.verdict,
      "a URL we were not allowed to look at was reported as broken. Being told not to look is not " +
        "the same as finding nothing there, and the difference is whether someone is sent to fix a " +
        "link that works.",
    ).toBe("unverifiable");
    expect(
      run.code,
      "an unverified citation failed the run. Every host that disallows bots would then have to be " +
        "removed from the repository's documentation to keep the check green.",
    ).toBe(0);
    expect(fixture.requestsTo("/closed"), "the disallowed URL was requested anyway.").toEqual([]);
  });

  test("a stored answer is served without a request and says it is stored", async () => {
    const dir = cacheDir();
    fixture.route("/robots.txt", robots({})).route("/doc", text("hello"));

    const first = await runNodeScript(CLI, [fixture.url("/doc"), "--json"], { env: { LINKCHECK_CACHE_DIR: dir } });
    expect(first.code).toBe(0);

    const stored = readdirSync(dir);
    expect(stored.length, "the fetch wrote no stored copy").toBe(1);
    // `path.resolve` is lexical while the OS may hand back a resolved path:
    // on macOS a temp dir is /var/... on one side and /private/var/... on the
    // other, and a raw string comparison fails for a file that is exactly where
    // it should be. Compare against the real path of the parent.
    expect(realpathSync(join(dir, stored[0])).startsWith(realpathSync(dir))).toBe(true);

    const before = fixture.log.length;
    const second = await runNodeScript(CLI, [fixture.url("/doc"), "--stored"], { env: { LINKCHECK_CACHE_DIR: dir } });
    expect(second.code).toBe(0);
    expect(
      second.stdout,
      "the run answered from a stored copy without saying so. An answer that might be months old " +
        "reads exactly like a live one unless the report distinguishes them.",
    ).toContain("stored copy from");
    expect(fixture.log.length, "the stored run went to the network anyway").toBe(before);
  });

  test("a non-URL argument is a usage error, not a crash", async () => {
    const run = await runNodeScript(CLI, ["not a url"], { env: { LINKCHECK_CACHE_DIR: cacheDir() } });
    expect(run.code).toBe(2);
    expect(run.stderr).toContain("Not a URL");
  });

  test("--help works without touching the network", async () => {
    const run = await runNodeScript(CLI, ["--help"], { env: { LINKCHECK_CACHE_DIR: cacheDir() } });
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Exit status:");
    expect(fixture.log, "--help made a request").toEqual([]);
  });
});
