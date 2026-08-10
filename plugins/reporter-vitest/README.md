# @orion/plugin-reporter-vitest

Turns `vitest --reporter=json` output into a `test-results` report, ready for
[`@orion/plugin-viewer-test-results`](../viewer-test-results) to render.

```sh
vitest run --reporter=json --outputFile results.json

orion generate \
  --reporter @orion/plugin-reporter-vitest \
  --storage @orion/plugin-storage-filesystem \
  --storage-path ./reports \
  results.json
```

## Options

| Option | Type | Notes |
| --- | --- | --- |
| `--reporter-root` | string | Directory reported file paths are relative to. Default: the working directory |
| `--reporter-absolute-paths` | boolean | Report paths exactly as vitest emitted them |

Both are also available bare (`--root`, `--absolute-paths`) when the storage
plugin has not claimed those names.

Vitest records **absolute** paths, which read badly in a report opened on
another machine — `/home/runner/work/repo/src/a.test.ts` tells a reader nothing
they want. So paths are relativised against `--reporter-root`, which is normally
wherever the test run was rooted:

```sh
orion generate … --reporter-root ./packages/cli ./results/cli.json
# -> test/args.test.ts, rather than C:/…/packages/cli/test/args.test.ts
```

A path that falls outside the root stays absolute rather than becoming a chain
of `..`. `--reporter-absolute-paths` turns the whole thing off.

Positionals are paths and globs, and are expanded relative to the **working
directory** — not to `--reporter-root`, which only describes what the paths
*inside* the results are relative to. The two are routinely different places.

## Several inputs merge into one report

`generate` produces exactly one report, so a sharded run merges:

```sh
vitest run --shard=1/2 --reporter=json --outputFile results-1.json
vitest run --shard=2/2 --reporter=json --outputFile results-2.json
orion generate … "results-*.json"
```

- Files are concatenated in input order and **not** deduplicated by path: two
  projects legitimately run the same file, and collapsing them would hide a
  failure.
- Totals are **recomputed from the cases**, never copied from vitest's
  `numFailedTests`, so the summary can never disagree with the list rendered
  underneath it.
- The run is successful only if every input said so *and* no case or file
  failed.
- `startedAt` is the earliest start; the duration runs to the latest file end.

## What it maps

Vitest's `pending` and `disabled` fold into `skipped`; `passed`, `failed` and
`todo` carry over. An **unrecognised** status also folds to `skipped` rather
than throwing — refusing to report a whole run because a future vitest added a
word would be a bad trade.

A duration that vitest omitted stays omitted: absent means the test never ran,
which is not the same as taking 0 ms, and the viewer renders the two
differently. A file with no tests but a `message` is a collection failure — it
counts as a failed file even though no test failed.

Coverage and snapshot summaries are not carried; see
[`@orion/report-test-results`](../../packages/report-test-results) for the full
list of what the schema leaves out and why.

## When the input is not vitest output

Reading is deliberately loud, with three distinguishable messages: the file
could not be read, it is not valid JSON, or it parsed but is not a runner result
file — that last one names the command that produces one. Nothing is stored when
any of them happens, because the reporter runs before the storage plugin.

The shape check is structural rather than a vitest version marker, which is why
jest's near-identical `--json` output would also parse. That is not tested here,
so treat it as a happy accident rather than a supported feature.

## Regenerating the fixtures

`test/fixtures/real-run.json` is **captured from a real run** — the surest way
for this plugin to break is a hand-written fixture drifting from what vitest
actually emits. Recapture it with:

```sh
cd packages/report-test-results
pnpm exec vitest run --reporter=json \
  --outputFile ../../plugins/reporter-vitest/test/fixtures/real-run.json
```

The other fixtures are hand-written on purpose: they carry the cases a green
local run does not produce (failures, `todo`, a collection error, a status from
the future), and `mixed.json` uses `/repo/…` paths so the relativisation
assertions hold on Windows and POSIX alike.
