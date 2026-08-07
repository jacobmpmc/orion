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

## Packages

| Package | Path | Role |
| --- | --- | --- |
| `@orion/core` | [`packages/core`](../packages/core) | Shared contracts. Types, plus the result helpers plugins and hosts share |
| `@orion/host` | [`packages/host`](../packages/host) | Loading and validating plugin packages, shared by both hosts |
| `@orion/cli` | [`packages/cli`](../packages/cli) | The `orion` binary |
| `@orion/viewer` | [`packages/viewer`](../packages/viewer) | The `orion-viewer` server and its Vue client |
| `@orion/plugin-storage-filesystem` | [`plugins/storage-filesystem`](../plugins/storage-filesystem) | Stores and reads a report as one JSON file on disk |

The CLI and the viewer both depend on `@orion/core` and `@orion/host` via
`workspace:*`. Plugins depend on `@orion/core` for their types and are loaded at
runtime, not linked at build time — so neither host has a build dependency on
any plugin.

`@orion/host` exists because both hosts resolve, import and shape-check a plugin
package identically, and that resolution order is exactly the thing you do not
want drifting between them. It takes the host's error constructor as a
parameter, since a user-facing error type belongs to the host that prints it —
`CliError` and `ViewerError` are siblings, neither of which core should own.

## Key source files

| File | What it holds |
| --- | --- |
| [`core/src/plugin.ts`](../packages/core/src/plugin.ts) | `ReporterPlugin`, `StoragePlugin`, `ViewerPlugin`, `Report`, `PluginKind` |
| [`core/src/options.ts`](../packages/core/src/options.ts) | `OptionSpec`, plus `OptionsResult` / `OptionIssue` — what a plugin's parse phase returns |
| [`core/src/results.ts`](../packages/core/src/results.ts) | `ok`, `invalid`, `isOptionsResult` — building and checking that result |
| [`core/src/reports.ts`](../packages/core/src/reports.ts) | `isReport`, `canStore`, `canFetch` — checking a report and narrowing a backend |
| [`host/src/plugins.ts`](../packages/host/src/plugins.ts) | Resolves, imports and shape-checks a plugin package |
| [`cli/src/index.ts`](../packages/cli/src/index.ts) | Entry point and command dispatch |
| [`cli/src/commands/index.ts`](../packages/cli/src/commands/index.ts) | Command registry — add new commands here |
| [`cli/src/commands/generate.ts`](../packages/cli/src/commands/generate.ts) | The `generate` command and its two-pass argument parse |
| [`cli/src/args.ts`](../packages/cli/src/args.ts) | Flag definitions, coercion, alias/collision rules |
| [`viewer/src/config/resolve.ts`](../packages/viewer/src/config/resolve.ts) | Settling module arguments, flags, the config file and defaults |
| [`viewer/src/registry.ts`](../packages/viewer/src/registry.ts) | Loading the viewer's plugins and running their parse phase |
| [`viewer/src/server.ts`](../packages/viewer/src/server.ts) | `createServer` / `startServer`, HTTP vs HTTPS |
| [`viewer/src/http/router.ts`](../packages/viewer/src/http/router.ts) | Route dispatch and the error boundary |

## Two design points worth knowing

### Options are discovered mid-parse

The full set of valid flags is not known until the plugins named by
`--reporter` and `--storage` have been loaded — and those names are themselves
arguments. So `generate` parses twice: a lenient pass reads only those two
flags, the plugins load, then a strict pass validates everything against the
merged schema.

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
and each host requires the one it uses: `orion generate` loads a backend with
`store`, the viewer with `fetch`. A write-only backend (an artifact uploader) or
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

- **No reporter plugin.** `plugins/` holds the filesystem storage plugin only,
  so `generate` has somewhere to put a report but nothing to build one. The
  Pulumi diff reporter is the MVP target per [`REQUIREMENTS.md`](../REQUIREMENTS.md).
- **No viewer plugin.** The viewer app, its plugin contract and its bundle
  serving exist, but nothing yet implements the `viewer` role, so a fetched
  report reaches an empty state rather than a rendering.
- **No stdin input.** Requirement 2 allows piped input; `generate` currently
  errors when given no positionals.
- **No authentication** anywhere in the viewer. See [Viewer](viewer.md#authentication).
- **No linter or formatter.**
