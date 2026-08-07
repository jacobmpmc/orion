# @orion/plugin-storage-filesystem

Stores a report as a single JSON file under a directory on the local file
system. Useful for a mounted CI artifact volume, an NFS share, or trying Orion
out without standing up object storage.

```sh
orion generate \
  --reporter @orion/plugin-reporter-pulumi-diff \
  --storage @orion/plugin-storage-filesystem \
  --storage-path ./reports \
  preview.json
```

## Options

| Option | Type | Notes |
| --- | --- | --- |
| `--storage-path` | string | **Required.** Directory to write into. Created if missing |
| `--storage-name` | string | File name relative to `--storage-path`. Default: generated |

Both are also available bare (`--path`, `--name`) when the reporter has not
claimed those names.

## What it writes

One pretty-printed JSON file per report. Without `--storage-name` the file is
called `<kind>-<timestamp>-<random>.json` — the timestamp comes from the
report's `generatedAt`, so a directory listing is in generation order, and the
random suffix prevents collisions within the same second.

The returned `id` is the file's path relative to `--storage-path`, always with
forward slashes so an id written on Windows still resolves elsewhere. That is
what a viewer configured with the same root uses to fetch the report. The `url`
is a `file:` link to the file itself.

## Reading a report back

This plugin implements both storage capabilities, so a viewer can read from the
same directory `generate` wrote to:

```js
// orion-viewer.config.js
export default {
  connections: [{
    name: "local",
    package: "@orion/plugin-storage-filesystem",
    options: { path: "./reports" },
  }],
};
```

`fetch` takes the `id` `store` handed out. An id that does not resolve to a file
inside the root, or names nothing at all, resolves `undefined` — a miss, which
the viewer turns into a 404. Containment is re-checked on the way in even though
this plugin produced the id itself, because by then it has been through a URL.

A file that exists but is not an Orion report throws instead. That is not a
miss: it means something else is writing into the reports directory, and
silently reporting "not found" would hide it.

An explicit `--storage-name` may contain subdirectories (`builds/42/diff.json`)
but may not escape the configured path. Writing over an existing file is
allowed, which is what makes `--storage-name latest.json` useful.

## Options are checked before anything is written

The path is resolved and the name checked for containment in `parseOptions`,
which the host runs before the reporter has built anything. A bad option is
reported as an issue against its flag, so a misconfigured run fails without
creating a directory or a file. `store` receives a
`FilesystemStorageOptions` — an absolute `root` and an optional, already
validated `name` — and can trust both.
