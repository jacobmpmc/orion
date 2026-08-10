# @orion/plugin-viewer-test-results

Renders `test-results` reports in the viewer: a counts bar, the failures with
their stack traces, and a collapsible list of every file and test — with a name
filter and a failed-only toggle over both.

```js
// orion-viewer.config.js
export default {
  viewers: [{ package: "@orion/plugin-viewer-test-results" }],
};
```

Nothing to configure. It renders whatever produces the `test-results` kind — the
[vitest reporter](../reporter-vitest) today, a jest or playwright one later
without a change here.

## Two builds

Like any viewer plugin, this is two halves:

| Half | Built by | Output |
| --- | --- | --- |
| The plugin object the server imports | `pnpm build` (`tsc`) | `dist/index.js` |
| The browser module the server serves | `pnpm build:client` (`vite`) | `dist/browser/index.js` |

`pnpm build` **from the repo root** runs both — the script names `build:client`
and `clean:client` are what the root scripts look for. `tsc --build` alone
leaves `dist/browser` missing, and the viewer then refuses to start with *"Has
the plugin been built?"*, because it stats the bundle at startup rather than at
the first request.

The bundle is one self-contained ES module. The viewer serves exactly
`/plugins/test-results/bundle.js` and nothing beside it, so a second chunk, a
`style.css` or a `.js.map` would 404 rather than load. That is why there are no
CSS files — the stylesheet is a string in [`browser/styles.ts`](browser/styles.ts),
injected as a `<style>` inside the plugin's own root, which also means unmount
takes the styles with it.

No framework: it is plain DOM and TypeScript, and the whole bundle is under
10 kB. The mount contract is DOM-only precisely so a plugin need not match the
host app's framework, and inlining a second copy of Vue into every plugin is a
poor way to spend a page load.

## Layout

| Path | What it is |
| --- | --- |
| [`src/index.ts`](src/index.ts) | The `ViewerPlugin` object. The only Node code |
| [`browser/model.ts`](browser/model.ts) | **DOM-free**: the guard, the filter predicate, formatting |
| [`browser/render.ts`](browser/render.ts) | Element builders |
| [`browser/index.ts`](browser/index.ts) | `mount`, and the filter wiring |

`browser/` sits beside `src/` rather than inside it, because the Node config
compiles `src/**` with NodeNext and no DOM lib. It has its own
[`tsconfig.browser.json`](tsconfig.browser.json) (`pnpm test:types:client`) and
is not in the root tsconfig references.

## How it behaves

The tree is built **once** and filtering only toggles `hidden`. Re-rendering per
keystroke would be simpler to write and worse to use: it would collapse every
file the reader had opened and drop the caret out of the search box on every
character. A file whose tests are all filtered out hides too, so the list never
becomes a column of empty headings; a file that failed to load has no tests to
match on and is filtered by its own path instead.

The query matches a test's full name **or** its file path, so typing part of a
filename narrows to that file. Failing files start expanded — that is what the
reader came for.

Data that is not this schema renders a plain notice rather than throwing: a
throw would surface as the host's generic *"failed to render this report"*,
which says less. A report from a newer schema version renders with a banner
saying detail may be missing.

## Two things not to break

**`innerHTML` is never used.** Failure messages are stack traces containing
arbitrary source from whoever's tests these are; every string from the report
reaches the DOM as `textContent` or via `append(string)`. Rendering a report
from CI as markup would be a script-injection hole.

**Colours come from the viewer's theme tokens** — `--ok`, `--danger`, `--warn`,
`--muted`, documented in [`docs/viewer.md`](../../docs/viewer.md). This plugin
holds no colour opinion of its own; the literals in the stylesheet are fallbacks
for a host predating the tokens. There is no Shadow DOM, so every rule is nested
under `.otr` with `otr-`-prefixed classes: a bare element selector here would
restyle the host app.

## Tests

The DOM-free model is unit tested under Node; `tsconfig.test.json` includes
`browser/model.ts` and nothing else from `browser/`, so a DOM reference added to
it fails the typecheck. jsdom is deliberately not a dependency — it would be
heavyweight, subject to the workspace's release-age policy, and would mostly
cover `append` calls. The DOM wiring is verified by running the built bundle in
a real browser instead; see the walkthrough in
[`playground/README.md`](../../playground/README.md).
