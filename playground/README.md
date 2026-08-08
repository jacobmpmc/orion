# Playground

A scratch project that consumes the workspace the way a real one would: it
depends on `@orion/cli`, `@orion/viewer` and the filesystem storage plugin, so
both binaries resolve here and plugins are found by name rather than by path.

Nothing here is part of the product. It exists to run the two halves of Orion
against each other by hand.

```sh
pnpm build                 # from the repo root: both binaries and the client
cd playground
pnpm generate "src/**/*.ts"
pnpm serve
```

Then open <http://127.0.0.1:7317>, or go straight to the id `generate` printed:
`http://127.0.0.1:7317/r/local/<id>`.

## What is here

| Path | What it is |
| --- | --- |
| [`orion-viewer.config.js`](orion-viewer.config.js) | A worked config, typed with `defineConfig` |
| [`reporters/demo.mjs`](reporters/demo.mjs) | A stand-in reporter, because no reporter plugin exists yet |
| [`scripts/make-certs.mjs`](scripts/make-certs.mjs) | Throwaway certificates for trying HTTPS |
| `reports/` | Where reports land. Gitignored — it is scratch output |

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm generate <glob…>` | Generates a report into `./reports` |
| `pnpm run store <file>` | Puts an existing report file into `./reports`, no reporter involved. Needs `run`: pnpm has a `store` command of its own |
| `pnpm serve` | Starts the viewer against that directory |
| `pnpm certs` && `pnpm serve:https` | Generates a self-signed certificate and serves over TLS |
| `pnpm reset` | Deletes `./reports` |

`generate` passes its arguments through, so the reporter's own options work:

```sh
pnpm generate --title "Nightly" --changes 8 "**/*.json"
pnpm generate --storage-name latest.json "src/**"   # a stable id to link to
pnpm generate --storage-name runs/42/diff.json "."  # ids may contain slashes
```

## Things worth trying

**Re-storing a report someone else generated.** Take a file out of `reports/`
and put it back under a name you choose — no reporter runs, and the envelope is
checked before the backend is asked to keep it:

```sh
pnpm run store --storage-name copy.json ./reports/<id>.json
pnpm run store ./package.json        # rejected: valid JSON, but not a report
```

**A report id with slashes.** `--storage-name runs/42/diff.json` produces the id
`runs/42/diff.json`, and the link `/r/local/runs/42/diff.json` resolves it — the
id is the whole rest of the path, not one segment.

**A hard refresh on a deep link.** It works because the server serves the client
shell for anything it does not recognise, not because it knows that route.

**Drag and drop.** Drop `reports/<id>.json` onto the home page. Watch the
network tab: nothing is uploaded, because the server has no endpoint that
accepts a report.

**A missing option.** Delete `options.path` from the config and start the
viewer. It refuses to listen and names the setting — the parse phase runs for
every plugin before anything binds a port.

**A backend that cannot read.** Point a connection at a write-only plugin and it
fails at startup with `does not implement fetch()`, rather than at the first
request.

**The empty state.** With `viewers: []` a report is fetched successfully and
then has nothing to render it. That is the honest state of the repo: the viewer
app and its plugin contract exist, but no viewer plugin does yet.

## Note

`reports/` is gitignored, so a fresh clone has nothing to serve until you run
`pnpm generate`. The viewer starts fine regardless — an empty storage directory
is not an error, it just has no reports in it.
