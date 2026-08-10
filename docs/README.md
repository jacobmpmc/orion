# Orion documentation

Orion generates reports from CI/CD tool output, stores them somewhere durable,
and renders them in a viewer app. Report types, storage backends and renderers
are all supplied by plugins.

Start with [Getting started](getting-started.md) if you are setting the repo up,
or [Architecture](architecture.md) if you want to know how the pieces fit.

## Contents

| Document | What it covers |
| --- | --- |
| [Getting started](getting-started.md) | Prerequisites, install, build, test, running the CLI locally |
| [Architecture](architecture.md) | Packages, roles, and how a report flows from tool output to viewer |
| [Workspace](workspace.md) | pnpm layout, the version catalog, the release-age policy, adding a package |
| [CLI](cli.md) | `orion` commands, option resolution, exit codes |
| [Viewer](viewer.md) | `orion-viewer`, configuration, the HTTP API, report links, deployment |
| [Testing](testing.md) | Vitest setup, where tests live, typechecking tests |
| [Conventions](conventions.md) | TypeScript settings, module style, naming, error handling |

## Elsewhere in the repo

| Location | What it is |
| --- | --- |
| [`REQUIREMENTS.md`](../REQUIREMENTS.md) | Product requirements the design answers to |
| [`plugins/README.md`](../plugins/README.md) | Plugin authoring guide: roles, contract, the two phases, naming, what the workspace already gives you |
| [`plugins/reporter-vitest/`](../plugins/reporter-vitest) | Turns `vitest --reporter=json` output into a `test-results` report |
| [`plugins/storage-filesystem/`](../plugins/storage-filesystem) | Stores and reads a report as a JSON file on disk |
| [`plugins/viewer-test-results/`](../plugins/viewer-test-results) | Renders `test-results` reports in the browser |
| [`packages/plugin-toolkit/`](../packages/plugin-toolkit) | Node-side helpers for plugin authors |
| [`packages/report-test-results/`](../packages/report-test-results) | The `test-results` report kind: schema and guard |
| [`playground/`](../playground) | Scratch project for running the CLI and viewer against each other |
| [`CLAUDE.md`](../CLAUDE.md) | Orientation for coding agents working in this repo |

## Status

Early, but end to end: a real test run becomes a report, is stored, and is
rendered in the browser, with one plugin per role. Not yet built: the Pulumi
diff reporter that is the MVP target, stdin input for `generate`, and any
authentication. See [Architecture](architecture.md#what-is-not-built-yet).
