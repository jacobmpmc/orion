# @orion/plugin-toolkit

Node-side helpers for writing Orion plugins: expanding the positionals a
reporter is handed, reading a JSON file with an error a user can act on, and the
path normalisation anything that stores or reports a file path needs.

```ts
import { expandInputs, readJsonFile, relativeTo } from "@orion/plugin-toolkit";

const files = await expandInputs(patterns);          // globs expanded, deduped
const parsed = await readJsonFile(files[0]);         // named errors, BOM tolerated
const shown = relativeTo(root, "/abs/src/a.test.ts"); // "src/a.test.ts"
```

## What belongs here

Helpers a **plugin** needs that touch `node:fs` or `node:path`. That is the
whole rule, and it is what separates this package from its neighbours:

| Need | Package |
| --- | --- |
| Contracts, and pure helpers like `ok` / `invalid` / `stringOption` | `@orion/core` |
| Anything touching the file system or paths | here |
| Loading and validating a plugin package | `@orion/host` (hosts only) |

`@orion/core` must stay importable from a browser bundle — a viewer plugin's
bundle imports it — so a single `node:fs` import there would be a real cost.
Nothing in `packages/cli` or `packages/viewer` depends on this package; it
points the other way, at plugins.

## API

### `expandInputs(patterns, { cwd })`

Turns the positionals the CLI passed through verbatim into absolute file paths.
The CLI deliberately does not expand them — only the reporter knows whether an
input is a file, a directory or an archive — so this is that job.

- A pattern containing `*`, `?`, `[]` or `{}` is expanded with `node:fs`'s
  `glob`. Anything else is treated as a **literal path**: expanding
  `results.json` as a glob would silently match nothing when the file is
  missing, and "no such file" is a far better answer than "no files matched".
- Results are deduplicated by resolved path, first occurrence winning, so
  `results-*.json results-1.json` reads each file once and in the order written.
- **Throws when nothing matched at all.** A run that reports on zero files looks
  like a passing run, which is the worst way for this to fail.

### `readJsonFile(file)`

Reads and parses, distinguishing the two failures that need different fixes:
`Could not read <file>: …` and `<file> is not valid JSON: …`. Both name the
file, because whatever a plugin throws is what the user sees. A leading
byte-order mark is tolerated — tools on Windows emit one and `JSON.parse`
rejects it, which is not the user's mistake to fix.

### `posixPath(path)` / `relativeTo(root, path)` / `isContained(root, name)`

`posixPath` rewrites the platform separator to `/`. Anything a plugin puts into
a report or a storage id outlives the machine that produced it, so a backslash
in a stored path is a bug waiting for the trip to a viewer on Linux.

`relativeTo` resolves before relativising, which is what makes the result
independent of the platform that wrote the path. A path outside the root comes
back absolute rather than as a chain of `..`.

`isContained` is the check to run before joining a root with a name you did not
choose — a report id that came back through a URL, a file name a user passed.
`..` is the obvious case; an **absolute** `name` is the one that gets missed,
since `resolve` silently discards the root.

## A plugin cannot report a runtime fault gently

These helpers throw plain `Error`s, and a host does not catch them: the CLI's
error boundary only handles its own `CliError`, so a message from here reaches
the user as the top line of a stack trace. Every message is therefore written as
prose for the person who typed the command, not as a developer note. Keep it
that way when adding to this package.
