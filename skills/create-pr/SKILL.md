---
name: create-pr
description: Creates a GitHub pull request via the `gh` CLI with a title that matches the repository's own title convention (detected from its commitlint/semantic-pull-request config, CONTRIBUTING docs, or recent merged PR titles — not assumed) and a body populated from its own PR template. Use when creating a PR, pushing a branch for review, or the user says "open a PR", "create a pull request", or "/pr".
license: Apache-2.0
compatibility: Requires git and the GitHub CLI (`gh`), authenticated (`gh auth status`). scripts/validate-pr-title.sh requires bash.
metadata:
  author: Maksym Stoianov
  version: "1.0.0"
---

# Create Pull Request

Creates a GitHub PR whose title matches *this* repository's actual
convention — not a hardcoded one — and whose body follows *this*
repository's own PR template when it has one.

## Available files

- **`references/detecting-conventions.md`** — where to look for a
  repo's title convention (lint bots, CONTRIBUTING docs, merged-PR history)
  and what each signal means. Read it before guessing at a title format.
- **`scripts/validate-pr-title.sh`** — checks a candidate title against a
  Conventional-Commits-shaped pattern (configurable types/pattern) before
  the PR is created. Run with `--help` for usage.

## Steps

1. **Check current state**:
   ```bash
   git status
   git diff --stat
   git log origin/<default-branch>..HEAD --oneline
   ```

2. **Detect the PR title convention** — see
   `references/detecting-conventions.md`. In order: look for a title-lint
   bot or commitlint config, then CONTRIBUTING docs, then recent merged PR
   titles (`gh pr list --state merged --limit 30 --json title`). Only fall
   back to plain Conventional Commits if none of those give an answer, and
   say so explicitly rather than presenting it as the repo's own rule.

3. **Detect scope vocabulary**, if the convention uses scopes. Infer it from
   the repo's own structure (top-level `packages/*` or `apps/*` directory
   names, or a scope list embedded in the lint config) rather than
   inventing scope names — a scope only means something if it matches what
   the repo's own tooling expects.

4. **Check for an implementation plan**: look in whatever plan directory the
   project actually uses (e.g. `.claude/plans/`, `.agents/plans/`,
   `docs/plans/` — check what exists in this repo, don't assume one) for a
   file matching the current branch's ticket ID, if the branch name has one
   (e.g. branch `alice/PROJ-1234-some-feature` → `PROJ-1234.md`). If found,
   ask the user whether to include it in the PR description as a
   collapsible `<details>` section (see Plan Section below). Only include
   it if the user explicitly approves.

5. **If this is a security fix**, check whether the repository is public:
   ```bash
   gh repo view --json isPrivate -q .isPrivate
   ```
   If `true` is returned, treat it as private — normal disclosure applies.
   If the repo is public, audit every public-facing artifact before
   proceeding (see Security Fixes below).

6. **Analyze the diff** to determine:
   - Type: what kind of change is this, per the detected type vocabulary?
   - Scope: which package/area is affected, per the detected scope
     vocabulary (if any)?
   - Summary: what does the change do, in imperative present tense?

7. **Validate the title** before creating the PR:
   ```bash
   scripts/validate-pr-title.sh "<type>(<scope>): <summary>" [--types ...] [--pattern ...]
   ```
   Pass `--types`/`--pattern` matching whatever was detected in step 2. If
   detection found a repo-owned validation script instead, run that one —
   it's the ground truth for what CI will actually check.

8. **Push the branch if needed**:
   ```bash
   git push -u origin HEAD
   ```

9. **Build the PR body.** Look for a template, in order:
   `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE.md`,
   `.github/PULL_REQUEST_TEMPLATE/*.md`, `docs/PULL_REQUEST_TEMPLATE.md`.
   If one exists, use its section structure and populate every section with
   actual content — don't leave template placeholders in the final body. If
   none exists, use the generic structure under PR Body Guidelines below.

10. **Create the PR**:
    ```bash
    gh pr create --draft --title "<title>" --body "$(cat <<'EOF'
    <populated body>
    EOF
    )"
    ```
    Default to `--draft` — it's the reversible choice; the user (or you,
    once asked) can mark it ready with `gh pr ready` before merge. Ask
    first if the user's phrasing implies they want it ready for review
    immediately.

## PR Body Guidelines

Use this structure only when the repo has no PR template of its own:

### Summary
- Describe what the PR does, in plain, concise language.
- Include screenshots/videos for UI changes.

### How to test
- Explain how to verify the change manually.
- Include a minimal repro or example if one is appropriate.
- Note any non-default configuration a tester needs (feature flags, env
  vars, a specific role/permission) to see the change.

### Related issues
- `closes #123` / `fixes #123` / `resolves #123` to auto-close a GitHub
  issue, or the tracker's own URL format if the repo uses Linear/Jira/etc.
  (see `references/detecting-conventions.md`).

### Checklist
- Tests included (bug fixes get a regression test, features get coverage).
- Docs updated, or a follow-up noted, if public behavior changed.
- Anything the repo's own template already requires (breaking-change flag,
  changelog entry, backport label) — carry it over rather than dropping it.

## Examples

```
feat(editor): Add workflow performance metrics display
fix(core): Resolve memory leak in execution engine
fix(auth): Handle rate limiting on token refresh
feat(api)!: Remove deprecated v1 endpoints
chore: Update dependencies to latest versions
```

These use whatever type/scope vocabulary step 2 detected for the target
repo — don't reuse this exact list against a different repo without
re-detecting.

## Plan Section

If a matching plan file was found and the user approved including it, add a
collapsible section at the end of the PR body (after the checklist, before
the closing `EOF`):

```markdown
<details>
<summary>Implementation plan</summary>

<!-- paste plan file contents here -->

</details>
```

## Security Fixes

**Only applies when `gh repo view` confirmed the repository is public.**
Never expose the attack vector in a public-facing artifact. Describe what
the code does, not what it prevents.

| Artifact | Avoid | Prefer |
|---|---|---|
| Branch name | `fix-sql-injection-in-webhook` | `fix-webhook-input-validation` |
| PR title | `fix(core): Prevent SSRF` | `fix(core): Validate outgoing URLs` |
| Commit message | `fix: prevent denial of service` | `fix: add payload size validation` |
| PR body | "attacker could trigger SSRF…" | "validates URL protocol and host" |
| Tracker link | URL/title that names the vulnerability | issue number only, or a URL with no descriptive slug |
| Test name | `'should prevent SQL injection'` | `'should sanitize query parameters'` |

Before pushing a security fix to a public repo, verify: no branch name,
commit message, PR title, PR body, tracker link, test name, or code comment
hints at the vulnerability. When in doubt, check whether the project has
its own security-disclosure policy (`SECURITY.md`) for extra precautions.

## Gotchas

- **A repo's title rule can contradict the "obvious" default.** Some CI
  checks require a capitalized summary and no trailing period; commitlint's
  own default `subject-case` rule requires the opposite (lowercase). Don't
  assume — read the actual config (step 2).
- **Scopes only count if the repo's own tooling recognizes them.** A scope
  name that "sounds right" but isn't in the lint config's allow-list fails
  CI the same as a missing scope.
- **A PR template with unpopulated placeholders is worse than no
  template.** If a section doesn't apply, remove it or explicitly say why,
  rather than leaving the template's instructional text in place.
- **`gh pr create` fails if the branch isn't pushed yet** — push before
  create, not after.

## Verification

- [ ] The title convention (type vocabulary, scope vocabulary, case rules)
      was detected from the repo's own config/history, not assumed from
      this skill's examples.
- [ ] `scripts/validate-pr-title.sh` (or the repo's own lint script, if one
      exists) passes on the final title.
- [ ] The PR body uses the repo's own template when one exists, fully
      populated — no leftover placeholder text.
- [ ] If a plan file was found, it was included only with explicit user
      approval.
- [ ] For a security fix on a public repo, every public-facing artifact was
      checked against the Security Fixes table before pushing.
