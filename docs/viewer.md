# Viewer

`@orion/viewer` is the deployable half of Orion. It reads reports back out of
storage and renders them with viewer plugins in the browser. It never generates
or stores anything — that is `orion generate`'s job, on an entirely separate
trip.

It ships two things: the `orion-viewer` binary, and a module another Node
process can import and start.

## Running it

```sh
pnpm build                    # tsc, then the client's Vite build
pnpm exec orion-viewer        # reads orion-viewer.config.js from the cwd
```

The client is a separate Vite build. Without it the server still starts and the
API still answers, but every page returns 503 with the command that fixes it.

```sh
pnpm --filter @orion/viewer build:client
```

## Development

The client is served by Vite for hot reloading while a real `orion-viewer`
answers everything that needs plugins. Three watchers, one per terminal, from
`packages/viewer`:

```sh
pnpm --filter @orion/viewer dev          # tsc --build --watch, server sources → dist/
pnpm --filter @orion/viewer dev:server   # node --watch dist/bin.js, restarts on re-emit
pnpm --filter @orion/viewer dev:client   # vite, with HMR
```

Then open Vite's URL — <http://localhost:5173> — **not** the server's. Vite
proxies `/api`, `/plugins` and `/healthz` through to `http://127.0.0.1:7317`, so
the app sees one origin. `/plugins` matters as much as `/api`: a viewer plugin's
browser bundle is fetched from the server at runtime and is never resolved by
Vite.

`dev` and `dev:server` are two processes rather than one because `tsc` owns the
rebuild and `node --watch` owns the restart; neither does the other's job.
`dist/client` is irrelevant while developing — Vite serves the client — so a
stale or missing browser build cannot mislead you.

Point the proxy elsewhere with `ORION_VIEWER_ORIGIN`, which is what you need if
the server is on another port or speaking HTTPS:

```sh
ORION_VIEWER_ORIGIN=http://127.0.0.1:9000 pnpm --filter @orion/viewer dev:client
```

Changes to anything under `src/` need the server restart, so they are a second
or two rather than instant. Changes under `client/` are hot-replaced.

## Configuration

Configuration comes from a module, from CLI flags, or from the argument passed
to `createServer` — in that order of authority.

| Source | Beats | Why |
| --- | --- | --- |
| `createServer({ … })` | everything | An embedding process chose these explicitly and has no say over the argv it happens to run under |
| CLI flags | the file | The more specific invocation of the same process |
| Config file | defaults | The durable setup |
| Defaults | — | Loopback, port 7317, mounted at `/` |

Fields merge one at a time, but **`connections` and `viewers` are replaced
wholesale**. A half-merged list would silently resurrect a connection you
thought you had removed.

### The config file

`orion-viewer.config.ts`, `.js` or `.mjs`, looked for **in the working directory
only** — no walk up the tree, since a viewer inheriting a config from somewhere
above is very hard to explain inside a container. `--config <path>` names one
explicitly; `--no-config` skips discovery.

```js
import { defineConfig } from "@orion/viewer/config";

export default defineConfig({
  host: "127.0.0.1",
  port: 7317,
  connections: [
    {
      name: "local",                                  // the /r/<name>/ segment
      label: "Local disk",                            // shown in the client
      package: "@orion/plugin-storage-filesystem",
      options: { path: "/var/orion/reports" },        // this plugin's own options
    },
  ],
  viewers: [{ package: "@orion/plugin-viewer-test-results" }],
});
```

`defineConfig` is an identity function; it exists to give the object literal a
contextual type. A plain default export works just as well, which matters when
the config lives somewhere `@orion/viewer` is not installed.

A `.ts` config needs Node 22.18 or newer, where type stripping is on by
default — hence the repo's `engines` floor.

The module is imported and executed, so what it exports is untrusted input in
exactly the way a plugin package is. It is checked before anything downstream
trusts it, and every problem is reported at once:

```
orion-viewer: Invalid configuration in ./orion-viewer.config.js:
  port must be an integer between 0 and 65535, but got "8080".
  connections[1].name is missing.
  connections[0].name 'prod/eu' must start with a letter or digit and may only contain letters, digits, '.', '_' and '-'.
  tls.key is required when tls is given.
```

### Flags

| Flag | Meaning |
| --- | --- |
| `--config <path>` | Configuration module to load |
| `--no-config` | Ignore any configuration file |
| `--host <name>` | Interface to bind. Default `127.0.0.1` |
| `--port <number>` | Default `7317`. `0` binds an ephemeral port |
| `--base-path <path>` | Mount prefix behind a reverse proxy. Default `/` |
| `--tls-cert <path>` / `--tls-key <path>` | Serve HTTPS. Required together |
| `--connection <name>=<package>` | Register a connection. Repeatable |
| `--viewer <package>` | Register a viewer plugin. Repeatable |
| `--client-dir <path>` | Where the built client lives |
| `--help`, `-h` | Usage |

`--connection` and `--viewer` deliberately cannot express plugin *options*. That
would need the CLI's load-then-reparse dance, and anything holding a credential
belongs in a file rather than in a process listing.

The default bind is loopback, so running the binary on a workstation does not put
reports on the LAN. The Dockerfile passes `--host 0.0.0.0`, because a container
binding loopback is unreachable from its host.

## As a module

```ts
import { startServer } from "@orion/viewer";

const viewer = await startServer({
  config: false,                     // skip file discovery entirely
  port: 0,                           // ephemeral, read back from viewer.url
  connections: [{ name: "local", package: "@orion/plugin-storage-filesystem",
                 options: { path: "./reports" } }],
});

console.log(viewer.url);
await viewer.close();
```

`createServer` does everything except bind; `startServer` is that plus `listen`.

## Startup

Every plugin is loaded and every option settled **before the server listens**,
the same discipline `orion generate` follows. A misconfigured viewer fails at
startup rather than on the first request that happens to touch the broken part,
and all the problems arrive together:

```
orion-viewer: Invalid plugin options:
  connection 'prod' option 'bucket' is required.
  viewer plugin 'pulumi-diff' (pulumi-diff): needs either 'theme' or 'themeFile'.
```

Storage plugins are loaded requiring `fetch`, which is what rejects a reporter
package or a write-only backend here rather than later. Viewer plugins have
their `bundle` resolved and stat-ed, so a plugin that was never built fails now.

## HTTP

Every route is a GET. There is no upload endpoint anywhere, and that is
deliberate: a report the user drags in is parsed in the browser and never sent
to the server. That is what keeps the app stateless and leaves it with no
upload or CSRF surface at all.

Paths below are relative to `basePath`.

| Path | Answers |
| --- | --- |
| `/api/manifest` | Connections and viewer plugins the client needs. Never plugin options — they hold credentials |
| `/api/reports/<connection>/<id…>` | The report, fetched through that connection's plugin |
| `/plugins/<viewerId>/bundle.js` | A viewer plugin's browser bundle |
| `/healthz` | `{"status":"ok"}` |
| anything else | A file from the built client, or the client shell |

The report id is *the whole rest of the path*, not one segment: the filesystem
backend hands out root-relative paths, so slashes inside an id are normal.

| Outcome | Status | `code` |
| --- | --- | --- |
| Success | 200 | — |
| No such connection | 404 | `unknown_connection` |
| Backend has no such report | 404 | `report_not_found` |
| Backend returned a non-report | 500 | `invalid_report` |
| Backend threw | 502 | `storage_error` |
| Not a GET | 405 + `Allow: GET` | `method_not_allowed` |
| Client not built | 503 | `client_not_built` |

Failures share one body shape:

```json
{ "error": { "code": "report_not_found", "message": "No report 'a/b.json' in connection 'prod'." } }
```

A backend that throws is a 502 because the fault is in something the viewer
merely proxies. Its message is **not** echoed back — it can carry a bucket name
or a credentialed URL — it goes to stderr instead.

## Links

A stored report is at `/r/<connection>/<id>`:

```
https://orion.example.com/r/local/runs/42/diff.json
```

Anything the server does not recognise serves the client shell, so opening that
link cold — or hard-refreshing it — works without any server-side route table.

## Drag and drop

The home page accepts a report JSON file by drop or file picker. It is read with
`File.text()`, parsed, checked with `isReport` from `@orion/core`, and rendered
by the same plugin dispatch a stored report goes through. Nothing is uploaded,
so a report from a storage backend this viewer has no connection to still opens.

## Theme tokens a viewer plugin may use

The app defines these custom properties on `:root`, in light and dark. They are
a **contract**, not private styling: a plugin's bundle mounts into this page and
inherits them, which is what stops two plugins disagreeing about what "failed"
looks like. Renaming one breaks every plugin that ever shipped.

| Token | Use |
| --- | --- |
| `--bg` / `--fg` | Page background and body text |
| `--muted` | Secondary text; also the neutral status |
| `--line` | Borders and rules |
| `--accent` | Links and emphasis |
| `--ok` | Passed, created, healthy |
| `--warn` | Todo, changed, degraded |
| `--danger` | Failed, deleted, error |

The three status tokens are semantic rather than named for any one report kind,
so a test report's passed/todo/failed and an infrastructure diff's
created/changed/deleted use the same three colours. `color-scheme: light dark`
is set on `:root`, so form controls follow the theme without a plugin doing
anything.

A plugin should use `var(--ok)` and friends directly rather than picking its
own colours. Keeping a literal as a fallback — `var(--ok, #1a7f37)` — costs
nothing and covers a host that predates a token.

There is no Shadow DOM: a plugin's stylesheet is global. Scope every rule under
one root class and prefix every class name, or a bare `pre { … }` will restyle
the app around it. See
[`plugins/viewer-test-results`](../plugins/viewer-test-results) for a worked
example.

## Behind a reverse proxy

`--base-path /orion` mounts everything under that prefix. Vite emits absolute
`/assets/…` URLs, so the shell is rewritten at serve time and
`window.__ORION_BASE__` is injected — one build works wherever it is mounted.

A viewer plugin's browser bundle must be self-contained for the same reason:
inline its CSS and assets rather than emitting absolute URLs of its own. Only
`/plugins/<viewerId>/bundle.js` is served — a sibling `style.css` or `.js.map`
404s — so the bundle has to be exactly one file.
[`plugins/viewer-test-results/vite.config.ts`](../plugins/viewer-test-results/vite.config.ts)
is the pattern: a single-entry `build.lib`, no sourcemap, and the stylesheet
carried as a string rather than imported.

That bundle is also served `cache-control: immutable`, so a rebuild during
development needs a hard refresh. The manifest is fetched once per page load,
so adding a viewer plugin needs a viewer restart.

## HTTPS

```sh
orion-viewer --tls-cert cert.pem --tls-key key.pem
```

Both are required together. The files are read at startup, so an unreadable path
names itself while someone is still watching the output rather than failing on
the first handshake. There is no HTTP-to-HTTPS redirect listener; that is a
reverse proxy's job.

## Docker

```sh
docker build -f packages/viewer/Dockerfile -t orion-viewer .
docker run -p 7317:7317 \
  -v "$PWD/orion-viewer.config.js:/app/orion-viewer.config.js" \
  -v "$PWD/reports:/app/reports" \
  orion-viewer --host 0.0.0.0
```

Storage and viewer plugins are ordinary npm packages, so an image that needs
them installs them on top of this one.

## Authentication

There is none. The viewer assumes it sits behind whatever the person hosting it
puts in front of it. Note that `/api/manifest` exposes connection *names* and
labels to any caller that can reach the port.
