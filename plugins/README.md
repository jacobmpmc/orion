# Plugins

Base plugin packages that ship with Orion. Each subdirectory is its own
workspace package, matched by the `plugins/*` glob in `pnpm-workspace.yaml`.

Third-party plugins live in their own repositories and are installed as ordinary
npm packages; nothing here is privileged. This directory only holds the ones
maintained alongside the CLI.

## Roles

A plugin declares exactly one role, so a CI/CD pipeline installs only the code
it needs and never pulls in viewer rendering just to upload a report.

| Role       | Implements               | Used by     |
| ---------- | ------------------------ | ----------- |
| `reporter` | `generate(context)`      | `orion generate` |
| `storage`  | `store(context)`         | `orion generate`, viewer |
| `viewer`   | rendering (not yet used) | viewer app  |

Every plugin also implements `parseOptions`, whatever its role.

## Naming

Name packages `@orion/plugin-<role>-<target>`, and the directory after the
package minus the `plugin-` prefix, which `plugins/` already implies:

```
plugins/reporter-pulumi-diff   ->  @orion/plugin-reporter-pulumi-diff
plugins/storage-s3             ->  @orion/plugin-storage-s3
```

## Contract

Type the plugin against the interfaces in `@orion/core` (`ReporterPlugin`,
`StoragePlugin`) and export it as the default export. A named export matching
the role (`export const reporter = ...`) or `plugin` also works.

Both interfaces take the plugin's own options type as a parameter: whatever
`parseOptions` builds is exactly what the role method receives.

```ts
import { invalid, ok } from "@orion/core";
import type { ReporterPlugin } from "@orion/core";

interface PulumiDiffOptions {
  readonly stack: string;
}

const plugin: ReporterPlugin<PulumiDiffOptions> = {
  kind: "reporter",
  name: "pulumi-diff",
  options: [
    { name: "stack", type: "string", description: "Stack name", required: true },
  ],
  parseOptions(values) {
    if (typeof values["stack"] !== "string") {
      return invalid({ option: "stack", message: "is required." });
    }
    return ok({ stack: values["stack"] });
  },
  async generate({ patterns, options }) {
    // `patterns` are the positional file names / globs, unexpanded.
    // `options` is the PulumiDiffOptions built above.
    return { kind: "pulumi-diff", version: 1, generatedAt: new Date().toISOString(), data: {} };
  },
};

export default plugin;
```

The loader checks `kind`, `parseOptions` and the role's method at runtime, so a
mistyped or mismatched package fails with a clear error rather than a stack
trace.

## The two phases

`parseOptions` is a phase of its own, run for every plugin involved **before**
any of them does work. Two reasons:

- A misconfigured run fails having produced nothing — no half-written report,
  no partial upload.
- The host collects issues from every plugin and shows them together, so a user
  fixing options does it in one pass rather than one error per attempt.

Report bad input by returning issues; reserve throwing for a genuine bug in the
plugin. An issue naming an `option` is rendered by the CLI as the flag the user
typed (`--storage-name …`); omit `option` for a problem spanning several.

`@orion/core` provides the two constructors. `invalid` takes a single issue or
an array of them, so accumulating is just as easy as reporting one:

```ts
import { invalid, ok } from "@orion/core";

return invalid({ option: "path", message: "is required." });
return invalid(issues);                       // several, collected as you check
return ok({ root: resolve(path) });
```

Building the object literal yourself works too — the helpers are convenience,
not a requirement.

Phrase a message to read after the flag name — "is required", "must be an
ISO-8601 date" — since that is how it is printed.

Do everything you can up front: resolving paths, checking a name stays inside a
root, parsing a date. The role method should be able to trust what it is given.
`OptionsResult` and `OptionIssue` live in `@orion/core` because every host runs
this phase the same way — the CLI today, the viewer later.

## Options

Plugins contribute **named arguments only** -- positionals are reserved for the
input file names and glob patterns passed to the reporter.

Each option is always reachable as `--<role>-<name>`, and additionally as a bare
`--<name>` when no core flag or earlier plugin has claimed it. Two plugins may
safely declare the same option name; they stay on separate targets and each
receives only its own values.

## Adding a plugin

1. Create `plugins/<role>-<target>/` with a `package.json` and `tsconfig.json`,
   mirroring `packages/cli`.
2. Depend on `@orion/core` with `workspace:*`, and use `catalog:` for shared
   tooling versions.
3. Add a project reference in the root `tsconfig.json` so `pnpm build` picks it
   up in dependency order.
4. Run `pnpm install` to link it.
