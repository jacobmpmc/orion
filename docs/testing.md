# Testing

[Vitest](https://vitest.dev) powers the tests. Every package has them —
`@orion/core` covers its result helpers, which are the only runtime code it
carries.

```sh
pnpm test                              # every package that defines a test script
pnpm -r test:types                     # typecheck every package's tests
pnpm --filter @orion/cli test          # once
pnpm --filter @orion/cli test:watch    # watch mode
pnpm --filter @orion/cli test:types    # typecheck one package's tests
```

Root `pnpm test` uses `--if-present`, so a package without a `test` script is
skipped silently rather than failing.

## Layout

Every package with tests has the same three pieces:

```
<package>/
├── src/                   # built into dist/
├── test/
│   ├── *.test.ts
│   └── fixtures/*.mjs     # real plugin modules, loaded for real
├── vitest.config.ts
└── tsconfig.test.json
```

Tests live in `test/` rather than beside the source because the build
`tsconfig.json` includes only `src/**/*`. They are therefore excluded from
`dist/` without any extra configuration.

| File | Covers |
| --- | --- |
| [`args.test.ts`](../packages/cli/test/args.test.ts) | Coercion, defaults, required, repeatables, `--`, unknown flags, alias/collision rules |
| [`plugins.test.ts`](../packages/cli/test/plugins.test.ts) | Plugin loading, every rejection path, and the parse phase's result check |
| [`generate.test.ts`](../packages/cli/test/generate.test.ts) | `generate` end to end, option routing, the parse phase, `--help` |
| [`store.test.ts`](../packages/cli/test/store.test.ts) | `store` end to end, reading and validating the report file, `--help` |
| [`commands.test.ts`](../packages/cli/test/commands.test.ts) | Command registry and help rendering |
| [`core/test/results.test.ts`](../packages/core/test/results.test.ts) | `ok`, `invalid`, `isOptionIssue`, `isOptionsResult` |
| [`core/test/reports.test.ts`](../packages/core/test/reports.test.ts) | `isReport`, and narrowing a backend with `canStore` / `canFetch` |
| [`host/test/plugins.test.ts`](../packages/host/test/plugins.test.ts) | Resolution order, every rejection path, per-host capability checks |
| [`storage-filesystem/test/store.test.ts`](../plugins/storage-filesystem/test/store.test.ts) | Both phases of the filesystem storage plugin |
| [`storage-filesystem/test/fetch.test.ts`](../plugins/storage-filesystem/test/fetch.test.ts) | Reading a report back, misses, and containment |
| [`viewer/test/config.test.ts`](../packages/viewer/test/config.test.ts) | Discovery, precedence, validation messages, option collection |
| [`viewer/test/registry.test.ts`](../packages/viewer/test/registry.test.ts) | Plugin loading and the parse phase, all before the server listens |
| [`viewer/test/server.test.ts`](../packages/viewer/test/server.test.ts) | Every route, status code and error body |
| [`viewer/test/static.test.ts`](../packages/viewer/test/static.test.ts) | Serving the client, the SPA fallback, traversal, `basePath` |
| [`viewer/test/tls.test.ts`](../packages/viewer/test/tls.test.ts) | HTTPS, including a live request against a generated certificate |
| [`viewer/test/cli.test.ts`](../packages/viewer/test/cli.test.ts) | `orion-viewer` flags, `--help`, exit codes |
| [`viewer/test/e2e.test.ts`](../packages/viewer/test/e2e.test.ts) | A report's full round trip: stored by the real filesystem plugin, fetched back over HTTP |

## Fixtures are real modules

Fixtures under `test/fixtures/` are genuine `.mjs` plugin packages, not mocks,
so the dynamic-import and validation path in
[`host/src/plugins.ts`](../packages/host/src/plugins.ts) is exercised as it runs
in production. They record their invocations on `globalThis.__orionCalls`, which
tests reset in `beforeEach`, so assertions can check exactly what each plugin
received.

Fixtures for failure cases (wrong role, missing method, non-plugin export, a
bundle that was never built) are deliberately invalid — do not "fix" them.

The viewer's fixtures also include a `client/` directory standing in for a Vite
build, so the static handler is testable without anyone having run one.

## Testing the server

Viewer tests start a real server on port `0`, so the kernel assigns a free port
and parallel runs never collide. `viewer.url` reports the port actually bound.
Each test passes `config: false` so a stray `orion-viewer.config.js` in the
working directory can never leak in, and closes the server in `afterEach` —
`close()` drops keep-alive connections, which would otherwise hold the suite
open.

The TLS tests shell out to `openssl` for a throwaway certificate rather than
committing key material, since Node has no built-in way to issue one.

## Typechecking tests

`vitest` strips types without checking them, and `tsc --build` never sees
`test/`. **Type errors in tests will not fail `pnpm test`.**
[`tsconfig.test.json`](../packages/cli/tsconfig.test.json) closes that gap and
is run by `test:types`. Run it before pushing, or wire it into CI — it is not
part of `pnpm test` today.

It sets `composite: false` and `declaration: false` because a composite project
may not disable emit.

The viewer's browser client is a **third** typecheck entry point: `.vue` files
need `vue-tsc`, and `client/tsconfig.json` sits outside the base config with its
own DOM lib and bundler resolution. Neither `pnpm typecheck` nor `test:types`
covers it.

```sh
pnpm --filter @orion/viewer test:types:client
```

## Conventions

- One `describe` per exported function or command, nested `describe` for a
  distinct scenario.
- Test names state the behaviour, not the function
  (`"rejects both being given at once"`).
- Assert on observable output — returned values, exit codes, captured
  stdout/stderr — rather than internals.
- `generate` writes through `process.stdout.write`; tests capture it with
  `vi.spyOn` and restore in `afterEach`.
