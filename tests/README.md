# `tests/`

Test cases, and nothing else. The harness lives in
[`scripts/testkit/`](../scripts/testkit) and is reached through the `@testkit`
alias, so moving it never touches a case.

| Layer | Where | Proves | Runner |
|---|---|---|---|
| Contract | `tests/skills/<name>/contract.test.ts` | the skill is well-formed *for its family*, its bundled files are all introduced, and every reference resolves | `npm test` |
| Scripts | `tests/skills/<name>/scripts.test.ts` | each shipped script does what its own header and its SKILL.md say it does | `npm test` |
| Unit | `tests/template/unit/` | the shared machinery in isolation — the frontmatter parser, section extraction, the fetching rules | `npm test` |
| Integration | `tests/template/integration/` | those rules bind over real HTTP, against a loopback fixture, including from a child process | `npm test` |
| Repo | `tests/repo/` | invariants no single skill can see: registration, licensing, sibling hand-off, and that the contract can fail | `npm test` |
| Live | `tests/repo/links.live.test.ts` | every cited URL still resolves, against the real internet | `npm run test:live` |
| Behaviour | `tests/skills/<name>/behaviour/` | the skill changes what the model does | `npm run test:behaviour` |

**The skill is the unit under test.** `tests/skills/<name>/` is its test
directory: one thin file per skill over a shared, family-aware contract in
`scripts/testkit/suite.ts`.

```ts
import { describeSkill } from "@testkit/suite.ts";

describeSkill("gitea-tea", ({ skill, test, expect }) => {
  test("…whatever is true only of this skill", () => { /* … */ });
});
```

## The behaviour layer costs money

`tests/skills/<name>/behaviour/` is generated from `tests/skills/<name>/evals.ts`
by `npm run test:behaviour:gen`, and the generated tree is committed so it can be
reviewed. `tests/repo/behaviour.test.ts` fails when the two have drifted.

Every case runs twice: once with the plugin and once without it, so `Δ` is what
the plugin contributed. A case that scores 1.0 in both arms is evidence the base
model already knew, not that the skill works.

`npm run test:behaviour:validate` loads every case with `--max-cost-usd 0`,
which validates the whole suite — prompts and graders — and aborts before
spending anything. Run that after editing an eval set; run the real thing as a
release gate, never as a commit gate.
