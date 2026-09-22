// SPDX-License-Identifier: Apache-2.0
/**
 * The shape of a skill's authored eval set.
 *
 * A behaviour case is written once, here, as data. `gen-behaviour.ts` turns it
 * into the `prompt.md` + `graders/*.md` tree that `claude plugin eval` runs, and
 * a repo test fails when the generated tree has drifted from this source. The
 * alternative — authoring the tree directly and describing it somewhere else —
 * means writing every case twice and discovering the two disagree only when a
 * release gate fails for a reason nobody can reproduce.
 */

/** Grader types `claude plugin eval` implements. `regex`, `tool_used`,
 * `tool_order` and `file_exists` are computed from the transcript and cost
 * nothing; `llm` and `baseline` call a judge model and are charged per run. */
export type GraderType = "regex" | "tool_used" | "tool_order" | "file_exists" | "llm" | "baseline";

/**
 * How a grader is scored against the no-plugin baseline.
 *
 * `with-only` excludes it from the score in both arms and reports it in the
 * with-arm as an indicator: a check like "the skill fired" can never pass
 * without the plugin, so counting it would drive the baseline toward zero and
 * inflate `Δ` into evidence of nothing. `both` forces scoring in both arms,
 * which is what a "must NOT fire" check needs — declining is exactly what the
 * baseline should also do.
 */
export type GraderArm = "with-only" | "both";

export interface EvalGrader {
  /** File name under `graders/`, without the extension. */
  name: string;
  type: GraderType;
  /** Raises this grader's share of the run's score. */
  weight?: number;
  arm?: GraderArm;
  /** Type-specific keys: pattern, flags, match, target, tool, input_match, min, max, path, exists. */
  options?: Record<string, string | number | boolean>;
  /** For `llm`, the rubric; otherwise a note for whoever reads the file. */
  body?: string;
}

export interface EvalCase {
  /** Directory name, and the name `--case` globs match. */
  name: string;
  description: string;
  tags: string[];
  /** Runs per arm. Every run is a real model call, so this is a budget. */
  runs?: number;
  maxTurns?: number;
  timeoutSeconds?: number;
  /** Read-only tools are granted by listing them; anything else needs --allow-tools. */
  allowedTools: string[];
  expectedOutcome?: string;
  prompt: string;
  graders: EvalGrader[];
}

export interface EvalSet {
  /** The skill directory these cases belong to. */
  skill: string;
  cases: EvalCase[];
}
