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
│   └── fixtures/*.mjs     # @orion/cli only: real plugin modules, loaded for real
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
| [`commands.test.ts`](../packages/cli/test/commands.test.ts) | Command registry and help rendering |
| [`core/test/results.test.ts`](../packages/core/test/results.test.ts) | `ok`, `invalid`, `isOptionIssue`, `isOptionsResult` |
| [`storage-filesystem/test/store.test.ts`](../plugins/storage-filesystem/test/store.test.ts) | Both phases of the filesystem storage plugin |

## Fixtures are real modules

Fixtures under `test/fixtures/` are genuine `.mjs` plugin packages, not mocks,
so the dynamic-import and validation path in
[`src/plugins.ts`](../packages/cli/src/plugins.ts) is exercised as it runs in
production. They record their invocations on `globalThis.__orionCalls`, which
tests reset in `beforeEach`, so assertions can check exactly what each plugin
received.

Fixtures for failure cases (wrong role, missing method, non-plugin export) are
deliberately invalid — do not "fix" them.

## Typechecking tests

`vitest` strips types without checking them, and `tsc --build` never sees
`test/`. **Type errors in tests will not fail `pnpm test`.**
[`tsconfig.test.json`](../packages/cli/tsconfig.test.json) closes that gap and
is run by `test:types`. Run it before pushing, or wire it into CI — it is not
part of `pnpm test` today.

It sets `composite: false` and `declaration: false` because a composite project
may not disable emit.

## Conventions

- One `describe` per exported function or command, nested `describe` for a
  distinct scenario.
- Test names state the behaviour, not the function
  (`"rejects both being given at once"`).
- Assert on observable output — returned values, exit codes, captured
  stdout/stderr — rather than internals.
- `generate` writes through `process.stdout.write`; tests capture it with
  `vi.spyOn` and restore in `afterEach`.
