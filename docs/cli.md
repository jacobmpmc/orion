# CLI

The `orion` binary. Build first (`pnpm build`), then `pnpm exec orion <command>`.

## Commands

| Command | Purpose |
| --- | --- |
| `orion help [command]` | Lists commands, or shows usage for one |
| `orion generate` | Builds a report and persists it |

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

## Exit codes

`0` on success. `1` for any user-facing failure: unknown command, unknown or
malformed option, a missing required option, an option a plugin rejected, no
input files, or a plugin that cannot be loaded or is of the wrong role.
Failures print to stderr prefixed with the command name.

Unexpected errors are not caught and surface as a normal Node stack trace.

## Plugin resolution

Plugin packages are resolved from **the working directory first**, then from
wherever the CLI itself is installed. A project-local plugin therefore wins over
a globally installed one of the same name. An absolute path to a module file
also works, which is what the tests use.

## Trying `generate` without a published plugin

No reporter plugin exists yet, so `generate` needs a local file for that half.
Any `.mjs` module exporting a valid plugin works:

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
