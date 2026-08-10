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
| `orion-viewer`, config, HTTP API, deployment | [`docs/viewer.md`](docs/viewer.md) |
| Vitest setup and test layout | [`docs/testing.md`](docs/testing.md) |
| TypeScript settings, naming, error handling | [`docs/conventions.md`](docs/conventions.md) |
| Writing a plugin | [`plugins/README.md`](plugins/README.md) |
| Running the two halves by hand | [`playground/README.md`](playground/README.md) |

## Commands

```sh
pnpm install
pnpm build                              # tsc --build, then the viewer's vite build
pnpm clean                              # remove build output
pnpm typecheck                          # full rebuild, ignores incremental state
pnpm test                               # every package's test script, --if-present
pnpm exec orion help                    # run the built CLI
pnpm exec orion-viewer --help           # run the built viewer

pnpm --filter @orion/cli test                        # one package
pnpm --filter @orion/cli test test/args.test.ts      # one file
pnpm --filter @orion/cli test -t "coerces number"    # one test by name
pnpm --filter @orion/cli test:watch
pnpm --filter @orion/cli test:types                  # typecheck the tests

pnpm --filter @orion/viewer build:client             # the browser client alone
pnpm --filter @orion/viewer test:types:client        # typecheck the .vue files

# Viewer dev, three terminals; open Vite's URL, not the server's
pnpm --filter @orion/viewer dev                      # tsc watch → dist/
pnpm --filter @orion/viewer dev:server               # node --watch dist/bin.js
pnpm --filter @orion/viewer dev:client               # vite, HMR, proxies /api

cd playground && pnpm generate "src/**" && pnpm serve   # both halves, by hand
```

There is no linter or formatter configured.

## Architecture

Two independent trips: a CI/CD job runs `orion generate` to build a report and
push it to storage; a developer later views it by fetching from that same
storage. The viewer is never involved in generation. This is why plugins carry a
`kind` (`reporter` / `storage` / `viewer`) — a pipeline installs only the roles
it runs.

- **`@orion/core`** ([`packages/core`](packages/core)) — shared contracts.
  `ReporterPlugin`, `StoragePlugin`, `ViewerPlugin`, `Report`, `OptionSpec`,
  `OptionsResult`. Mostly types; the runtime code is the result helpers in
  [`src/results.ts`](packages/core/src/results.ts), the option readers in
  [`src/values.ts`](packages/core/src/values.ts) (`stringOption`, …), the
  guards in [`src/reports.ts`](packages/core/src/reports.ts) (`isReport`,
  `canStore`, `canFetch`) and the metadata readers in
  [`src/metadata.ts`](packages/core/src/metadata.ts) (`gitMetadata`,
  `ciMetadata`, `customMetadata`, `withMetadata`). Zero dependencies, and importable from a browser
  bundle — a viewer plugin's bundle inlines it, so this is a hard constraint,
  not a preference.
- **`@orion/host`** ([`packages/host`](packages/host)) — resolving, importing
  and shape-checking a plugin package. Shared by both binaries; takes the host's
  error constructor as a parameter, since `CliError` and `ViewerError` belong to
  whoever prints them.
- **`@orion/plugin-toolkit`** ([`packages/plugin-toolkit`](packages/plugin-toolkit))
  — plugin-side helpers that touch `node:fs`/`node:path`: `expandInputs`
  (the glob expansion the reporter contract puts on the plugin), `readJsonFile`,
  `posixPath`, `relativeTo`, `isContained`. Plugins depend on it; hosts do not.
  It exists so core can stay browser-safe.
- **`@orion/report-test-results`** ([`packages/report-test-results`](packages/report-test-results))
  — the `test-results` report kind: types, `TEST_RESULTS_KIND`/`_VERSION`, and
  the `isTestResults` guard. A report kind is a contract between a reporter and
  a viewer, so it gets its own zero-dep package rather than being duplicated in
  both or pushed into core, where `Report.data` is deliberately opaque.
- **`@orion/cli`** ([`packages/cli`](packages/cli)) — the `orion` binary.
  `generate` builds a report and stores it; `store` takes a report file that
  already exists and stores it, so an upload job needs no reporter installed.
- **`@orion/viewer`** ([`packages/viewer`](packages/viewer)) — the
  `orion-viewer` binary plus an importable `createServer`/`startServer`. Server
  in `src/` (tsc → `dist/`), Vue client in `client/` (Vite → `dist/client/`).
- **[`plugins/`](plugins)** — base plugins, matched by a workspace glob. One per
  role: `@orion/plugin-reporter-vitest`
  ([`plugins/reporter-vitest`](plugins/reporter-vitest)) maps
  `vitest --reporter=json` output into a `test-results` report;
  `@orion/plugin-storage-filesystem`
  ([`plugins/storage-filesystem`](plugins/storage-filesystem)) stores and reads
  a report as one JSON file under a root directory; and
  `@orion/plugin-viewer-test-results`
  ([`plugins/viewer-test-results`](plugins/viewer-test-results)) renders
  `test-results` in the browser, framework-free.

Both hosts load plugins by dynamic import at runtime and have no build-time
dependency on any of them. Plugin packages resolve from the working directory
first, then relative to the host that asked (which is why `loadPlugin` takes a
`from`: resolving relative to `@orion/host` would find nothing).

### Two things that look wrong but are not

**`generate` and `store` parse argv twice.** The valid flags are not known until
the plugins named by `--reporter`/`--storage` load — and those names are
themselves arguments. A lenient first pass reads only the role flags and
*deliberately misparses everything else*; its results are discarded. The strict
second pass, run against the merged schema, is the one that matters. That
plumbing — the pre-scan, flag schema, parse phase, help layout and error
handling every plugin-bearing command shares — lives in
[`src/commands/plugin-command.ts`](packages/cli/src/commands/plugin-command.ts);
a new such command composes it rather than repeating it.

**Argument values are built from `parseArgs` tokens, not its `values` object.**
`values` loses the order flags appeared in, which breaks repeatable options
collected across a canonical flag and its alias. See
[`src/args.ts`](packages/cli/src/args.ts).

**`StoragePlugin.store` and `.fetch` are both optional.** Not an oversight: the
CLI only writes and the viewer only reads, so a write-only or read-only backend
is valid. Each host loads with the method it needs and narrows to
`WritableStoragePlugin` / `ReadableStoragePlugin`.

**The viewer has no upload endpoint, and must not grow one.** A dropped report
is parsed in the browser and never sent anywhere. That is what makes the app
stateless per requirement 7, and it leaves no upload surface at all.

**The viewer's `orion-viewer` flags use `parseArgs` directly**, not the CLI's
`parseFlags`. Its flag set is fixed before any plugin loads, so there is no
two-pass problem — and depending on `@orion/cli` would drag reporter-loading
code into the viewer image, against requirement 5.

### Plugins run in two phases

Every plugin implements `parseOptions(values)`, which validates the raw values
routed to it and builds its own options type — `ReporterPlugin<T>` /
`StoragePlugin<T>` thread that type through to `generate` / `store`. The host
runs the parse phase for *every* plugin before any of them does work, so a bad
option fails before anything is generated or stored.

Plugins return `invalid(issues)` rather than throwing, which lets a host report
issues from every plugin in one go; `ok(options)` is the success case. An
issue's `option` is rendered as the canonical flag by the CLI (`--storage-name
…`) and as the config setting by the viewer (`connection 'prod' option 'path'
…`). The types and their helpers live in core because both hosts run the same
phase — including `isOptionsResult`, which a host uses to check what a plugin
handed back.

The viewer runs this for every storage *and* viewer plugin before it listens, so
a misconfigured viewer never accepts a request. Its values come from a config
file rather than argv, which is what
[`viewer/src/config/options.ts`](packages/viewer/src/config/options.ts) exists
for — the CLI's equivalent is welded to `FlagDef` and argv order.

### Plugin option resolution

Plugins contribute **named arguments only** — positionals are reserved for input
files and globs, which are passed to the reporter **verbatim, never expanded**
(only the reporter knows if an input is a directory or archive).

Each plugin option is always available as `--<role>-<name>`, and *additionally*
as bare `--<name>` when no core flag or earlier-registered plugin claimed it
(reporter registers before storage). Two plugins may declare the same option
name; they stay on separate targets and neither sees the other's values.

## Gotchas

- **Build before running either binary.** The `bin`s point at `dist/`, not
  sources.
- **The viewer's client is a separate Vite build.** `tsc --build` alone leaves
  `dist/client` missing, and every page then returns 503 while the API keeps
  working. `pnpm build` runs both.
- **A viewer *plugin* has a second build too**, and it fails harder: the viewer
  stats each plugin's bundle at **startup**, so a missing `dist/browser/index.js`
  stops the server rather than one page. The script must be named exactly
  `build:client` (with `clean:client`, `test:types:client`) — the root scripts
  run `pnpm -r --if-present` over those names and silently skip anything else.
- **A viewer plugin's bundle must be one self-contained file.** Only
  `/plugins/<id>/bundle.js` is served; a sibling `style.css` or `.js.map` 404s.
  It is served `immutable`, so a rebuild during dev needs a hard refresh, and
  the manifest is fetched once, so adding a plugin needs a viewer restart.
- **Browser tsconfigs deliberately do not extend `tsconfig.base.json`**
  (DOM lib, bundler resolution) and are not in the root references. Typecheck
  them with `test:types:client` — a third entry point neither `pnpm typecheck`
  nor `test:types` covers. Two packages have one now.
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
- **Test fixtures in `test/fixtures/` are real `.mjs` modules**, loaded for real
  rather than mocked. Several are deliberately invalid to exercise failure
  paths — do not "fix" them. The exception is
  `plugins/reporter-vitest/test/fixtures/`, which is JSON *data*; `real-run.json`
  is captured from an actual vitest run and its README says how to recapture it.
- **Report metadata is collected by the CLI, not by the reporter.**
  `orion generate` shells out to `git`, reads the CI environment and attaches the
  result at [`src/metadata/`](packages/cli/src/metadata) after `generate`
  returns; `orion store` collects nothing. Every collector swallows its own
  failures, and `collectMetadata` never rejects — that is deliberate, not a
  swallowed error: metadata is context, and a report that generated fine still
  has to be stored on a machine with no git. The reader side is in core so a
  viewer plugin can use it in a browser.
- **A plugin's runtime errors reach the user as a stack trace.** The CLI catches
  only `CliError`, so anything a reporter or storage plugin throws is unwrapped.
  Write those messages as prose for the person who typed the command.
- **pnpm only links a workspace `bin` when something depends on the package**,
  and only once `dist/` exists. The root `package.json` depends on `@orion/cli`
  and `@orion/viewer` for that reason alone; if `pnpm exec orion-viewer` is not
  found, build and reinstall.
- **Viewer tests bind port `0`** and pass `config: false`, so they never collide
  and never pick up a stray config file from the working directory.

## Not built yet

All three roles now have a working implementation and the pipeline runs end to
end (`vitest --reporter=json` → report → stored → rendered in the browser). What
is still missing: the Pulumi diff reporter, which is the MVP target in
`REQUIREMENTS.md`; stdin input for `generate`, which errors when given no
positional arguments though requirement 2 calls for piped input; and any
authentication anywhere in the viewer. A report of a kind no viewer plugin
claims still reaches the empty state, by design.
