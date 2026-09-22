// SPDX-License-Identifier: Apache-2.0
/**
 * A polite HTTP fetcher for repository tooling.
 *
 * Every rule here exists because this repository's skills tell an agent to
 * verify a claim against its upstream source, and the tool that does the
 * verifying is a crawler whose behaviour ends up in someone else's access log.
 * It fetches like something that expects to be audited:
 *
 *   - the User-Agent names this script and this repository, and never a browser;
 *   - `robots.txt` is read before anything else on a host, and an UNREADABLE one
 *     (5xx, timeout, connection refused) disallows everything, while a MISSING
 *     one (4xx) allows everything;
 *   - crawl-delay is honoured, with a floor of one request per second per host;
 *   - 403, 429 and 503 stop the run and are reported, never retried;
 *   - a response carries whether it came from the live source or a stored copy.
 *
 * There is deliberately no override flag. A rule with an escape hatch is a
 * default, and defaults are what get passed over at 2am.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const REPOSITORY_URL = "https://github.com/MaksymStoianov/skills";
export const USER_AGENT_TOKEN = "skills-linkcheck";

/** Never below one request per second per host, whatever robots.txt says. */
export const MIN_INTERVAL_MS = 1000;
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Statuses that end the run for that host rather than being retried. */
export const STOP_STATUSES = [403, 429, 503] as const;

export function userAgent(version: string): string {
  return `${USER_AGENT_TOKEN}/${version} (+${REPOSITORY_URL})`;
}

// --- robots.txt ------------------------------------------------------------

export interface RobotsRules {
  /** Longest-match Allow/Disallow pairs for the group that applies to us. */
  rules: { allow: boolean; path: string }[];
  crawlDelayMs: number | undefined;
  /** Why this ruleset says what it says, for the report. */
  reason: string;
}

export const ALLOW_ALL: RobotsRules = { rules: [], crawlDelayMs: undefined, reason: "no robots.txt (4xx): allowed" };
export const DENY_ALL: RobotsRules = {
  rules: [{ allow: false, path: "/" }],
  crawlDelayMs: undefined,
  reason: "robots.txt unreadable: treated as disallowing everything",
};

/**
 * Parse robots.txt for one user-agent token.
 *
 * Groups are matched by the most specific `User-agent` that applies: our own
 * token wins over `*`. An empty ruleset means "nothing was said about us",
 * which is an allow.
 */
export function parseRobots(text: string, token: string): RobotsRules {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[]; crawlDelay?: number }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastLineWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;
    if (!current) continue;
    if (field === "disallow") current.rules.push({ allow: false, path: value });
    else if (field === "allow") current.rules.push({ allow: true, path: value });
    else if (field === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }

  const lowerToken = token.toLowerCase();
  const exact = groups.find((g) => g.agents.some((a) => a === lowerToken || lowerToken.startsWith(a + "/")));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const chosen = exact ?? wildcard;
  if (!chosen) {
    return { rules: [], crawlDelayMs: undefined, reason: "robots.txt names no group that applies: allowed" };
  }
  return {
    rules: chosen.rules.filter((r) => r.path !== ""),
    crawlDelayMs: chosen.crawlDelay === undefined ? undefined : chosen.crawlDelay * 1000,
    reason: `robots.txt group \`User-agent: ${chosen.agents.join(", ")}\``,
  };
}

/** Standard longest-match rule: the longest matching path wins, Allow breaks ties. */
export function isAllowed(rules: RobotsRules, pathname: string): boolean {
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of rules.rules) {
    const pattern = rule.path;
    if (!matchesRobotsPath(pattern, pathname)) continue;
    const length = pattern.replace(/\*/g, "").length;
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { allow: rule.allow, length };
    }
  }
  return best ? best.allow : true;
}

function matchesRobotsPath(pattern: string, pathname: string): boolean {
  if (pattern === "") return false;
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source =
    "^" +
    body
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*") +
    (anchored ? "$" : "");
  return new RegExp(source).test(pathname);
}

// --- the fetcher -----------------------------------------------------------

export class StopError extends Error {
  // Written out rather than declared as constructor parameter properties: Node
  // executes .ts by stripping types, and a parameter property is syntax it has
  // to emit code for, so it refuses the file outright (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX).
  readonly url: string;
  readonly status: number;

  constructor(url: string, status: number) {
    super(
      `${url} answered ${status}. 403, 429 and 503 are the host saying stop; this run reports that ` +
        "and does not retry, because a retry is the behaviour that gets a crawler blocked outright.",
    );
    this.name = "StopError";
    this.url = url;
    this.status = status;
  }
}

export class DisallowedError extends Error {
  readonly url: string;
  readonly reason: string;

  constructor(url: string, reason: string) {
    super(`${url} is disallowed by robots.txt (${reason}); not fetched.`);
    this.name = "DisallowedError";
    this.url = url;
    this.reason = reason;
  }
}

export interface PoliteResponse {
  url: string;
  status: number;
  body: string;
  /** Whether this answer came from the network or from a stored copy. */
  source: "live" | "stored";
  /** When the stored copy was written, for a report that has to say so. */
  storedAt?: string;
}

export interface FetcherOptions {
  version?: string;
  /** Floor between two requests to the same host. Never lowered below 1s. */
  minIntervalMs?: number;
  timeoutMs?: number;
  /** Directory for stored copies. Nothing fetched belongs in version control. */
  cacheDir?: string;
  /** Injected for tests: a clock, a sleep and a transport. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  transport?: (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;
}

export class PoliteFetcher {
  readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly cacheDir?: string;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly transport: NonNullable<FetcherOptions["transport"]>;
  private readonly robots = new Map<string, RobotsRules>();
  private readonly lastRequestAt = new Map<string, number>();
  /** Hosts that told us to stop; every later URL on them is refused. */
  readonly stopped = new Map<string, number>();

  constructor(options: FetcherOptions = {}) {
    this.userAgent = userAgent(options.version ?? "0.0.0");
    this.minIntervalMs = Math.max(MIN_INTERVAL_MS, options.minIntervalMs ?? MIN_INTERVAL_MS);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cacheDir = options.cacheDir;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.transport = options.transport ?? ((url, init) => globalThis.fetch(url, init));
  }

  private headers(): Record<string, string> {
    return { "user-agent": this.userAgent, accept: "text/html,text/plain,*/*" };
  }

  private async raw(url: string): Promise<{ status: number; body: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.transport(url, { headers: this.headers(), signal: controller.signal });
      return { status: res.status, body: await res.text() };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * One request to a host, no sooner than the interval allows.
   *
   * The clock is stamped when the response comes back, not when the request is
   * handed to the socket. Timing from before connection setup means a slow TLS
   * handshake on the first request and a reused connection on the second put
   * them closer together on the wire than the interval we promised — the host
   * sees 920ms where we believe we waited a second, and our own logs say we
   * behaved.
   */
  private async throttledRaw(host: string, url: string, crawlDelayMs: number | undefined): Promise<{ status: number; body: string }> {
    const wait = this.waitFor(host, crawlDelayMs);
    if (wait > 0) await this.sleep(wait);
    try {
      return await this.raw(url);
    } finally {
      this.lastRequestAt.set(host, this.now());
    }
  }

  /** How long to wait before the next request to this host. */
  waitFor(host: string, crawlDelayMs: number | undefined): number {
    const interval = Math.max(this.minIntervalMs, crawlDelayMs ?? 0);
    const last = this.lastRequestAt.get(host);
    if (last === undefined) return 0;
    return Math.max(0, last + interval - this.now());
  }

  async robotsFor(host: string, origin: string): Promise<RobotsRules> {
    const hit = this.robots.get(host);
    if (hit) return hit;
    let rules: RobotsRules;
    try {
      // Throttled like any other request: robots.txt is a hit on the host's
      // server too, and a crawler that fetches it at full speed has already
      // broken its promise before reading what the promise should be.
      const res = await this.throttledRaw(host, `${origin}/robots.txt`, undefined);
      if (res.status >= 500) rules = DENY_ALL;
      else if (res.status >= 400) rules = ALLOW_ALL;
      else rules = parseRobots(res.body, USER_AGENT_TOKEN);
    } catch {
      // A timeout or a refused connection is an unreadable robots.txt, not a
      // missing one: we do not know what the host permits, so we assume nothing.
      rules = DENY_ALL;
    }
    this.robots.set(host, rules);
    return rules;
  }

  private cachePath(url: string): string | undefined {
    if (!this.cacheDir) return undefined;
    return join(this.cacheDir, `${createHash("sha256").update(url).digest("hex").slice(0, 32)}.json`);
  }

  private readStored(url: string): PoliteResponse | undefined {
    const path = this.cachePath(url);
    if (!path) return undefined;
    try {
      const stored = JSON.parse(readFileSync(path, "utf8")) as { status: number; body: string; storedAt: string };
      return { url, status: stored.status, body: stored.body, source: "stored", storedAt: stored.storedAt };
    } catch {
      return undefined;
    }
  }

  private writeStored(url: string, status: number, body: string): void {
    const path = this.cachePath(url);
    if (!path) return;
    mkdirSync(this.cacheDir!, { recursive: true });
    writeFileSync(path, JSON.stringify({ url, status, body, storedAt: new Date().toISOString() }, null, 2));
  }

  /**
   * Fetch one URL under every rule above. Throws `DisallowedError` when
   * robots.txt forbids it and `StopError` on 403/429/503.
   */
  async fetch(url: string, options: { preferStored?: boolean } = {}): Promise<PoliteResponse> {
    const parsed = new URL(url);
    const host = parsed.host;

    if (options.preferStored) {
      const stored = this.readStored(url);
      if (stored) return stored;
    }

    const stoppedWith = this.stopped.get(host);
    if (stoppedWith !== undefined) throw new StopError(url, stoppedWith);

    const rules = await this.robotsFor(host, parsed.origin);
    if (!isAllowed(rules, parsed.pathname)) throw new DisallowedError(url, rules.reason);

    const res = await this.throttledRaw(host, url, rules.crawlDelayMs);
    if ((STOP_STATUSES as readonly number[]).includes(res.status)) {
      this.stopped.set(host, res.status);
      throw new StopError(url, res.status);
    }
    this.writeStored(url, res.status, res.body);
    return { url, status: res.status, body: res.body, source: "live" };
  }
}
