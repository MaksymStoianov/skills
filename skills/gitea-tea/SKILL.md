---
name: gitea-tea
description: Manages issues, pull requests, labels, comments, and releases on a Gitea server via the official `tea` CLI — structured issue descriptions with checklists, Gitea's native scoped/exclusive labels (Kind/*, Priority/*), and the PR review/merge workflow. Use when creating or triaging issues, reviewing/merging pull requests, or managing labels and releases on Gitea from the command line.
license: Apache-2.0
metadata:
  author: Maksym Stoianov
  version: "1.0.0"
---

# Gitea tea

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

tea issues close 42
tea issues reopen 42
```

`--description-file -` reads the body from stdin — prefer it over `--description` for anything longer than one line; it avoids shell-escaping the checklist markdown.

### Structured issue bodies

A body that's one paragraph of context plus a `- [ ]` checklist reads better than free-form prose, both for humans and for closing-PR auto-linking (`Closes #42`). Keep the paragraph to the *why*; put the *what* in the checklist so progress is trackable from the issue list view.

## Labels: scoped and exclusive

Gitea labels containing a `/` are **scoped** — `Kind/Bug`, `Priority/High`. The scope is everything before the last `/`. Two labels in the same scope can be marked **Exclusive** in the Gitea web UI, which makes assigning one automatically remove any other label in that scope from the issue — the standard way to model "exactly one kind" / "exactly one priority."

```bash
tea labels list
tea labels create --name "Priority/Critical" --color "#d73a4a" --description "Blocks a release"
tea issues edit 42 --add-labels "Priority/Critical" --remove-labels "Priority/Medium"
```

A reasonable default taxonomy — adapt names to the project, not mandatory:

- **`Kind/*`** (exclusive): `Bug`, `Feature`, `Enhancement`, `Documentation`, `Testing`, `Security`
- **`Priority/*`** (exclusive): `Critical`, `High`, `Medium`, `Low`

## Pull requests

```bash
tea pulls list
tea pulls checkout 17          # check out the PR branch locally
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

## Verification

- [ ] Every issue/PR body is one paragraph of context plus a checklist, not undifferentiated prose.
- [ ] `Kind/*` and `Priority/*` (or the project's equivalent scopes) are marked Exclusive in the Gitea UI, not just named with a `/`.
- [ ] Label edits on existing issues use `--add-labels`/`--remove-labels`/`--set-labels`, never a bare `--labels`.
- [ ] The merge `--style` used matches the repository's configured allowed merge styles.
