---
name: gitea-tea
description: Manages issues, pull requests, labels, comments, and releases on a Gitea server via the official `tea` CLI — detects each repo's own issue templates and label set before drafting, type-specific structured bodies (bug/feature/tech debt/spike) with checklists, Gitea's native scoped/exclusive labels (Kind/*, Priority/*), a preview-and-confirm step before creating, and the PR review/merge workflow. Use when creating or triaging issues, reviewing/merging pull requests, or managing labels and releases on Gitea from the command line.
license: Apache-2.0
compatibility: Requires the tea CLI (https://gitea.com/gitea/tea); scripts/check-exclusive-labels.sh requires python3.
metadata:
  author: Maksym Stoianov
  version: "1.1.0"
---

# Gitea tea

## Available files

- **`references/cli-reference.md`** — full flag tables for `issues`, `pulls`, `labels`, `comments`, `milestones`, `releases`, `login`. Load it when a command needs a flag not shown in the examples below.
- **`references/detecting-conventions.md`** — where to look for this repo's own issue templates and label set before drafting anything (`.gitea/issue_template/`, `tea labels list`, `CONTRIBUTING.md`). Read it before assuming the `Kind/*`/`Priority/*` defaults below apply here.
- **`references/issue-templates.md`** — structured body templates by issue type (bug, feature, tech debt, spike). Use only when the repo has no issue template of its own.
- **`assets/gitea-issue-templates/`** — ready-to-copy example `.gitea/issue_template/*.yaml` (and legacy `.gitea/ISSUE_TEMPLATE/*.md`) files, to offer scaffolding when a repo has no issue template at all. See `references/detecting-conventions.md` §5 — copy these only with the user's explicit agreement.
- **`scripts/check-exclusive-labels.sh`** — checks a comma-separated label list for two labels sharing the same scope (e.g. `Kind/Bug,Kind/Feature`) before it reaches `tea`, which can't catch this itself (see Gotchas). Run with `--help` for usage.

## Setup

```bash
tea login add   # prompts for server URL and an application token (Settings > Applications)
tea whoami      # confirm the active login
```

Config lives at `$XDG_CONFIG_HOME/tea` (`~/.config/tea/config.yml` by default). `tea` auto-detects the repo and login from the current directory's git remote — `--repo`/`--login`/`--remote` only need setting to override that.

## Issues

```bash
tea issues list                                    # open issues in the current repo
tea issues list --state all --labels "Kind/Bug"    # filter by state and label
tea issue 42                                        # view one issue
```

### Creating an issue

1. **Check for a duplicate** — `tea issues list --state all --keyword "<keywords>"`.
   Link to a near-duplicate instead of filing again.
2. **Detect this repo's own conventions** before drafting — see
   `references/detecting-conventions.md`. Check for a `.gitea/issue_template/`
   (or `.gitea/ISSUE_TEMPLATE/`) file and the repo's actual `tea labels list`
   output. If the repo has its own template, use its structure and default
   labels instead of the generic one below. If it has **none**, offer to
   scaffold one from `assets/gitea-issue-templates/` (§5 of the reference
   doc) — only with the user's agreement, never silently.
3. **Draft the body** using the type-specific template from
   `references/issue-templates.md` (bug/feature/tech debt/spike) if the repo
   has no template of its own — see Structured issue bodies below.
4. **Present a preview** — title, labels, assignees, and the body (in full,
   it's usually short) — and **wait for user confirmation** before creating.
5. **Create it**:
   ```bash
   tea issues create \
     --title "Add pagination to the widgets endpoint" \
     --description-file - \
     --assignees octocat \
     --labels "Kind/Feature,Priority/Medium" <<'EOF'
   One paragraph: the problem, the context, and the expected behavior.

   ### Checklist

   - [ ] Implement the change
   - [ ] Add/update tests
   - [ ] Update docs if the public behavior changed
   EOF
   ```
   `--description-file -` reads the body from stdin — prefer it over
   `--description` for anything longer than one line; it avoids
   shell-escaping the checklist markdown.
6. **Report back** the issue number and URL.

```bash
tea issues close 42
tea issues reopen 42
```

### Structured issue bodies

A body that's one paragraph of context plus a `- [ ]` checklist reads better than free-form prose, both for humans and for closing-PR auto-linking (`Closes #42`). Keep the paragraph to the *why*; put the *what* in the checklist so progress is trackable from the issue list view. For a fuller body — bug reports with repro steps, features with acceptance criteria, tech debt, spikes — use the matching template in `references/issue-templates.md` rather than stretching the generic shape above to fit.

## Labels: scoped and exclusive

Gitea labels containing a `/` are **scoped** — `Kind/Bug`, `Priority/High`. The scope is everything before the last `/`. Two labels in the same scope can be marked **Exclusive** in the Gitea web UI, which makes assigning one automatically remove any other label in that scope from the issue — the standard way to model "exactly one kind" / "exactly one priority."

```bash
tea labels list
tea labels create --name "Priority/Critical" --color "#d73a4a" --description "Blocks a release"

# Verify the label set has no scope conflict before applying it — tea won't warn you.
scripts/check-exclusive-labels.sh "Priority/Critical" && \
  tea issues edit 42 --add-labels "Priority/Critical" --remove-labels "Priority/Medium"
```

A reasonable default taxonomy — check `references/detecting-conventions.md` for what this repo actually has before applying it; adapt names to the project, not mandatory:

- **`Kind/*`** (exclusive): `Bug`, `Feature`, `Enhancement`, `Documentation`, `Testing`, `Security`, `Tech Debt`, `Spike`
- **`Priority/*`** (exclusive): `Critical`, `High`, `Medium`, `Low`

## Pull requests

```bash
tea pulls list
tea pulls checkout 17          # check out the PR branch locally
```

Same as issues: present the title and body to the user and wait for
confirmation before running `pulls create` — it's a visible, not easily
reversible action on the shared repo.

```bash
tea pulls create --title "Fix pagination off-by-one" --description-file - --base main <<'EOF'
What changed and why.
EOF

tea pulls approve 17
tea pulls reject 17             # request changes
tea pulls merge 17 --style squash --title "Fix pagination off-by-one (#17)"
tea pulls clean 17              # delete the local+remote feature branch after merge
```

`--style` accepts `merge`, `rebase`, `squash`, `rebase-merge` — pick the one the project's branch protection expects; a mismatched style is rejected by the server, not silently reinterpreted.

## Comments

```bash
tea comment 42 "Reproduced on staging, investigating."
tea comments list 42
```

## Other entities

`tea` also manages milestones, releases, repository actions (secrets/variables/workflow dispatch), branches, webhooks, and organizations — each follows the same `tea <entity> <list|create|edit|delete>` shape. Run `tea <entity> --help` for the full flag set rather than guessing; flags differ per subcommand (see Gotchas).

## Gotchas

- **`tea issues edit`/`tea pulls edit` have no `--labels` flag.** Editing labels on an existing issue uses `--add-labels`/`--remove-labels`/`--set-labels` (assignees mirror this: `--add-assignees`/`--remove-assignees`/`--set-assignees`). Only `issues create`/`pulls create` take a plain `--labels`. Passing `--labels` to `edit` fails with an unknown-flag error, not a silent no-op.
- **`tea labels create`/`update` cannot set the Exclusive toggle.** The CLI only exposes `--name`, `--color`, `--description`, `--file` — there's no `--exclusive` flag (confirmed against the command source, not just its `--help` text). Creating `Kind/Bug` and `Kind/Feature` via `tea` gives you two ordinary scoped-looking labels that are **not** mutually exclusive until someone checks "Exclusive" for them in the Gitea web UI.
- **`tea` assumes the local branch is already pushed.** Commands like `pulls create` and `pulls clean` operate against what the remote has, not uncommitted or unpushed local state — push first.
- **Merge `--style` must match what the repo allows.** A repo configured to allow only squash merges rejects `--style merge` outright.
- **A repo's own issue template overrides the generic default.** If `.gitea/issue_template/` (or `.gitea/ISSUE_TEMPLATE/`) exists, use its fields and default labels — don't fall back to the paragraph-plus-checklist shape or the `Kind/*`/`Priority/*` taxonomy just because they're this skill's defaults.
- **`tea labels list` output is the source of truth for label names**, not the taxonomy suggested here — `tea` rejects an unknown label name outright rather than creating it on the fly.

## Verification

- [ ] Checked for the repo's own issue template and actual label set (`references/detecting-conventions.md`) before drafting, and used them if present.
- [ ] If no template existed, scaffolding from `assets/gitea-issue-templates/` was only written after the user explicitly agreed.
- [ ] Every issue/PR body is one paragraph of context plus a checklist (or the matching type-specific template from `references/issue-templates.md`), not undifferentiated prose.
- [ ] `Kind/*` and `Priority/*` (or the project's equivalent scopes) are marked Exclusive in the Gitea UI, not just named with a `/`.
- [ ] `scripts/check-exclusive-labels.sh` passes on the final label set before it's sent to `tea`.
- [ ] Label edits on existing issues use `--add-labels`/`--remove-labels`/`--set-labels`, never a bare `--labels`.
- [ ] The user confirmed a preview (title, labels, body) before the issue/PR was created.
- [ ] The merge `--style` used matches the repository's configured allowed merge styles.
