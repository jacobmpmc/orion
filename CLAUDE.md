# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Orion generates reports from CI/CD tool output (Pulumi diffs, test results, …),
stores them somewhere durable, and renders them in a self-hosted viewer app.
Report types, storage backends and renderers are all plugins.

See [`README.md`](README.md) for the product rationale and
[`REQUIREMENTS.md`](REQUIREMENTS.md) for the requirements the design answers to.
`REQUIREMENTS.md` is the source of truth for intended behaviour — read it before
designing anything new.

## Where to look

| Topic | Document |
| --- | --- |
| Docs index | [`docs/README.md`](docs/README.md) |
| Setup, everyday commands | [`docs/getting-started.md`](docs/getting-started.md) |
| Package layout, data flow, current gaps | [`docs/architecture.md`](docs/architecture.md) |
| pnpm workspace, catalog, release-age policy | [`docs/workspace.md`](docs/workspace.md) |
| `orion` commands and option resolution | [`docs/cli.md`](docs/cli.md) |
| Vitest setup and test layout | [`docs/testing.md`](docs/testing.md) |
| TypeScript settings, naming, error handling | [`docs/conventions.md`](docs/conventions.md) |
| Writing a plugin | [`plugins/README.md`](plugins/README.md) |

## Commands

```sh
pnpm install
pnpm build                              # tsc --build across all packages
pnpm clean                              # remove build output
pnpm typecheck                          # full rebuild, ignores incremental state
pnpm test                               # every package's test script, --if-present
pnpm exec orion help                    # run the built CLI

pnpm --filter @orion/cli test                        # one package
pnpm --filter @orion/cli test test/args.test.ts      # one file
pnpm --filter @orion/cli test -t "coerces number"    # one test by name
pnpm --filter @orion/cli test:watch
pnpm --filter @orion/cli test:types                  # typecheck the tests
```

There is no linter or formatter configured.

## Architecture

Two independent trips: a CI/CD job runs `orion generate` to build a report and
push it to storage; a developer later views it by fetching from that same
storage. The viewer is never involved in generation. This is why plugins carry a
`kind` (`reporter` / `storage` / `viewer`) — a pipeline installs only the roles
it runs.

- **`@orion/core`** ([`packages/core`](packages/core)) — shared contracts.
  `ReporterPlugin`, `StoragePlugin`, `Report`, `OptionSpec`, `OptionsResult`.
  Mostly types; the only runtime code is the result helpers in
  [`src/results.ts`](packages/core/src/results.ts) (`ok`, `invalid`,
  `isOptionsResult`), which plugins and hosts share.
- **`@orion/cli`** ([`packages/cli`](packages/cli)) — the `orion` binary.
- **[`plugins/`](plugins)** — base plugins, matched by a workspace glob. So far
  only `@orion/plugin-storage-filesystem`
  ([`plugins/storage-filesystem`](plugins/storage-filesystem)), which writes a
  report as one JSON file under `--storage-path`.

The CLI loads plugins by dynamic import at runtime and has no build-time
dependency on any of them. Plugin packages resolve from the working directory
first, then from where the CLI is installed.

### Two things that look wrong but are not

**`generate` parses argv twice.** The valid flags are not known until the
plugins named by `--reporter`/`--storage` load — and those names are themselves
arguments. A lenient first pass reads only those two flags and *deliberately
misparses everything else*; its results are discarded. The strict second pass,
run against the merged schema, is the one that matters. See
[`src/commands/generate.ts`](packages/cli/src/commands/generate.ts).

**Argument values are built from `parseArgs` tokens, not its `values` object.**
`values` loses the order flags appeared in, which breaks repeatable options
collected across a canonical flag and its alias. See
[`src/args.ts`](packages/cli/src/args.ts).

### Plugins run in two phases

Every plugin implements `parseOptions(values)`, which validates the raw values
routed to it and builds its own options type — `ReporterPlugin<T>` /
`StoragePlugin<T>` thread that type through to `generate` / `store`. The host
runs the parse phase for *every* plugin before any of them does work, so a bad
option fails before anything is generated or stored.

Plugins return `invalid(issues)` rather than throwing, which lets the CLI report
issues from both plugins in one go; `ok(options)` is the success case. An
issue's `option` is rendered as the canonical flag (`--storage-name …`). The
types and their helpers live in core because the viewer will run the same phase
for its storage plugins — including `isOptionsResult`, which a host uses to
check what a plugin handed back.

### Plugin option resolution

Plugins contribute **named arguments only** — positionals are reserved for input
files and globs, which are passed to the reporter **verbatim, never expanded**
(only the reporter knows if an input is a directory or archive).

Each plugin option is always available as `--<role>-<name>`, and *additionally*
as bare `--<name>` when no core flag or earlier-registered plugin claimed it
(reporter registers before storage). Two plugins may declare the same option
name; they stay on separate targets and neither sees the other's values.

## Gotchas

- **Build before running the CLI.** The `bin` points at `dist/`, not sources.
- **Relative imports need a `.js` extension** (`NodeNext`), even in `.ts` files.
- **`noUncheckedIndexedAccess` is on** — indexing yields `T | undefined`.
- **A new package must be added to the root [`tsconfig.json`](tsconfig.json)
  references**, or `tsc --build` silently never compiles it.
- **Shared dependency versions live in the `catalog:` block** of
  [`pnpm-workspace.yaml`](pnpm-workspace.yaml); packages reference `catalog:`
  rather than a literal range.
- **A one-week `minimumReleaseAge` is enforced.** Versions published in the last
  week will not resolve. A dependency that looks stuck is usually this or a
  range cap, not a bug.
- **`pnpm test` does not typecheck tests.** Vitest strips types and
  `tsc --build` excludes `test/`. Run `test:types` separately.
- **Test fixtures in `packages/cli/test/fixtures/` are real `.mjs` modules**,
  loaded for real rather than mocked. Several are deliberately invalid to
  exercise failure paths — do not "fix" them.
- **pnpm only links a workspace `bin` when something depends on the package.**
  The root `package.json` depends on `@orion/cli` for that reason alone.

## Not built yet

No reporter plugin, no viewer app, and no stdin input for `generate` (it
currently errors when given no positional arguments, though requirement 2 calls
for piped input).
