# @orion/viewer

The deployable half of Orion: a server that reads reports back out of storage
and a browser app that renders them with viewer plugins. It never generates or
stores anything.

Full documentation is in [`docs/viewer.md`](../../docs/viewer.md).

```sh
pnpm build              # tsc, then the client's Vite build
pnpm exec orion-viewer  # reads orion-viewer.config.js from the cwd
```

Developing on the client, three terminals — then open Vite's URL, which proxies
`/api` and `/plugins` through to the server:

```sh
pnpm --filter @orion/viewer dev          # tsc watch → dist/
pnpm --filter @orion/viewer dev:server   # node --watch dist/bin.js
pnpm --filter @orion/viewer dev:client   # vite, with HMR
```

## Layout

```
src/          the server, built with tsc into dist/
  config/     the config file, flags and module arguments, settled into one shape
  http/       the router, routes and static handler
  registry.ts loads plugins and runs their parse phase, before anything listens
  server.ts   createServer / startServer, HTTP or HTTPS
  cli.ts      the orion-viewer flags; bin.ts is a six-line shell around it
client/       the Vue app, built with Vite into dist/client/
```

The two builds are independent, and the server never imports anything from
`client/`. That is why `client/tsconfig.json` can have a DOM lib and bundler
resolution while everything else in the repo stays on NodeNext, and why the
server runs — API and all — before anyone has run a browser build. Without
`dist/client` it serves 503 for pages and keeps answering `/api`.

Vue and Vite are `devDependencies` for the same reason. At runtime this package
depends on `@orion/core`, `@orion/host` and the Node standard library.

## As a module

```ts
import { startServer } from "@orion/viewer";

const viewer = await startServer({ config: false, port: 0, connections: [...] });
console.log(viewer.url);
await viewer.close();
```
