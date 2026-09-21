#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Verify that every external URL this repository cites still resolves.
 *
 * A skill that tells an agent "check the upstream source" is only as good as
 * the link it points at, and a link rots silently: nothing in a markdown file
 * fails when the page behind it moves. This is the check that does.
 *
 * Usage:
 *   node scripts/linkcheck.ts                 # every URL cited in the repository
 *   node scripts/linkcheck.ts <url>...        # just these
 *   node scripts/linkcheck.ts --json          # machine-readable report
 *   node scripts/linkcheck.ts --stored        # answer from stored copies where possible
 *   node scripts/linkcheck.ts --help
 *
 * Exit status: 0 every URL resolved, 1 at least one did not, 2 usage error.
 *
 * Behind an HTTP proxy, run it as `NODE_USE_ENV_PROXY=1 node scripts/linkcheck.ts`.
 * Node's fetch ignores HTTP_PROXY/HTTPS_PROXY unless that flag is set, so in a
 * proxied environment every request otherwise fails DNS resolution and the run
 * reports every cited URL as unreachable — which looks exactly like the links
 * having rotted. `npm run test:live` sets it.
 *
 * Relative imports carry their `.ts` extension because this file is meant to be
 * run by bare `node`, which resolves specifiers literally. vitest does not need
 * the extension, so a file that only ever runs under test appears to work and
 * fails the first time someone runs it directly.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { DisallowedError, PoliteFetcher, StopError } from "./fetch.ts";
import { REPO_ROOT } from "./testkit/repo.ts";

/**
 * Stored copies live here. Nothing fetched belongs in version control, so this
 * directory is git-ignored and only its README is tracked. The env override
 * exists so a test can point it at a temp dir rather than the working tree.
 */
export const CACHE_DIR = process.env.LINKCHECK_CACHE_DIR ?? join(REPO_ROOT, ".cache", "linkcheck");

const SKIP_DIRS = new Set([".git", "node_modules", ".cache", ".idea", ".junie"]);
const TEXT_FILES = /\.(md|json|txt|ts|sh|ya?ml|template)$/;
/** A lockfile's URLs are a package manager's registry addresses, not this
 * repository's citations: they are generated, they are already verified by the
 * integrity hash beside them, and there are hundreds of them. */
const SKIP_FILES = new Set(["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"]);

/** Hosts that answer a bot with a challenge rather than the page, so a red line
 * would be about the bot policy and not about the link. */
export const UNCHECKABLE_HOSTS = new Set(["img.shields.io"]);

export interface Citation {
  url: string;
  file: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TEXT_FILES.test(entry.name) && !SKIP_FILES.has(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Whether a string found in a file is a URL someone could actually visit.
 *
 * Source files are full of URL-shaped text that is not a citation: a template
 * with `${port}` in it, a loopback address in a test fixture, a reserved example
 * domain. Checking those reports a broken link for a URL nobody published.
 */
export function isCheckableUrl(candidate: string): boolean {
  if (/[${}<>]/.test(candidate)) return false;
  // A `.git` clone URL is an address for git, not a page to GET. GitHub's own
  // robots.txt disallows those paths, so checking one reports a broken link for
  // a URL that is working exactly as intended.
  if (/\.git$/.test(candidate)) return false;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
  // RFC 2606 / RFC 6761 reserved names, which exist precisely so that nothing
  // resolves them.
  return !/(^|\.)(example\.(com|net|org)|test|invalid|localhost)$/.test(host);
}

/** Every http(s) URL cited in a tracked text file, deduplicated by URL. */
export function collectCitations(root = REPO_ROOT): Citation[] {
  const seen = new Map<string, Citation>();
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/https?:\/\/[^\s"'`)<>\]]+/g)) {
      const url = match[0].replace(/[.,;:]+$/, "");
      if (!isCheckableUrl(url)) continue;
      if (!seen.has(url)) seen.set(url, { url, file: file.slice(root.length + 1) });
    }
  }
  return [...seen.values()].sort((a, b) => a.url.localeCompare(b.url));
}

export type Verdict =
  /** Answered, with a status below 400. */
  | "ok"
  /** Answered 4xx/5xx, or did not answer at all: the citation is dead. */
  | "broken"
  /** We were not allowed to look, so we say so rather than guessing either way. */
  | "unverifiable";

export interface LinkResult {
  url: string;
  file?: string;
  verdict: Verdict;
  ok: boolean;
  status?: number;
  source?: "live" | "stored";
  storedAt?: string;
  reason?: string;
}

export async function checkUrls(
  citations: Citation[],
  options: { version?: string; cacheDir?: string; preferStored?: boolean; fetcher?: PoliteFetcher } = {},
): Promise<LinkResult[]> {
  const fetcher =
    options.fetcher ?? new PoliteFetcher({ version: options.version, cacheDir: options.cacheDir ?? CACHE_DIR });
  const results: LinkResult[] = [];
  for (const { url, file } of citations) {
    if (UNCHECKABLE_HOSTS.has(new URL(url).host)) {
      results.push({ url, file, verdict: "unverifiable", ok: true, reason: "host does not serve bots; not checked" });
      continue;
    }
    try {
      const res = await fetcher.fetch(url, { preferStored: options.preferStored });
      const ok = res.status < 400;
      results.push({
        url,
        file,
        verdict: ok ? "ok" : "broken",
        ok,
        status: res.status,
        source: res.source,
        storedAt: res.storedAt,
        reason: ok ? undefined : `HTTP ${res.status}`,
      });
    } catch (error) {
      // Being told not to look is not the same as finding nothing there. A
      // robots.txt disallow or a 403/429 means the citation is unverified, and
      // reporting it as broken would send someone to fix a working link.
      const unverifiable = error instanceof StopError || error instanceof DisallowedError;
      results.push({
        url,
        file,
        verdict: unverifiable ? "unverifiable" : "broken",
        ok: unverifiable,
        reason: `${(error as Error).name}: ${(error as Error).message}`,
      });
    }
  }
  return results;
}

function version(): string {
  try {
    return JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    const source = readFileSync(new URL(import.meta.url), "utf8");
    const doc = source.split("*/")[0].replace(/^(\/\*\*|#!.*|\/\/.*)$/gm, "").replace(/^ \* ?/gm, "");
    process.stdout.write(doc.trim() + "\n");
    return 0;
  }
  const json = argv.includes("--json");
  const preferStored = argv.includes("--stored");
  const urls = argv.filter((a) => !a.startsWith("-"));
  for (const u of urls) {
    try {
      new URL(u);
    } catch {
      process.stderr.write(`Not a URL: ${u}. See --help.\n`);
      return 2;
    }
  }

  const citations = urls.length ? urls.map((url) => ({ url, file: "<argv>" })) : collectCitations();
  const results = await checkUrls(citations, { version: version(), preferStored });

  if (json) {
    process.stdout.write(JSON.stringify({ results }, null, 2) + "\n");
  } else {
    const label = { ok: "ok  ", broken: "FAIL", unverifiable: "?   " } as const;
    for (const r of results) {
      const where = r.source === "stored" ? ` (stored copy from ${r.storedAt}, not the live source)` : "";
      process.stdout.write(
        `${label[r.verdict]} ${r.url} ${r.status ?? ""}${where}${r.reason ? ` — ${r.reason}` : ""}\n`,
      );
    }
  }
  const failed = results.filter((r) => r.verdict === "broken");
  if (failed.length && !json) {
    process.stderr.write(`\n${failed.length} of ${results.length} cited URLs did not resolve.\n`);
  }
  return failed.length ? 1 : 0;
}

if (import.meta.filename === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}
