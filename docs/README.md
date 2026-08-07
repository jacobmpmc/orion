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
| [Testing](testing.md) | Vitest setup, where tests live, typechecking tests |
| [Conventions](conventions.md) | TypeScript settings, module style, naming, error handling |

## Elsewhere in the repo

| Location | What it is |
| --- | --- |
| [`REQUIREMENTS.md`](../REQUIREMENTS.md) | Product requirements the design answers to |
| [`plugins/README.md`](../plugins/README.md) | Plugin authoring guide: roles, contract, the two phases, naming |
| [`plugins/storage-filesystem/`](../plugins/storage-filesystem) | Stores a report as a JSON file on disk |
| [`CLAUDE.md`](../CLAUDE.md) | Orientation for coding agents working in this repo |

## Status

Early. The workspace, CLI skeleton, plugin contracts, test setup and one storage
plugin exist. Not yet built: any reporter plugin, the viewer app, and stdin
input for `generate`. See
[Architecture](architecture.md#what-is-not-built-yet) for the current gaps.
