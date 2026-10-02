# @orion/plugin-viewer-pulumi-diff

Renders `pulumi-diff` reports in the viewer: a counts bar, the preview's own
diagnostics, and a collapsible list of every resource over a table of the
properties that differ — with a filter and a changes-only toggle.

```js
// orion-viewer.config.js
export default {
  viewers: [{ package: "@orion/plugin-viewer-pulumi-diff" }],
};
```

Nothing to configure. It renders whatever produces the `pulumi-diff` kind — the
[pulumi reporter](../reporter-pulumi-diff) today, anything mapping another
infrastructure tool onto the same schema later, without a change here.

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
`/plugins/pulumi-diff/bundle.js` and nothing beside it, so a second chunk, a
`style.css` or a `.js.map` would 404 rather than load. That is why there are no
CSS files — the stylesheet is a string in [`browser/styles.ts`](browser/styles.ts),
injected as a `<style>` inside the plugin's own root, which also means unmount
takes the styles with it.

No framework: it is plain DOM and TypeScript.

## Layout

| Path | What it is |
| --- | --- |
| [`src/index.ts`](src/index.ts) | The `ViewerPlugin` object. The only Node code |
| [`browser/model.ts`](browser/model.ts) | **DOM-free**: the guard, tones, the filter predicate, value formatting |
| [`browser/render.ts`](browser/render.ts) | Element builders |
| [`browser/index.ts`](browser/index.ts) | `mount`, and the filter wiring |

`browser/` sits beside `src/` rather than inside it, because the Node config
compiles `src/**` with NodeNext and no DOM lib. It has its own
[`tsconfig.browser.json`](tsconfig.browser.json) (`pnpm test:types:client`) and
is not in the root tsconfig references.

## How it behaves

The tree is built **once** and filtering only toggles `hidden`. Re-rendering per
keystroke would collapse every resource the reader had opened and drop the caret
out of the search box on every character. The query matches a resource's name,
its type, its URN **or** any changed property path, so typing a provider prefix
narrows to that provider and typing a property name finds everything that
touches it.

Replacements and deletes start expanded — they are what the reader came for.
The changes-only toggle appears only when the report actually carries unchanged
resources; the reporter drops them unless asked to keep them, and a toggle that
can do nothing is worse than no toggle.

**Expand/collapse all** is one button, not two, and it is labelled with the
action it will take rather than the state it is in. It offers to *expand*
whenever anything is still closed — a reader who has opened three resources by
hand and wants the rest is the common case — and only offers to collapse once
everything is open. Opening or closing one resource by hand relabels it.

It acts on the resources the filter is **showing**, not on every resource in the
report: expanding while filtered to one resource must not quietly open forty
others that would then spring into a wall of text the moment the filter cleared.

Three states are told apart deliberately, because collapsing them would mislead:

| State | Rendered as |
| --- | --- |
| The preview recorded no property-level diff | "The preview recorded no property-level diff", or the coarse `diffReasons` if it gave any |
| It recorded one and nothing differed | "No properties differ" |
| Unchanged resources counted but not listed | A note saying how many, and that `--same` includes them |

A redacted secret renders as `(secret)`, a value the preview could not compute
as `(known after apply)`, and a truncated value admits what it
dropped — a reader who cannot tell a shortened value from a real one will make
the wrong call about the diff.

Data that is not this schema renders a plain notice rather than throwing: a
throw would surface as the host's generic *"failed to render this report"*,
which says less. A report from a newer schema version renders with a banner
saying detail may be missing.

## Two things not to break

**`innerHTML` is never used.** A property value is arbitrary infrastructure
input — a policy document, a user-data script, whatever the program produced;
every string from the report reaches the DOM as `textContent` or via
`append(string)`. Rendering a report from CI as markup would be a
script-injection hole.

**Colours come from the viewer's theme tokens** — `--ok`, `--danger`, `--warn`,
`--muted`, documented in [`docs/viewer.md`](../../docs/viewer.md). Create is
`--ok`, update is `--warn`, and anything that destroys a resource — a delete, or
the delete half of a replacement — is `--danger`, which is the same three
meanings a test report's passed/todo/failed carries. There is no Shadow DOM, so
every rule is nested under `.opd` with `opd-`-prefixed classes: a bare element
selector here would restyle the host app.

## Tests

The DOM-free model is unit tested under Node; `tsconfig.test.json` includes
`browser/model.ts` and nothing else from `browser/`, so a DOM reference added to
it fails the typecheck. jsdom is deliberately not a dependency, matching
[`viewer-test-results`](../viewer-test-results); the DOM wiring is verified by
running the built bundle in a real browser instead — `pnpm run pulumi-report`
then `pnpm serve` from [`playground/`](../../playground).
