# Conventions

## TypeScript

All packages extend [`tsconfig.base.json`](../tsconfig.base.json). The settings
that shape day-to-day code:

| Setting | Consequence |
| --- | --- |
| `module`/`moduleResolution: NodeNext` | **Relative imports must carry a `.js` extension**, even from `.ts` files |
| `verbatimModuleSyntax` | Type-only imports must use `import type` |
| `strict` | No implicit `any`, strict null checks |
| `noUncheckedIndexedAccess` | Indexing an array or record yields `T \| undefined` |
| `composite` + `declaration` | Project references; each package emits `.d.ts` |
| `isolatedModules` | Each file must be transpilable alone |

`noUncheckedIndexedAccess` is the one that surprises people: `values[key]` is
possibly `undefined` and must be narrowed or asserted.

## Modules

- ESM throughout — every package sets `"type": "module"`.
- Import internal packages by name (`@orion/core`), never by relative path
  across a package boundary.
- Relative imports within a package use the `.js` extension:
  `import { parseFlags } from "./args.js"`.

## Project references

Each package's `tsconfig.json` references the packages it depends on, and the
root [`tsconfig.json`](../tsconfig.json) is a solution file listing them all.
`tsc --build` uses this to compile in dependency order.

**A package absent from the root references list is never built.** Add new
packages there.

## Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Package | `@orion/<name>` | `@orion/cli` |
| Plugin package | `@orion/plugin-<role>-<target>` | `@orion/plugin-storage-s3` |
| CLI flags | kebab-case | `--storage-token` |
| Files | kebab-case | `commands/generate.ts` |
| Types | PascalCase, no `I` prefix | `ReporterPlugin` |

## Errors

User-facing failures throw `CliError` from
[`src/args.ts`](../packages/cli/src/args.ts). Its message is printed as-is, so
write it for the person running the command — name the offending flag, and say
what to do about it.

Commands catch `CliError`, print it to stderr prefixed with the command name,
and return exit code 1. Anything else propagates as a crash, which is the right
outcome for a genuine bug.

Runtime input from outside the process — plugin modules above all — is validated
before use, so a malformed plugin produces a clear message rather than a
`TypeError` deep in a call stack. That includes what a plugin *returns*: the
result of `parseOptions` is shape-checked by
[`src/plugins.ts`](../packages/cli/src/plugins.ts) before it is trusted.

Plugins do not throw for bad user input, and cannot — `CliError` belongs to the
CLI, and a plugin depends only on `@orion/core`. They return `OptionIssue`s from
`parseOptions` instead — via `invalid(...)`, with `ok(...)` for the success case
— and the host turns those into one user-facing failure. Throwing from a plugin
means a bug in the plugin.

## Comments

Comment the *why*, not the *what*. The code already says what it does.

Non-obvious decisions deserve a note at the point they would look like mistakes:
the deliberately lenient first parse in
[`generate.ts`](../packages/cli/src/commands/generate.ts) and the `tokens: true`
requirement in [`args.ts`](../packages/cli/src/args.ts) are both commented for
this reason.

Exported types and interfaces carry doc comments; obvious internal helpers do not
need them.

## Dependencies

Prefer the Node standard library. Argument parsing uses `node:util`'s
`parseArgs` rather than a package, and the CLI has no runtime dependencies
beyond `@orion/core`. `@orion/core` itself has none at all — it is contracts
plus the handful of result helpers that go with them, so a plugin taking it as
a dependency takes on nothing else.

New shared dependencies go in the [catalog](workspace.md#version-catalog) first.
Remember the [release-age policy](workspace.md#release-age-policy): a version
published in the last week will not resolve.
