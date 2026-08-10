# CLI

The `orion` binary. Build first (`pnpm build`), then `pnpm exec orion <command>`.

## Commands

| Command | Purpose |
| --- | --- |
| `orion help [command]` | Lists commands, or shows usage for one |
| `orion generate` | Builds a report and persists it |
| `orion store` | Persists a report file that already exists |

Bare `orion`, `orion --help` and `orion -h` all print the command list.
An unknown command writes to stderr and exits 1.

Commands are registered in
[`src/commands/index.ts`](../packages/cli/src/commands/index.ts) and implement
the `Command` interface in
[`src/commands/types.ts`](../packages/cli/src/commands/types.ts). Help output is
derived from the registry, so a new command appears there automatically.

## `orion generate`

```
orion generate --reporter <package> --storage <package> [options] <file|glob...>
```

| Option | Meaning |
| --- | --- |
| `--reporter <package>` | Reporter plugin that builds the report. Required |
| `--storage <package>` | Storage plugin that persists it. Required. Must implement `store` — a read-only backend is a valid plugin but not usable here |
| `--metadata <key=value>` | Extra metadata entry. Repeatable |
| `--no-metadata` | Skip collecting git and CI metadata entirely |
| `--help` | Usage, including options contributed by the named plugins |

Positional arguments are file names or glob patterns, passed to the reporter
**unexpanded**. At least one is required — stdin input is not implemented yet.

Because plugins contribute their own options, `--help` is more useful once the
plugins are named:

```sh
orion generate --reporter @orion/plugin-reporter-pulumi-diff --storage @orion/plugin-storage-s3 --help
```

That loads both plugins and lists their options, without running them.

### How plugin options are resolved

Every plugin option is always available in a canonical form:

```
--reporter-<name>      --storage-<name>
```

It is *additionally* available as a bare `--<name>` when no core flag and no
earlier-registered plugin has claimed that name. The reporter is registered
before the storage plugin, so on a collision the reporter keeps the bare alias.

This means two plugins can safely declare the same option name. Given a reporter
and a storage plugin that both declare `token`:

```sh
orion generate --reporter r --storage s --token rep-tok --storage-token sto-tok …
```

the reporter receives `token: "rep-tok"` and the storage plugin receives
`token: "sto-tok"`. Neither sees the other's options. `orion generate --help`
shows which alias went where.

Passing both a canonical flag and its alias for the same option (`--token` and
`--reporter-token`) is an error, since the intent is ambiguous. Repeating a
single flag is fine — the last value wins, or values collect in command-line
order for a repeatable option.

Option types, `required`, `multiple` and `default` come from each plugin's
`OptionSpec` declarations. See [`plugins/README.md`](../plugins/README.md).

### The option parse phase

Flag parsing only gets values as far as the right plugin. Each plugin then
turns its own values into the options it actually works with, through
`parseOptions`, and this happens for **both** plugins before either one runs:

```
parse argv → load plugins → reporter.parseOptions + storage.parseOptions
           → reporter.generate → storage.store
```

A plugin reports bad input as issues rather than throwing, so `generate`
collects them from both plugins and prints them together:

```
orion generate: Invalid plugin options:
  --storage-name must name a file inside /var/reports, but '../oops.json' resolves outside it.
  storage plugin 'filesystem': needs either --path or --connection.
```

An issue naming an option is printed as the canonical flag; one that spans
several is attributed to the plugin instead. Nothing has been generated or
stored by this point, so a run that fails here leaves nothing behind.

### Report metadata

After the reporter returns and before storage is called, `generate` stamps the
report with where it came from, under `Report.metadata`:

```json
{
  "collectedAt": "2026-08-10T09:31:02.145Z",
  "git": {
    "commit": "c1077487…",
    "branch": "main",
    "subject": "Add the store command",
    "author": "Ada Lovelace",
    "committedAt": "2026-08-10T09:12:44.000Z",
    "dirty": false,
    "remotes": [{ "name": "origin", "url": "https://github.com/acme/orion.git" }]
  },
  "ci": {
    "provider": "github-actions",
    "repository": "acme/orion",
    "runId": "12345",
    "runUrl": "https://github.com/acme/orion/actions/runs/12345",
    "pullRequest": 42,
    "pullRequestUrl": "https://github.com/acme/orion/pull/42"
  },
  "custom": { "deploy-env": "staging" }
}
```

The CLI collects it, not the reporter: a reporter author should not have to
reimplement `git rev-parse`, and every report should carry the same facts
whichever plugin produced it. Reporters neither populate nor depend on the field.

**git** comes from running `git` in the working directory — the real binary,
because worktrees, packed refs and detached HEAD are cases it already gets right.
`branch` is absent on a detached HEAD, which is the normal state of a CI
checkout; `refName` under `ci` usually covers it. The author's *name* is
recorded, never their email.

**ci** is read from environment variables, from an explicit allowlist per
provider — GitHub Actions, GitLab CI, and a thin generic reader for anything else
that sets `CI` (Jenkins and CircleCI values included). Nothing is copied by
pattern: GitLab keeps `CI_JOB_TOKEN` and `CI_REGISTRY_PASSWORD` in the same
namespace as everything useful.

**custom** holds `--metadata key=value` entries. The value keeps everything after
the first `=`, so `--metadata args=--depth=3` works. Keys are letters, digits,
`.`, `_` and `-`. At most 32 entries, values up to 1 KiB. `--metadata` together
with `--no-metadata` is an error rather than a silent no-op, and a malformed pair
fails before any plugin runs.

Credentials embedded in a remote URL are redacted — a GitLab runner rewrites
`origin` to `https://gitlab-ci-token:<token>@…`, and a report is a file people
share. It is best-effort, not a guarantee.

**Collection failures are silent by design.** No git installed, not a
repository, no commits yet, an unfamiliar CI: each of those leaves a field or a
whole namespace absent. A report that generated successfully still gets stored.
`collectedAt` is always set when collection ran, which is what distinguishes
"collected, found nothing" from "never collected" — a report generated with
`--no-metadata`, or by a version of orion that predates this, has no `metadata`
key at all.

## `orion store`

```
orion store --storage <package> [options] <file>
```

| Option | Meaning |
| --- | --- |
| `--storage <package>` | Storage plugin that persists the report. Required. Must implement `store` |
| `--help` | Usage, including options contributed by the named plugin |

Takes a report that already exists on disk — one an earlier `orion generate`
produced, or one written by any other tool — and hands it to a storage plugin
unchanged. No reporter is involved, which is the point: a pipeline that builds
its report in one job can upload it from another without installing the reporter
there.

The single positional is a path to one JSON file. Unlike `generate`'s
positionals it is **not** a glob and is not passed through to a plugin: the CLI
reads it itself, so it must name an existing file. Giving no file, or more than
one, is an error.

The file is parsed and checked against the `Report` envelope (`kind`, `version`,
`generatedAt`, `data`) with `isReport` before storage is called, so a JSON file
that is not a report is rejected rather than persisted. `data` is not inspected
— only the reporter that produced it and the viewer plugin that renders it know
its shape. A leading byte-order mark is tolerated.

The file is stored exactly as written, metadata included. `store` collects none
of its own: the machine uploading a report is often not the one that generated
it, and describing the uploader would be worse than saying nothing.

Option resolution and the parse phase work exactly as they do for `generate`,
with only the `storage` role in play. With no reporter competing for them, the
storage plugin's options always get their bare aliases as well as the canonical
`--storage-<name>` form:

```sh
orion store --storage @orion/plugin-storage-filesystem --path ./reports ./report.json
```

Options are parsed before the file is read, so a bad option fails without
touching the filesystem. Success prints the same two lines as `generate`:

```
Stored pulumi-diff report as pulumi-diff-20260806T093000Z-1f4c2a.json
file:///…/reports/pulumi-diff-20260806T093000Z-1f4c2a.json
```

## Exit codes

`0` on success. `1` for any user-facing failure: unknown command, unknown or
malformed option, a missing required option, an option a plugin rejected, no
input files, a `--metadata` argument that is not a usable `key=value`, a report
file that cannot be read or is not a report, or a plugin that cannot be loaded or
is of the wrong role. Failures print to stderr prefixed
with the command name.

Unexpected errors are not caught and surface as a normal Node stack trace.

## Plugin resolution

Plugin packages are resolved from **the working directory first**, then from
wherever the CLI itself is installed. A project-local plugin therefore wins over
a globally installed one of the same name. An absolute path to a module file
also works, which is what the tests use.

## A worked `generate`

The vitest reporter and the filesystem storage plugin make a complete run:

```sh
vitest run --reporter=json --outputFile results.json

pnpm exec orion generate \
  --reporter @orion/plugin-reporter-vitest \
  --storage @orion/plugin-storage-filesystem \
  --storage-path ./reports \
  --reporter-root . \
  results.json
```

```
Stored test-results report as test-results-20260808T060129Z-6c0a1f.json
file:///…/reports/test-results-20260808T060129Z-6c0a1f.json
```

Point a viewer with `@orion/plugin-viewer-test-results` at that same directory
and the id in the first line is what the link uses. See
[`plugins/reporter-vitest`](../plugins/reporter-vitest) for its options, and
[`playground/README.md`](../playground/README.md) to run both halves.

## Writing your own reporter

A reporter does not have to be a published package — any `.mjs` module exporting
a valid plugin works, which is the quickest way to try the contract:

```js
// my-reporter.mjs
export default {
  kind: "reporter",
  name: "demo",
  options: [{ name: "token", type: "string", description: "Token", required: true }],
  // A plugin package would import ok() and invalid() from @orion/core; the
  // literals are here so this file stands alone.
  parseOptions(values) {
    if (typeof values.token !== "string") {
      return { ok: false, issues: [{ option: "token", message: "is required." }] };
    }
    return { ok: true, options: { token: values.token } };
  },
  async generate({ patterns }) {
    return { kind: "demo", version: 1, generatedAt: new Date().toISOString(), data: { patterns } };
  },
};
```

```sh
pnpm exec orion generate --reporter ./my-reporter.mjs \
  --storage @orion/plugin-storage-filesystem --path ./reports \
  --token t "src/**/*.json"
```

The fixtures under
[`packages/cli/test/fixtures`](../packages/cli/test/fixtures) are working
examples of both roles.
