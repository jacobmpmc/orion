# Playground

A scratch project that consumes the workspace the way a real one would: it
depends on `@orion/cli`, `@orion/viewer` and every base plugin, so both binaries
resolve here and plugins are found by name rather than by path.

Nothing here is part of the product. It exists to run the two halves of Orion
against each other by hand.

```sh
pnpm build                 # from the repo root: binaries, client, plugin bundles
cd playground
pnpm results               # run a real suite, capturing vitest's JSON
pnpm run test-report       # that JSON -> a stored test-results report
pnpm serve
```

Then open <http://127.0.0.1:7317>, or go straight to
<http://127.0.0.1:7317/r/local/tests.json>.

**`pnpm build` from the root, not `tsc --build`.** The viewer plugin's browser
bundle is a separate Vite build, and the viewer stats it at startup: without it
the server refuses to start rather than failing on a page.

## What is here

| Path | What it is |
| --- | --- |
| [`orion-viewer.config.js`](orion-viewer.config.js) | A worked config, typed with `defineConfig` |
| [`reporters/demo.mjs`](reporters/demo.mjs) | A stand-in reporter producing a `demo` report — a kind no viewer plugin claims, which is how you see the empty state |
| [`scripts/make-certs.mjs`](scripts/make-certs.mjs) | Throwaway certificates for trying HTTPS |
| `reports/` | Where reports land. Gitignored — it is scratch output |
| `results/` | Raw vitest JSON from `pnpm results`. Also gitignored |

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm results` | Runs `@orion/cli`'s suite, capturing vitest JSON into `./results` |
| `pnpm run test-report` | Turns that JSON into a stored `test-results` report. Needs `run`: `test-report` is fine, but keep the habit |
| `pnpm generate <glob…>` | Generates a `demo` report into `./reports` with the stand-in reporter |
| `pnpm run composite <report files…>` | Compiles reports already in `./reports` into one `composite` report at `everything.json` |
| `pnpm run store <file>` | Puts an existing report file into `./reports`, no reporter involved. Needs `run`: pnpm has a `store` command of its own |
| `pnpm serve` | Starts the viewer against that directory |
| `pnpm certs` && `pnpm serve:https` | Generates a self-signed certificate and serves over TLS |
| `pnpm reset` | Deletes `./reports` and `./results` |

Both generate scripts pass their arguments through, so plugin options work:

```sh
pnpm run test-report --storage-name nightly.json      # a stable id to link to
pnpm run test-report --reporter-absolute-paths        # leave CI paths alone
pnpm generate --title "Nightly" --changes 8 "**/*.json"
pnpm generate --storage-name runs/42/diff.json "."    # ids may contain slashes
```

## Things worth trying

**The rendering, and its filter.** Open
<http://127.0.0.1:7317/r/local/tests.json>. Type into the filter — the list
narrows on both test names and file paths, and any file you had expanded stays
expanded because the tree is filtered rather than rebuilt. Tick "Failed only" on
a green run and you get the empty notice.

**One report made of others.** After `pnpm run test-report` and
`pnpm generate "src/**"`, compile both into one:

```sh
pnpm run composite ./reports/tests.json ./reports/demo-*.json
```

Open <http://127.0.0.1:7317/r/local/everything.json>. The test-results part is
drawn by the plugin that owns that kind — filter and all, working exactly as it
does on its own page — and the `demo` parts, which no plugin claims, carry the
host's placeholder instead. Note what is *not* repeated: one metadata panel, at
the top, for the composite itself. A part whose kind nothing renders starts
collapsed, because the plugin asked `canRender` before laying out the section.

**A part that lives in storage.** An entry can reference a report instead of
embedding it. Write one by hand into `reports/` and the viewer fetches it when
it renders:

```json
{ "kind": "composite", "version": 1, "generatedAt": "2026-08-10T00:00:00.000Z",
  "data": { "entries": [
    { "title": "stored tests", "ref": { "connection": "local", "id": "tests.json" } },
    { "title": "gone missing", "ref": { "connection": "local", "id": "nope.json" } }
  ] } }
```

The second one's placeholder carries the API's own message —
*No report 'nope.json' in connection 'local'* — which is the difference between
"nothing renders this" and "this is not there any more". Refs are why
`orion generate --reporter @orion/plugin-reporter-composite --ref local=tests.json`
exists; the CLI still wants at least one positional, so pass a file too.

**A cycle.** Two composites that reference each other are well-formed data:

```sh
node -e "const w=(n,r)=>require('node:fs').writeFileSync('reports/'+n,JSON.stringify({kind:'composite',version:1,generatedAt:new Date().toISOString(),data:{entries:[{ref:{connection:'local',id:r}}]}}));w('loop-a.json','loop-b.json');w('loop-b.json','loop-a.json')"
```

Open `/r/local/loop-a.json`. It nests four deep and stops with *"Reports are
nested too deeply to render."* — the schema cannot prevent this, so the host
caps it.

**Dropping a composite in.** Drag `reports/everything.json` onto the home page.
The embedded parts render with no network traffic at all; a `ref` entry in a
dropped file still resolves, because the page is talking to a viewer that has
that connection. Move the file to a machine whose viewer does not, and the same
entry becomes a placeholder — which is the trade the schema documents.

**A failure worth looking at.** Break a test in `packages/cli` (change an
expected value), then re-run `pnpm results && pnpm run test-report`. The failing
file is expanded on arrival, the failures section leads with the real stack
trace, and the counts bar turns.

**A sharded run merging into one report.** Two inputs, one report:

```sh
pnpm --dir ../packages/cli exec vitest run --shard=1/2 --reporter=json \
  --outputFile ../../playground/results/a.json
pnpm --dir ../packages/cli exec vitest run --shard=2/2 --reporter=json \
  --outputFile ../../playground/results/b.json
pnpm run test-report --storage-name sharded.json "./results/*.json"
```

**Pointing the reporter at the wrong file.** `pnpm run test-report ./package.json`
says it is not a vitest JSON result file and names the command that makes one.
Nothing is stored — the reporter runs before the storage plugin.

**An unbuilt bundle.** Move `plugins/viewer-test-results/dist/browser/index.js`
aside and `pnpm serve` refuses to start: *"Has the plugin been built?"*. Bundles
are stat-ed at startup, not at the first request.

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

**Drag and drop.** Drop `reports/tests.json` onto the home page. It renders
identically to the stored one, minus the `source` — and the network tab shows
nothing uploaded, because the server has no endpoint that accepts a report.

**A missing option.** Delete `options.path` from the config and start the
viewer. It refuses to listen and names the setting — the parse phase runs for
every plugin before anything binds a port.

**A backend that cannot read.** Point a connection at a write-only plugin and it
fails at startup with `does not implement fetch()`, rather than at the first
request.

**The empty state.** Run `pnpm generate "src/**"` and open the report it names.
The stand-in reporter produces a `demo` report, and no viewer plugin claims that
kind, so it is fetched successfully and then has nothing to render it. Dispatch
is per `Report.kind`, and this is what a viewer that has never heard of your
report looks like.

## Note

`reports/` and `results/` are gitignored, so a fresh clone has nothing to serve
until you run one of the generate scripts. The viewer starts fine regardless —
an empty storage directory is not an error, it just has no reports in it.
