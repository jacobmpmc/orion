# Testing

[Vitest](https://vitest.dev) powers the tests. Every package has them —
`@orion/core` covers its result helpers and option readers, which are the only
runtime code it carries.

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
| [`core/test/values.test.ts`](../packages/core/test/values.test.ts) | The option readers, including values a config file can supply uncoerced |
| [`host/test/plugins.test.ts`](../packages/host/test/plugins.test.ts) | Resolution order, every rejection path, per-host capability checks |
| [`plugin-toolkit/test/inputs.test.ts`](../packages/plugin-toolkit/test/inputs.test.ts) | Literal paths vs globs, dedupe, ordering, matching nothing |
| [`plugin-toolkit/test/files.test.ts`](../packages/plugin-toolkit/test/files.test.ts) | `readJsonFile`, its two distinct failures, and the BOM |
| [`plugin-toolkit/test/paths.test.ts`](../packages/plugin-toolkit/test/paths.test.ts) | Separator normalisation, relativising, containment |
| [`report-test-results/test/guard.test.ts`](../packages/report-test-results/test/guard.test.ts) | `isTestResults` against every missing and mistyped field |
| [`report-composite/test/guard.test.ts`](../packages/report-composite/test/guard.test.ts) | `isComposite`: inline entries, refs, and every way one entry can be malformed |
| [`reporter-vitest/test/options.test.ts`](../plugins/reporter-vitest/test/options.test.ts) | The parse phase and each issue it reports |
| [`reporter-vitest/test/map.test.ts`](../plugins/reporter-vitest/test/map.test.ts) | Status folding, recomputed totals, relativising, merging shards, and a real captured run |
| [`reporter-vitest/test/generate.test.ts`](../plugins/reporter-vitest/test/generate.test.ts) | The envelope, glob expansion, and every read failure |
| [`reporter-composite/test/options.test.ts`](../plugins/reporter-composite/test/options.test.ts) | The parse phase: titles, and one issue per malformed `--ref` |
| [`reporter-composite/test/generate.test.ts`](../plugins/reporter-composite/test/generate.test.ts) | The envelope, embedding, entry titles, refs appended last, every read failure |
| [`viewer-test-results/test/model.test.ts`](../plugins/viewer-test-results/test/model.test.ts) | The guard, the filter predicate, formatting, the summary |
| [`viewer-test-results/test/plugin.test.ts`](../plugins/viewer-test-results/test/plugin.test.ts) | The plugin object, and that `bundle` resolves beside its own module |
| [`viewer-composite/test/model.test.ts`](../plugins/viewer-composite/test/model.test.ts) | The guard, what an entry renders as, and what is knowable before a ref is fetched |
| [`viewer-composite/test/plugin.test.ts`](../plugins/viewer-composite/test/plugin.test.ts) | The plugin object, and that `bundle` resolves beside its own module |
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

`plugins/reporter-vitest/test/fixtures/` is the exception: those are **JSON data
files**, not modules — the input the plugin reads. `real-run.json` is captured
from an actual vitest run, because the surest way for that plugin to break is a
hand-written fixture drifting from what vitest emits; its README gives the
command to recapture it. The hand-written ones alongside carry what a green run
never produces: failures, `todo`, a collection error, and a status from a future
vitest. They use `/repo/…` paths so the relativisation assertions hold on
Windows and POSIX alike.

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

Browser sources are a **third** typecheck entry point, covered by neither
`pnpm typecheck` nor `test:types`: they sit outside the base config with their
own DOM lib and bundler resolution. Three packages have them now — the viewer's
`.vue` client, which needs `vue-tsc`, and the two viewer plugins, which are
plain `.ts` and so need only `tsc`.

```sh
pnpm -r --if-present test:types:client
```

## Testing a browser bundle

A viewer plugin's DOM code is deliberately **not** unit tested. jsdom is not a
dependency — it is heavyweight, a new catalog entry is subject to the
release-age policy, and it would mostly cover `append` calls.

Instead the logic worth testing is pushed into a DOM-free module
(`browser/model.ts`) that runs under Node like anything else, and the package's
`tsconfig.test.json` includes that one file from `browser/` so a DOM reference
added to it fails the typecheck rather than quietly making the tests unrunnable.

The wiring around it — mounting, filtering, unmounting, and that report text
never becomes markup — is verified by loading the built bundle in a real
browser. [`playground/README.md`](../playground/README.md) has the walkthrough.

The viewer's own client is untested for the same reason, including the nested
rendering in `client/src/render/mountReport.ts`: it is `import()`, `fetch` and
DOM, none of which a node environment has. The composite report in the
playground is the check — it exercises a renderable child, an unrenderable one,
a fetched ref, a broken ref and the depth cap in one page.

## Conventions

- One `describe` per exported function or command, nested `describe` for a
  distinct scenario.
- Test names state the behaviour, not the function
  (`"rejects both being given at once"`).
- Assert on observable output — returned values, exit codes, captured
  stdout/stderr — rather than internals.
- `generate` writes through `process.stdout.write`; tests capture it with
  `vi.spyOn` and restore in `afterEach`.
