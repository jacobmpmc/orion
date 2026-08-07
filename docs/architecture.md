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
   storage  ────────────────────────────▶  viewer app
   (S3, artifact, …)                       (renders via viewer plugin)
```

This split is why plugins are typed by role: a pipeline installs the reporter
and storage plugins only, and never pulls in rendering code it will not run.

## Packages

| Package | Path | Role |
| --- | --- | --- |
| `@orion/core` | [`packages/core`](../packages/core) | Shared contracts. Types, plus the result helpers plugins and hosts share |
| `@orion/cli` | [`packages/cli`](../packages/cli) | The `orion` binary |
| `@orion/plugin-storage-filesystem` | [`plugins/storage-filesystem`](../plugins/storage-filesystem) | Stores a report as one JSON file on disk |

`@orion/cli` depends on `@orion/core` via `workspace:*`. Plugins depend on
`@orion/core` for their types and are loaded by the CLI at runtime, not linked
at build time — so the CLI has no dependency on any plugin.

## Key source files

| File | What it holds |
| --- | --- |
| [`core/src/plugin.ts`](../packages/core/src/plugin.ts) | `ReporterPlugin`, `StoragePlugin`, `Report`, `PluginKind` |
| [`core/src/options.ts`](../packages/core/src/options.ts) | `OptionSpec`, plus `OptionsResult` / `OptionIssue` — what a plugin's parse phase returns |
| [`core/src/results.ts`](../packages/core/src/results.ts) | `ok`, `invalid`, `isOptionsResult` — building and checking that result |
| [`cli/src/index.ts`](../packages/cli/src/index.ts) | Entry point and command dispatch |
| [`cli/src/commands/index.ts`](../packages/cli/src/commands/index.ts) | Command registry — add new commands here |
| [`cli/src/commands/generate.ts`](../packages/cli/src/commands/generate.ts) | The `generate` command and its two-pass argument parse |
| [`cli/src/args.ts`](../packages/cli/src/args.ts) | Flag definitions, coercion, alias/collision rules |
| [`cli/src/plugins.ts`](../packages/cli/src/plugins.ts) | Loads and validates plugin packages at runtime |

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
the CLI: the viewer will build storage plugin options the same way when it
fetches a report. Core carries the small amount of runtime code that goes with
it — `ok` and `invalid` for plugins to build a result, `isOptionsResult` for a
host to check the one it got back.

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
- **No viewer app.** `viewer` exists in `PluginKind` but nothing consumes it.
- **No stdin input.** Requirement 2 allows piped input; `generate` currently
  errors when given no positionals.
- **No linter or formatter.**
