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
