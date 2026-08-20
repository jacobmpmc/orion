# @orion/plugin-reporter-pulumi-diff

Turns `pulumi preview --json` output into a `pulumi-diff` report, ready for
[`@orion/plugin-viewer-pulumi-diff`](../viewer-pulumi-diff) to render.

```sh
pulumi preview --json --stack prod > preview.json

orion generate \
  --reporter @orion/plugin-reporter-pulumi-diff \
  --storage @orion/plugin-storage-filesystem \
  --storage-path ./reports \
  preview.json
```

## Options

| Option | Type | Notes |
| --- | --- | --- |
| `--reporter-stack` | string | Stack to report. Default: the stack named by the preview's URNs |
| `--reporter-omit-values` | boolean | Carry only the paths of changed properties, not their values |
| `--reporter-max-value-length` | number | Truncate property values longer than this. Default: 2000 |
| `--reporter-same` | boolean | Keep unchanged resources in the report |
| `--reporter-root` | string | Directory the reported source path is relative to |

All are also available bare (`--stack`, `--omit-values`, …) when the storage
plugin has not claimed those names, and each has an environment form:
`ORION_REPORTER_OMIT_VALUES=true` and friends.

Each is named for the thing that is *not* the default, because a boolean flag on
the command line is presence — `--values false` is not a thing the CLI parses,
so an option that defaults to on could never be turned off.

## One digest per report

A sharded test run merges into one report; two previews do not. A preview covers
one stack, so merging two would describe a deployment nobody is about to make —
a second positional is an error naming both files. Generate one report per stack
and combine them with
[`@orion/plugin-reporter-composite`](../reporter-composite).

## Secrets never reach the report

A report outlives the job that produced it and is readable by anyone who can
reach the storage backend, so:

- A value carrying Pulumi's secret signature is replaced by the `SECRET`
  sentinel, **wherever it appears** — at the top of a property or nested deep
  inside one. The property still shows up in the diff; its plaintext does not.
- The digest's `config` block is not read at all. It routinely holds secrets and
  is not what a diff is reviewed for.
- A value longer than `--max-value-length` keeps its head and records how much
  was dropped, so a rendered template does not become the whole report.

`--omit-values` drops before/after values entirely, for a pipeline that would
rather publish only the shape of the change.

## What it folds

Pulumi's step vocabulary is wider than the report's nine ops, and one resource
can produce several steps:

| Input | Becomes |
| --- | --- |
| `create-replacement`, `replace`, `delete-replaced` for one URN | **One** `replace` resource |
| `discard-replaced`, `remove-pending-replace` | `remove` |
| `read-replacement`, `import-replacement` | `read`, `import` |
| An op this version has never heard of | `update` — a resource that changes is worth showing, whatever the word |

Grouping by URN is not tidying: without it a replaced resource appears three
times and the totals say three things changed when one did. The detailed diff
rides on one step of the chain, and that is the one kept.

Property kinds fold the same way: `ADD_REPLACE` is an `add` with
`replaces: true`, not a fourth kind. A missing kind reads as `update` — Pulumi
omits the enum's zero value, so the commonest change is the one that goes
missing on the wire.

## Totals are recomputed

`totals` is counted from the folded resources, never copied from the digest's
own `changeSummary`, so the summary can never disagree with the list rendered
under it — and it stays right when unchanged resources are dropped from that
list. A run without `--same` therefore reports "40 unchanged" above a list of
three, which the viewer explains rather than hides.
