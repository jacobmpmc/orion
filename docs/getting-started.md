# Getting started

## Prerequisites

- **Node.js >= 22** — enforced by `engines` in the root `package.json`.
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
| `pnpm build` | Builds every package in dependency order (`tsc --build`) |
| `pnpm clean` | Removes build output and `.tsbuildinfo` files |
| `pnpm typecheck` | Full rebuild, ignoring incremental state |
| `pnpm test` | Runs each package's `test` script, if it has one |
| `pnpm dev` | Watch-mode build across all packages |
| `pnpm exec orion …` | Runs the built CLI |

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

`orion generate` needs a reporter and a storage plugin, and none exist yet. To
exercise it today you need a local plugin file — see
[CLI](cli.md#trying-generate-without-a-published-plugin).

## Editor setup

[`.vscode/settings.json`](../.vscode/settings.json) pins VS Code to the
workspace TypeScript so the editor and `pnpm build` agree. Accept the
"Use Workspace Version" prompt, or run **TypeScript: Select TypeScript Version**.

After any install that adds packages, run **TypeScript: Restart TS Server** —
the language service caches `node_modules` and will otherwise report imports as
unresolved that the compiler resolves fine.
