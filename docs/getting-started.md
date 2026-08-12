# Getting started

## Prerequisites

- **Node.js >= 22.18** — enforced by `engines` in the root `package.json`. The
  floor is 22.18 rather than 22 because that is where type stripping became
  available without a flag, which is what lets the viewer load a `.ts` config
  file.
- **pnpm 11.14.0** — pinned via `packageManager`. Corepack will select it
  automatically; otherwise `npm i -g pnpm@11.14.0`.

`engine-strict=true` in [`.npmrc`](../.npmrc) makes a mismatched Node version
fail the install rather than warn.

## Install

```sh
pnpm install
```

The first install may take longer than expected: the workspace enforces a
one-week [minimum release age](workspace.md#release-age-policy), so pnpm ignores
very recent publishes when resolving. A successful install prints
`Lockfile passes supply-chain policies`.

## Everyday commands

Run from the repo root:

| Command | What it does |
| --- | --- |
| `pnpm build` | Builds every package in dependency order (`tsc --build`), then the viewer's client (`vite build`) |
| `pnpm clean` | Removes build output and `.tsbuildinfo` files |
| `pnpm typecheck` | Full rebuild, ignoring incremental state |
| `pnpm test` | Runs each package's `test` script, if it has one |
| `pnpm dev` | Watch-mode build across all packages |
| `pnpm exec orion …` | Runs the built CLI |
| `pnpm exec orion-viewer …` | Runs the built viewer |

`tsc --build` alone does not produce the viewer's browser client — that is a
separate Vite build, and without it the viewer serves 503 for every page while
its API keeps working. `pnpm build` runs both, in that order.

Per package, use `--filter`:

```sh
pnpm --filter @orion/cli test
pnpm --filter @orion/cli test:watch
pnpm --filter @orion/cli test:types
```

## Running the CLI

`orion` is linked into the workspace because the root `package.json` depends on
`@orion/cli`. **The CLI must be built before it will run** — the bin points at
`dist/`, not the sources.

```sh
pnpm build
pnpm exec orion help
pnpm exec orion help generate
```

`orion generate` needs a reporter and a storage plugin. This repo ships both, so
a real run is one command — see the worked example in
[CLI](cli.md#a-worked-generate).

`orion store` needs only a storage plugin, so it runs against a report file you
write by hand:

```sh
echo '{"kind":"demo","version":1,"generatedAt":"2026-01-01T00:00:00.000Z","data":{}}' > report.json
pnpm exec orion store --storage @orion/plugin-storage-filesystem --path ./reports report.json
```

## The playground

[`playground/`](../playground) is already wired up for exactly this: it depends
on both binaries and every base plugin, and carries a worked viewer config.

```sh
pnpm build          # from the repo root — both binaries, both browser bundles
cd playground
pnpm results        # run a real test suite, capturing vitest's JSON
pnpm run test-report
pnpm serve
```

Open the printed URL, or go straight to the report the run named:
`http://127.0.0.1:7317/r/local/tests.json`. See
[`playground/README.md`](../playground/README.md) for what else is worth trying
there, including what a report *nothing* renders looks like.

**Build before serving.** A viewer plugin's browser bundle is a separate Vite
build, and the viewer stats it at startup: after `tsc --build` alone the server
refuses to start with *"Has the plugin been built?"*. `pnpm build` from the root
runs both halves.

## Editor setup

[`.vscode/settings.json`](../.vscode/settings.json) pins VS Code to the
workspace TypeScript so the editor and `pnpm build` agree. Accept the
"Use Workspace Version" prompt, or run **TypeScript: Select TypeScript Version**.

After any install that adds packages, run **TypeScript: Restart TS Server** —
the language service caches `node_modules` and will otherwise report imports as
unresolved that the compiler resolves fine.
