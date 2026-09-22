// SPDX-License-Identifier: Apache-2.0
/**
 * An async bridge to the scripts this repository ships.
 *
 * Async is not a style choice. `execFileSync` blocks Node's event loop for the
 * whole life of the child, so a test that starts the HTTP fixture in-process and
 * then calls a child synchronously deadlocks: the fixture can never accept the
 * connection the child is waiting on, the child times out, and every request
 * fails as a network error with nothing in the log to explain it. Every call
 * here goes through `promisify(execFile)` and every caller awaits it.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

/** Run a command, returning its exit code instead of throwing on a non-zero one. */
export async function sh(command: string, args: string[], options: RunOptions = {}): Promise<Run> {
  try {
    const { stdout, stderr } = await run(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env } as NodeJS.ProcessEnv,
      timeout: options.timeoutMs ?? 30_000,
      maxBuffer: 16 * 1024 * 1024,
      encoding: "utf8",
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number | string; stdout?: string; stderr?: string; message: string };
    if (typeof e.code !== "number") {
      throw new Error(`${command} did not run: ${e.message}`);
    }
    return { code: e.code, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

/** Run a script bundled with a skill, by its path inside the skill directory. */
export async function runSkillScript(skillPath: string, relative: string, args: string[], options: RunOptions = {}): Promise<Run> {
  return sh(`${skillPath}/${relative}`, args, options);
}

/** Run one of this repository's own `.ts` tools with bare `node`. */
export async function runNodeScript(path: string, args: string[], options: RunOptions = {}): Promise<Run> {
  return sh(process.execPath, [path, ...args], options);
}
