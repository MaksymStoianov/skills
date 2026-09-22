# Working rules for this repository

Rules for any agent working here — Claude Code, Codex, Gemini CLI, Cursor or a
person. `CLAUDE.md` is a single `@AGENTS.md` import, so Claude Code reads this
file itself rather than a summary of it that can drift.

**This repository is public and Apache-2.0.** Most of what follows exists
because of that one fact: whatever lands here is published, and publication is
the step that cannot be undone by a later commit.

## 1. Skills arrive one of two ways, and never by hand

- **Authored here.** `skills/<name>/SKILL.md`, plus `scripts/`, `references/`
  and `assets/` as needed. These are the repository's own work and ship under
  its licence.
- **Installed from elsewhere.** Added with the installer, never hand-copied, so
  [`skills-lock.json`](./skills-lock.json) stays the single source of truth for
  what is installed and at which hash. The canonical copy lives under
  `.agents/skills/<name>/`, symlinked into each agent's directory.

`.agents/skills/` is tracked, which makes it the trap: a skill installed there
to *use* is published on the next push. A skill whose licence does not permit
that — anything not Apache-2.0 and not recorded in
[`THIRD-PARTY.md`](./THIRD-PARTY.md) — must be git-ignored by name, both the
canonical copy and its symlink. `tests/repo/license.test.ts` reads the declared
licence of every `SKILL.md` git actually tracks and fails on any that is
neither, so the mistake is caught rather than discovered by a reader.

## 2. Every bug and every feature gets an issue, and a commit closes it

1. **Issue first.** Before fixing a bug or building a feature, open one:
   ```bash
   gh issue create --title "..." --body "..." --label bug   # or enhancement, documentation
   ```
   One issue per distinct bug or feature. A batched cleanup may share a single
   issue if its body lists everything it covers.

2. **Close it from the commit.** The commit that lands the work ends with the
   closing keyword on its own line, before the attribution trailers:
   ```
   feat(scope): short summary

   Longer explanation if needed.

   Closes #42

   Co-Authored-By: ...
   ```
   Use `Closes #N` / `Fixes #N`, one line per issue.

3. **Work already committed, or already in an open PR.** Still open the issue,
   then link it without rewriting history: add `closes #N` to the pull request
   description, or comment the commit SHA on the issue and close it there. Do
   not force-push an existing branch merely to add a trailer.

4. **Don't leave the trail one-sided.** An issue whose work has landed must be
   closed; a change that landed without an issue gets one retroactively.

### Note on `gh` in the sandbox

`gh` cannot read the keyring from inside the default Bash sandbox and reports
`The token in keyring is invalid` even when the token is fine. Run it with the
sandbox disabled, or ask the user to run `! gh ...`. Check `gh auth status`
outside the sandbox before concluding that authentication is actually broken.

## 3. No session links anywhere in the repository

A commit message ends with `Co-Authored-By:` and nothing else — no
`Claude-Session:` trailer. A pull request description ends with the "Generated
with Claude Code" line and nothing after it. A session URL cannot be opened by
anyone but its author, and both places keep it forever.

This rule is absolute here, with nothing grandfathered: `main` was rewritten on
2026-09-22 and carries none. Keep it that way, because the only way back is
another rewrite of published history.

## 4. Nothing fetched goes into version control

[`.cache/`](./.cache/README.md) is ignored and only its README is tracked. What
the tooling downloads is working data for whoever is running it: third-party
page text must not accumulate in the history as a side effect of a test run.
The history is the part that cannot be cleaned up later without a rewrite.

The same applies to run artifacts. `claude plugin eval` writes a full
transcript of every run to `tests/skills/results/`, which is ignored for the
same reason.

## 5. Fetching is done like a tool that expects to be audited

The rules live in [`scripts/fetch.ts`](./scripts/fetch.ts) and have **no
override flag** on purpose. Do not add one, and do not work around them. A rule
with an escape hatch is a default, and defaults are what get passed over at 2am.

- **Identify the tool.** The User-Agent names the script and this repository,
  never a browser. An operator who cannot tell a bot from a person cannot ask
  it to stop, so they block the address instead.
- **Read `robots.txt` first**, once per host. A disallowed path is not fetched
  at all — deciding after the request is, from the host's side, the same as not
  checking. An **unreadable** `robots.txt` (5xx, timeout, refused) disallows
  everything; a **missing** one (4xx) allows everything.
- **Honour crawl-delay**, and never exceed one request per second per host even
  where none is published. The clock starts when the response arrives, not when
  the request is handed to the socket — otherwise a slow first connection and a
  reused second put the two closer together on the wire than promised.
- **403, 429 and 503 mean stop.** Report why, and say what to check by hand.
  Never retry through it, never rotate a User-Agent, never touch a
  bot-protection challenge.
- **Say when an answer came from a stored copy** rather than the live source. A
  check that "passes" against a months-old local file while the source was
  never reached is worse than an honest failure.
- **Being refused is not the same as finding nothing.** A robots disallow or a
  stop status makes a citation *unverified*, not *broken*; reporting it as
  broken sends someone to fix a working link.

`tests/template/unit/` holds these rules against an injected transport and
`tests/template/integration/` binds them over real HTTP against a loopback
fixture. Changing the behaviour means changing those tests, deliberately.

## 6. No secrets, no real people in fixtures

No live keys or tokens in the tree — and if one ever lands, rotate it at the
provider, because deleting the file does not remove it from the history.
Fixtures are synthetic: `example.com`, loopback addresses, invented companies,
invented names. Never a real customer export, a real screenshot of someone's
account, a real support thread.

Commit metadata is published permanently in every clone. Check that the author
identity on a commit is the one intended to be public.

## 7. Cite the source, not this repository

A skill's answer cites the tool's own reference, the SPDX entry or the
platform's own rules page — the thing the reader can check. A `references/*.md`
file here is where the author looked it up, never the authority.

Every claim about a third-party CLI's surface is either pinned to a citation or
carries a stated way to re-establish it (`tea issues edit --help`,
`gh <command> --help`). A paraphrase with neither ages into a confident wrong
answer that reads exactly like a correct one, and the contract enforces that a
skill's Gotchas say how to re-check.

## 8. Licence hygiene

One licence for everything: **Apache-2.0**, [`LICENSE`](./LICENSE) at the root,
verbatim terms with the appendix filled in.

- Code or prose copied from elsewhere arrives with its licence and its notices,
  or it does not arrive. Check the source's actual `LICENSE`, not a README's
  summary: source-available terms (SUL, BUSL, SSPL) and "no licence at all" both
  look like open source from a distance and neither can be redistributed here.
- Third-party material in this tree keeps its own licence file and is listed in
  [`THIRD-PARTY.md`](./THIRD-PARTY.md), with any upstream `NOTICE` propagated —
  and its absence recorded as checked rather than left looking like an oversight.
- Every file this repository wrote carries `SPDX-License-Identifier: Apache-2.0`,
  so a copied file travels with its terms. Under `skills/` that is the whole
  mechanism, not a formality: an installer copies the skill directory and leaves
  the root `LICENSE` behind, so the `SKILL.md` frontmatter (`license:` and
  `metadata.copyright:`) plus a header in every bundled file are all the
  installed copy says about its terms. A licence *file* inside a skill directory
  means the opposite here — it is this tree's marker for someone else's code
  (§1), so the repository's own skills must not carry one.
- The SPDX id is stated in `package.json`, `plugin.json`, every `SKILL.md`
  frontmatter, and **every plugin entry in every marketplace manifest** — that
  entry is what a consumer reads at install time, which makes it the worst place
  for the licence to be absent.
- Never write `UNLICENSED` into a field that expects SPDX: it is npm's own
  convention for a package granting no licence, not an SPDX identifier, and the
  nearest real one, `Unlicense`, is a public-domain dedication meaning close to
  the opposite.

`npm run lint` enforces all of it, and `tests/repo/license.test.ts` proves each
rule fires by handing it a tree broken in exactly that way.

## 9. Claims about third parties carry their evidential strength

A patent application is a filing, not a shipped product. A vendor study is
vendor research, correlational and usually unreplicated. One scanner's verdict
is one scanner's verdict, and naming it commits this repository to its accuracy.
Every claim of that kind states what it actually rests on, in the same sentence
— that labelling is what makes the claim safe to publish, so do not "tighten" it
away in an edit.

Never assert wrongdoing by a named person or company. Never state that a name is
free to use, or that no patent applies.

A security fix is the sharpest case. Once published, a commit message that
explains how the bug was exploited is a working recipe for everyone still
holding an unpatched copy. Describe what the patched code now guarantees, not
what used to get through — the skills' own Security Fixes tables say the same
thing, and this repository is bound by them too.

## 10. The test suite is the contract

Run `npm test` before every commit. It is fast, offline apart from a loopback
socket, and covers five layers described in [`tests/README.md`](./tests/README.md).

- A new skill needs a thin `tests/skills/<name>/contract.test.ts` calling
  `describeSkill()`, and an eval set in `tests/skills/<name>/evals.ts`. Run
  `npm run test:behaviour:gen` and commit the generated tree.
- A new contract check needs a mutation in `tests/repo/contract-fires.test.ts`,
  or the suite fails. A rule only ever seen passing is indistinguishable from
  one that cannot fail.
- When a check fires, establish whether the content or the check is wrong before
  changing either. A check that fires on correct content is worse than no check.
  Scope an assertion to where it matters: a superseded figure in a change log is
  the change log working; the same figure in a rules table is a wrong answer
  waiting to be quoted.
- Put the consequence in every assertion message, so a red line explains itself.
- The behaviour layer costs real money — cases × runs × 2 arms, plus judge
  calls. It is a release gate, never a commit gate. Validate it for free with
  `npm run test:behaviour:validate`.

## 11. Before anything leaves this repository

Run a pre-publication check over what is about to become public and act on the
blockers first: licences and attribution of anything copied in, secrets and
third-party personal data, claims about named companies, and the rules of the
channel it is going to.

**The audit covers the history, not just the working tree.** A force-push does
not retract what was published: GitHub keeps the old commits reachable by their
SHA, forks and clones keep their copies, and a pull request that referenced them
keeps the reference. Deciding what is publishable is therefore a decision made
before the first push, not after.
