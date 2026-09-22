// SPDX-License-Identifier: Apache-2.0
/**
 * A loopback HTTP fixture: routes, a request log, and a response builder.
 *
 * The integration layer needs the fetching rules to bind against a real socket,
 * not a stubbed transport — a rule that only holds against an injected function
 * has not been shown to survive contact with HTTP.
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 *   1. `stop()` calls `closeAllConnections()` BEFORE `close()`. `close()` alone
 *      waits for every keep-alive socket to go idle, and a client like curl
 *      holds its connection open, so the fixture hangs on shutdown and the test
 *      run times out with no failing assertion to explain it.
 *   2. Anything that drives this fixture from a child process must do so
 *      asynchronously. `execFileSync` blocks the event loop of the very process
 *      running this server, so the server can never accept the connection the
 *      child is waiting on, and every request fails as a timeout that looks
 *      like a network problem rather than a deadlock.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  at: number;
}

export interface FixtureResponse {
  status: number;
  body: string;
  headers?: Record<string, string>;
  /** Hold the response open this long, to exercise a client-side timeout. */
  delayMs?: number;
}

export type Route = FixtureResponse | ((req: IncomingMessage) => FixtureResponse);

export function text(body: string, status = 200): FixtureResponse {
  return { status, body, headers: { "content-type": "text/plain; charset=utf-8" } };
}

export function html(body: string, status = 200): FixtureResponse {
  return { status, body, headers: { "content-type": "text/html; charset=utf-8" } };
}

/** A robots.txt body, written out rather than hand-concatenated at each call. */
export function robots(lines: { agent?: string; disallow?: string[]; allow?: string[]; crawlDelay?: number }): FixtureResponse {
  const out = [`User-agent: ${lines.agent ?? "*"}`];
  for (const p of lines.allow ?? []) out.push(`Allow: ${p}`);
  for (const p of lines.disallow ?? []) out.push(`Disallow: ${p}`);
  if (lines.crawlDelay !== undefined) out.push(`Crawl-delay: ${lines.crawlDelay}`);
  return text(out.join("\n") + "\n");
}

export class HttpFixture {
  private server: Server | undefined;
  private port = 0;
  readonly routes = new Map<string, Route>();
  readonly log: RecordedRequest[] = [];
  /** Paths with no route answer 404 unless this is set. */
  fallback: FixtureResponse | undefined;

  route(path: string, response: Route): this {
    this.routes.set(path, response);
    return this;
  }

  get origin(): string {
    if (!this.port) throw new Error("fixture is not started; call await fixture.start() first");
    return `http://127.0.0.1:${this.port}`;
  }

  url(path: string): string {
    return `${this.origin}${path}`;
  }

  /** Requests to one path, in arrival order. */
  requestsTo(path: string): RecordedRequest[] {
    return this.log.filter((r) => r.path === path);
  }

  async start(): Promise<this> {
    this.server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    this.port = (this.server!.address() as AddressInfo).port;
    return this;
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const path = (req.url ?? "/").split("?")[0];
    this.log.push({ method: req.method ?? "GET", path, headers: req.headers, at: Date.now() });
    const route = this.routes.get(path);
    const resolved: FixtureResponse =
      route === undefined
        ? (this.fallback ?? { status: 404, body: "not found" })
        : typeof route === "function"
          ? route(req)
          : route;
    const send = (): void => {
      res.writeHead(resolved.status, resolved.headers ?? { "content-type": "text/plain; charset=utf-8" });
      res.end(resolved.body);
    };
    if (resolved.delayMs) setTimeout(send, resolved.delayMs).unref();
    else send();
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    // Order matters: close() alone waits out every idle keep-alive socket.
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

/** Start a fixture, run a body against it, and always shut it down. */
export async function withFixture<T>(
  configure: (fixture: HttpFixture) => void,
  body: (fixture: HttpFixture) => Promise<T>,
): Promise<T> {
  const fixture = new HttpFixture();
  configure(fixture);
  await fixture.start();
  try {
    return await body(fixture);
  } finally {
    await fixture.stop();
  }
}
