# `.cache/`

Stored copies of pages this repository's tooling fetched, written by
[`scripts/fetch.ts`](../scripts/fetch.ts) and read back by
`node scripts/linkcheck.ts --stored`.

**Nothing in here is under version control except this file.** These are other
people's pages, fetched to verify a citation. Committing them would redistribute
content this repository has no licence to redistribute, and would make every
verification run show up as a dirty working tree.

A stored copy exists so a report can say where its answer came from: a run that
answers from here prints `stored copy from <timestamp>, not the live source`,
because an answer that might be months old otherwise reads exactly like a live
one.

Delete the directory whenever you like — the next run refetches, at one request
per second per host.
