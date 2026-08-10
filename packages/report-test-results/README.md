# @orion/report-test-results

The `test-results` report kind: the types a reporter builds, the constants that
identify it, and the guard a viewer narrows with.

```ts
import { isTestResults, TEST_RESULTS_KIND, TEST_RESULTS_VERSION } from "@orion/report-test-results";

// In a reporter:
return { kind: TEST_RESULTS_KIND, version: TEST_RESULTS_VERSION, generatedAt, data };

// In a viewer plugin's browser bundle:
if (!isTestResults(report.data)) return renderNotice();
```

## Why this is a package

A report kind is a contract between a **reporter** and a **viewer**, and those
are two separately installed packages that must agree. Duplicating the shape in
both works right up until one of them changes.

It is not in `@orion/core` because `Report.data` is deliberately opaque there —
`version` is documented as owned by the reporter that produced it, and core
carries cross-role contracts, not per-kind schemas. And it is not an export of
`@orion/plugin-reporter-vitest`, because a viewer plugin importing a reporter
would drag Node file-reading code toward the browser and undo the role split
that `plugins/README.md` exists to protect.

Zero dependencies, and no `node:` import anywhere — a viewer plugin's bundle
inlines this, so it has to work in a browser.

## What a `test-results` report carries

`tool`, `success`, `startedAt`, an optional `durationMs`, recomputed `totals`,
the `files` (each with its `cases`), and the `sources` it was built from. See
[`src/schema.ts`](src/schema.ts), which is commented field by field.

The shape is the intersection of what test runners agree on, so a jest or
playwright reporter can produce it unchanged. Deliberately **not** carried:

| Left out | Why |
| --- | --- |
| Coverage map | Enormous, and would be paid for on every stored report |
| Snapshot summary | Runner-specific, and nothing renders it |
| Per-test `meta` / `tags` | No agreed meaning across runners |
| The absolute run root | CI paths leak and render badly — `TestFile.path` is already relative |

`TestStatus` is four values. A runner's finer distinctions collapse into them:
vitest's `pending` and `disabled` both become `skipped`, because nothing renders
them differently.

## The guard is the real contract

A viewer receives `Report.data` as `unknown` every time — out of a storage
backend it does not own, or out of a file someone dropped into the browser. The
TypeScript interface is a convenience; `isTestResults` is what actually enforces
the schema, which is why it checks every field it promises rather than sampling
one.

Optional fields are checked only when present, and unknown extra fields are
accepted: a report from a newer producer must not be rejected for carrying
something this version has not heard of.

## Versioning

`TEST_RESULTS_VERSION` is the `Report.version` a producer stamps. Adding an
optional field does not need a bump — an older viewer simply finds it absent.
Removing a field, or changing what one means, does. A viewer that sees a higher
version should still render what it understands and say that it may be missing
detail, which is what
[`@orion/plugin-viewer-test-results`](../../plugins/viewer-test-results) does.
