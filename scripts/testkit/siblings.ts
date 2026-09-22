// SPDX-License-Identifier: Apache-2.0
/**
 * Which skills compete for the same prompt, and whether each says so.
 *
 * Vocabulary overlap is a poor proxy for competition. `gitea-tea` and
 * `create-pr` share 8% of their description words and answer the same sentence:
 * "open a pull request." What makes them siblings is the task, not the wording.
 *
 * So grouping is by task phrase, and the requirement on a group is that each
 * member's description states the boundary explicitly. A description is a
 * trigger, not a summary: two skills that both trigger on "open a pull request"
 * and neither of which says when it is the wrong one leave the router to pick on
 * vocabulary, which is how a Gitea repository gets a `gh` command.
 */

import type { Skill } from "./repo.ts";

/** Task phrases that, shared, mean two skills answer the same request. */
export const TASK_PHRASES = [
  "pull request",
  "issue",
  "release",
  "label",
  "commit message",
  "code review",
];

/**
 * A clause that redirects rather than describes: "not X", "for X use Y",
 * "instead of X". This is what distinguishes a description that owns a boundary
 * from one that merely happens to be about something else.
 */
export const HAND_OFF_PATTERNS = [
  /\bnot\b[^.;]{0,80}\b(github|gitea|gitlab|bitbucket|forge)\b/i,
  /\b(instead of|rather than)\b[^.;]{0,80}\b\w+/i,
  /\bfor\b[^.;]{0,60}\buse\b[^.;]{0,60}/i,
  /\bhand(s)? off\b/i,
  /\bdefer(s)? to\b/i,
];

export function taskPhrasesIn(description: string): string[] {
  const lower = description.toLowerCase();
  return TASK_PHRASES.filter((phrase) => lower.includes(phrase));
}

export function hasHandOffClause(description: string): boolean {
  return HAND_OFF_PATTERNS.some((p) => p.test(description));
}

export interface SiblingGroup {
  phrase: string;
  skills: string[];
}

/** Groups of two or more skills whose descriptions share a task phrase. */
export function siblingGroups(skills: Pick<Skill, "dir" | "data">[]): SiblingGroup[] {
  const byPhrase = new Map<string, string[]>();
  for (const skill of skills) {
    for (const phrase of taskPhrasesIn(String(skill.data.description ?? ""))) {
      byPhrase.set(phrase, [...(byPhrase.get(phrase) ?? []), skill.dir]);
    }
  }
  return [...byPhrase.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([phrase, members]) => ({ phrase, skills: members.sort() }))
    .sort((a, b) => a.phrase.localeCompare(b.phrase));
}
