# @orion/host

Loading and validating plugin packages, shared by the two things that do it:
`orion generate` and `orion-viewer`.

It is not a plugin dependency. Plugins depend on `@orion/core` and nothing else;
this package is for the code on the other side of that boundary.

```ts
import { loadPlugin, parsePluginOptions } from "@orion/host";

const storage = await loadPlugin(specifier, {
  kind: "storage",
  methods: ["fetch"],                       // the CLI passes ["store"]
  fail: (message) => new ViewerError(message),
  from: import.meta.url,
});
```

## Why the error constructor is a parameter

A user-facing error belongs to whoever prints it: the CLI catches `CliError` and
prefixes stderr with the command name, the viewer does the same with
`ViewerError`. Neither type could live here without one host importing the
other's, and neither could live in `@orion/core` without every plugin package
carrying it. So the message strings live here and the class comes from the
caller.

## Why `methods` is a list

The capability a host needs is the host's business, not the role's.
`StoragePlugin` declares `store` and `fetch` as independent optional methods, so
`generate` loads a backend with `["store"]` and the viewer with `["fetch"]`, and
a write-only or read-only backend is rejected only by the host that actually
needs the other one. `parseOptions` is always required on top.

## Why `from` exists

Resolution tries the working directory first, so a project-local plugin wins
over anything installed globally. The fallback then resolves relative to the
host that asked — which has to be passed in, because resolving relative to *this*
package would look in a directory that depends on nothing but `@orion/core`.
