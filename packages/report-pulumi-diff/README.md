# @orion/report-pulumi-diff

The `pulumi-diff` report kind: the types a reporter builds, the constants that
identify it, and the guard a viewer narrows with.

```ts
import { isPulumiDiff, PULUMI_DIFF_KIND, PULUMI_DIFF_VERSION } from "@orion/report-pulumi-diff";

// In a reporter:
return { kind: PULUMI_DIFF_KIND, version: PULUMI_DIFF_VERSION, generatedAt, data };

// In a viewer plugin's browser bundle:
if (!isPulumiDiff(report.data)) return renderNotice();
```

## Why this is a package

A report kind is a contract between a **reporter** and a **viewer**, and those
are two separately installed packages that must agree. Duplicating the shape in
both works right up until one of them changes.

It is not in `@orion/core` because `Report.data` is deliberately opaque there,
and it is not an export of `@orion/plugin-reporter-pulumi-diff`, because a viewer
plugin importing a reporter would drag Node file-reading code toward the browser
and undo the role split that `plugins/README.md` exists to protect.

Zero dependencies, and no `node:` import anywhere — a viewer plugin's bundle
inlines this, so it has to work in a browser.

## What a `pulumi-diff` report carries

`tool`, an optional `project` and `stack`, `success`, an optional `durationMs`,
recomputed `totals`, the `resources` (each with its `changes`), the
`diagnostics`, and the `sources` it was built from. See
[`src/schema.ts`](src/schema.ts), which is commented field by field.

The shape is what a preview is read *for*, not everything a preview emits.
Deliberately **not** carried:

| Left out | Why |
| --- | --- |
| Full `oldState` / `newState` | Two whole resource bodies each, dwarfing the diff they were included to explain |
| Stack configuration | Routinely holds secrets, and is not what a diff is reviewed for |
| Provider inputs and credentials | Same, plus a provider ref already names the provider |
| The preview's own `changeSummary` | `totals` is recomputed from `resources`, so a summary can never contradict the list under it |

`ResourceOp` is nine values, and pulumi's step vocabulary folds into them. A
replacement arrives as up to three steps for one resource —
`create-replacement`, `replace`, `delete-replaced` — and becomes one `replace`,
because it is one thing happening to one resource.

## Secrets never reach a report

A report outlives the job that produced it and is readable by anyone who can
reach the storage backend. A value pulumi marked secret is replaced with the
`SECRET` sentinel by the producer: the property still shows up in the diff —
knowing a secret changed is a large part of why diffs get reviewed — but its
plaintext is not written down. `isSecretValue` is how a viewer spots one.

`Truncated` is the same idea for size rather than sensitivity: a property
holding a rendered template keeps its head and records how much was dropped.

## The guard is the real contract

A viewer receives `Report.data` as `unknown` every time — out of a storage
backend it does not own, or out of a file someone dropped into the browser. The
TypeScript interface is a convenience; `isPulumiDiff` is what actually enforces
the schema, which is why it checks every field it promises rather than sampling
one.

Optional fields are checked only when present, and unknown extra fields are
accepted: a report from a newer producer must not be rejected for carrying
something this version has not heard of.

## Versioning

`PULUMI_DIFF_VERSION` is the `Report.version` a producer stamps. Adding an
optional field does not need a bump — an older viewer simply finds it absent.
Removing a field, or changing what one means, does. A viewer that sees a higher
version should still render what it understands and say that it may be missing
detail, which is what
[`@orion/plugin-viewer-pulumi-diff`](../../plugins/viewer-pulumi-diff) does.
