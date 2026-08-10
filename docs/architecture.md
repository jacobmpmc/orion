# Architecture

## The shape of the system

A report makes two independent trips. A CI/CD job **generates** one and pushes
it to storage; a developer later **views** it by fetching from that same
storage. The viewer is never involved in generation.

```
CI/CD job                                   Developer
─────────                                   ─────────
tool output (file / glob)
      │
      ▼
  orion generate
      │  reporter plugin  → Report
      │  storage plugin   → { id, url }
      ▼
   storage  ────────────────────────────▶  orion-viewer
   (S3, artifact, …)                          │  storage plugin  → Report
                                              │  viewer plugin   → browser bundle
                                              ▼
                                           rendered in the browser
```

This split is why plugins are typed by role: a pipeline installs the reporter
and storage plugins only, and never pulls in rendering code it will not run.

The first leg can also be split in two. `orion store` takes a report file that
already exists and pushes it to storage, so a job that generated a report can
hand it to a later job that uploads it with only the storage plugin installed —
same second half of the pipeline, no reporter.

## Packages

| Package | Path | Role |
| --- | --- | --- |
| `@orion/core` | [`packages/core`](../packages/core) | Shared contracts. Types, plus the result helpers and option readers plugins and hosts share |
| `@orion/host` | [`packages/host`](../packages/host) | Loading and validating plugin packages, shared by both hosts |
| `@orion/plugin-toolkit` | [`packages/plugin-toolkit`](../packages/plugin-toolkit) | Node-side helpers for plugin authors: input expansion, JSON reading, path normalisation |
| `@orion/report-test-results` | [`packages/report-test-results`](../packages/report-test-results) | The `test-results` report kind: schema, constants, guard |
| `@orion/cli` | [`packages/cli`](../packages/cli) | The `orion` binary |
| `@orion/viewer` | [`packages/viewer`](../packages/viewer) | The `orion-viewer` server and its Vue client |
| `@orion/plugin-reporter-vitest` | [`plugins/reporter-vitest`](../plugins/reporter-vitest) | Reads `vitest --reporter=json` output into a `test-results` report |
| `@orion/plugin-storage-filesystem` | [`plugins/storage-filesystem`](../plugins/storage-filesystem) | Stores and reads a report as one JSON file on disk |
| `@orion/plugin-viewer-test-results` | [`plugins/viewer-test-results`](../plugins/viewer-test-results) | Renders `test-results` reports in the browser |

The CLI and the viewer both depend on `@orion/core` and `@orion/host` via
`workspace:*`. Plugins depend on `@orion/core` for their types and are loaded at
runtime, not linked at build time — so neither host has a build dependency on
any plugin.

`@orion/host` exists because both hosts resolve, import and shape-check a plugin
package identically, and that resolution order is exactly the thing you do not
want drifting between them. It takes the host's error constructor as a
parameter, since a user-facing error type belongs to the host that prints it —
`CliError` and `ViewerError` are siblings, neither of which core should own.

### Where shared code goes

Four packages hold code more than one plugin needs, and one rule decides which:

| Package | Holds | Constraint |
| --- | --- | --- |
| `@orion/core` | Contracts and **pure** helpers — `ok`, `invalid`, the option readers | Zero deps, browser-importable |
| `@orion/report-test-results` | One report kind's schema and guard | Zero deps, browser-importable |
| `@orion/plugin-toolkit` | Plugin-side helpers touching `node:fs` / `node:path` | Node only; plugins depend on it, hosts do not |
| `@orion/host` | Host-side plugin loading | Hosts only |

The browser-importable constraint is load-bearing rather than aspirational: a
viewer plugin's bundle inlines `@orion/core` and its report-kind package, so one
`node:fs` import in either would break every viewer plugin's build. That is why
`expandInputs` and friends are a separate package instead of a core subpath.

A report kind's schema gets its own package because it is a contract between a
reporter and a viewer — two separately installed packages that must agree, and
would otherwise each keep a copy that drifts. It is not core's business: core
documents `Report.data` as opaque and `version` as owned by whichever reporter
produced it.

## Key source files

| File | What it holds |
| --- | --- |
| [`core/src/plugin.ts`](../packages/core/src/plugin.ts) | `ReporterPlugin`, `StoragePlugin`, `ViewerPlugin`, `Report`, `PluginKind` |
| [`core/src/options.ts`](../packages/core/src/options.ts) | `OptionSpec`, plus `OptionsResult` / `OptionIssue` — what a plugin's parse phase returns |
| [`core/src/results.ts`](../packages/core/src/results.ts) | `ok`, `invalid`, `isOptionsResult` — building and checking that result |
| [`core/src/reports.ts`](../packages/core/src/reports.ts) | `isReport`, `canStore`, `canFetch` — checking a report and narrowing a backend |
| [`core/src/values.ts`](../packages/core/src/values.ts) | `stringOption`, `numberOption`, `booleanOption`, `listOption` — reading raw option values |
| [`host/src/plugins.ts`](../packages/host/src/plugins.ts) | Resolves, imports and shape-checks a plugin package |
| [`plugin-toolkit/src/inputs.ts`](../packages/plugin-toolkit/src/inputs.ts) | `expandInputs` — the glob expansion the reporter contract puts on the plugin |
| [`report-test-results/src/schema.ts`](../packages/report-test-results/src/schema.ts) | The `test-results` shape, commented field by field |
| [`reporter-vitest/src/map.ts`](../plugins/reporter-vitest/src/map.ts) | Vitest JSON → the schema: status folding, totals, merging shards |
| [`viewer-test-results/browser/index.ts`](../plugins/viewer-test-results/browser/index.ts) | `mount` and the filter, in plain DOM |
| [`cli/src/index.ts`](../packages/cli/src/index.ts) | Entry point and command dispatch |
| [`cli/src/commands/index.ts`](../packages/cli/src/commands/index.ts) | Command registry — add new commands here |
| [`cli/src/commands/plugin-command.ts`](../packages/cli/src/commands/plugin-command.ts) | Plumbing shared by the commands that name plugins: the two-pass argv scan, flag schema, parse phase, help layout |
| [`cli/src/commands/generate.ts`](../packages/cli/src/commands/generate.ts) | The `generate` command — reporter to storage |
| [`cli/src/commands/store.ts`](../packages/cli/src/commands/store.ts) | The `store` command — a report file on disk to storage |
| [`cli/src/args.ts`](../packages/cli/src/args.ts) | Flag definitions, coercion, alias/collision rules |
| [`viewer/src/config/resolve.ts`](../packages/viewer/src/config/resolve.ts) | Settling module arguments, flags, the config file and defaults |
| [`viewer/src/registry.ts`](../packages/viewer/src/registry.ts) | Loading the viewer's plugins and running their parse phase |
| [`viewer/src/server.ts`](../packages/viewer/src/server.ts) | `createServer` / `startServer`, HTTP vs HTTPS |
| [`viewer/src/http/router.ts`](../packages/viewer/src/http/router.ts) | Route dispatch and the error boundary |

## Two design points worth knowing

### Options are discovered mid-parse

The full set of valid flags is not known until the plugins named by
`--reporter` and `--storage` have been loaded — and those names are themselves
arguments. So a command parses twice: a lenient pass reads only the role flags,
the plugins load, then a strict pass validates everything against the merged
schema. Both `generate` and `store` work this way, through the same helpers in
[`cli/src/commands/plugin-command.ts`](../packages/cli/src/commands/plugin-command.ts).

The first pass deliberately misparses unknown flags and its results are thrown
away. Only the second pass produces values that are used.

### Plugins run in two phases

Every plugin implements `parseOptions`, which turns the raw values a host
collected into the options that plugin actually works with — and the host runs
that phase for *all* plugins before any of them does work. So a bad option
fails the run before a report is built or a byte is stored, and every problem
is reported at once rather than one per attempt.

Plugins return issues instead of throwing, which is what makes collecting them
across plugins possible. The contract therefore lives in `@orion/core`, not in
the CLI: the viewer builds storage plugin options the same way when it starts
up, from a config file rather than from argv. Core carries the small amount of
runtime code that goes with it — `ok` and `invalid` for plugins to build a
result, `isOptionsResult` for a host to check the one it got back.

### Read and write are separate capabilities

`StoragePlugin` declares `store` and `fetch` as independent optional methods,
and each host requires the one it uses: `orion generate` and `orion store` load
a backend with `store`, the viewer with `fetch`. A write-only backend (an artifact uploader) or
a read-only one (a mirror somebody else fills) is a legitimate plugin, and a
backend missing the capability a host needs is rejected when it loads rather
than at the first call. `WritableStoragePlugin` and `ReadableStoragePlugin`
narrow the type back down so the host's call site still type-checks.

The `viewer` role has no method the host calls at all: rendering happens in a
browser. The plugin object instead declares which `Report.kind` values it
renders and where its built browser bundle lives, and the server serves that
file's bytes without ever evaluating it.

### Positionals are never expanded

Positional arguments are file names or glob patterns and are passed to the
reporter **verbatim**. Only the reporter knows whether an input is a directory,
an archive or a multi-file set, so expansion is its job. The CLI has no glob
dependency.

Plugins may contribute **named** arguments only; positionals are reserved.

## What is not built yet

- **No Pulumi diff reporter.** All three roles now have a working
  implementation, end to end, via the vitest reporter and the `test-results`
  viewer — but the Pulumi diff reporter is still the MVP target per
  [`REQUIREMENTS.md`](../REQUIREMENTS.md).
- **No stdin input.** Requirement 2 allows piped input; `generate` currently
  errors when given no positionals.
- **A plugin's runtime failures are not caught.** The CLI's error boundary only
  handles its own `CliError`, so "no files matched" from a reporter reaches the
  user as a stack trace rather than a one-line message.
- **No authentication** anywhere in the viewer. See [Viewer](viewer.md#authentication).
- **No linter or formatter.**
