# Workspace

Configured in [`pnpm-workspace.yaml`](../pnpm-workspace.yaml).

```
orion/
├── packages/       # libraries and the CLI
│   ├── core/       # @orion/core  — shared contracts
│   └── cli/        # @orion/cli   — the orion binary
├── plugins/        # base plugin packages (storage-filesystem so far)
├── docs/
└── .vscode/
```

Both `packages/*` and `plugins/*` are workspace globs, so anything dropped into
either directory with a `package.json` becomes a workspace project on the next
`pnpm install`.

## Version catalog

Shared dependency versions live in one place — the `catalog:` block of
`pnpm-workspace.yaml`:

```yaml
catalog:
  "@types/node": ^22.13.0
  typescript: ^5.7.0
  vitest: ^4.1.10
```

Packages reference an entry with the `catalog:` protocol instead of a literal
range:

```json
"devDependencies": { "typescript": "catalog:" }
```

Every package then provably resolves to the same build, and an upgrade is a
one-line change. The lockfile records the resolution once under
`catalogs.default`.

Add a shared dependency by putting the version in the catalog first, then
referencing `catalog:` from each package that needs it. The catalog fixes
*versions*, not *presence* — each package still declares what it uses.

## Release-age policy

```yaml
minimumReleaseAge: 10080   # minutes = 7 days
```

pnpm will not resolve a package version published within the last week. This
blunts supply-chain attacks that rely on a compromised release being installed
before it is caught and yanked.

Consequences:

- Freshly published versions are invisible to the resolver. A dependency that
  seems to be "stuck" one version behind is usually this, working as intended.
- A genuinely urgent version can be exempted via `minimumReleaseAgeExclude`,
  which is present but commented out in the workspace file.
- `pnpm install` prints `Lockfile passes supply-chain policies` when the policy
  is satisfied.

Note that a package can also lag simply because a manifest's range caps it —
check the range before assuming the policy is responsible.

## Other install settings

[`.npmrc`](../.npmrc):

- `engine-strict=true` — a Node version outside `engines` fails the install.
- `hoist=false` — no hoisting, so a package can only import what it declares.
  Phantom dependencies fail loudly instead of working by accident.

## Adding a package

1. Create the directory under `packages/` or `plugins/` with a `package.json`
   (`private: true`, `type: "module"`) and a `tsconfig.json` extending
   [`tsconfig.base.json`](../tsconfig.base.json).
2. Use `workspace:*` for internal dependencies and `catalog:` for shared tooling.
3. **Add a project reference to the root [`tsconfig.json`](../tsconfig.json)** —
   `tsc --build` ignores packages it has no reference to, so a package missing
   from that list silently never compiles.
4. Run `pnpm install` to link it.

## Binaries

pnpm only links a workspace package's `bin` when something depends on it. The
root `package.json` depends on `@orion/cli` for exactly this reason, which is
what makes `pnpm exec orion` work. A new CLI package needs the same treatment.

The bin points at `dist/`, so the package must be built before its binary runs.
