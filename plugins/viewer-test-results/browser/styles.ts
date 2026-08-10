/**
 * The plugin's stylesheet, as a string.
 *
 * A string rather than a `.css` import because the bundle has to be a single
 * file: the viewer serves `/plugins/<id>/bundle.js` and nothing beside it, so
 * an emitted stylesheet would 404. It is injected as a `<style>` inside the
 * plugin's own root element, which also means unmounting takes the styles with
 * it instead of leaving them in `document.head` forever.
 *
 * There is no Shadow DOM, so these rules are global: every one is scoped under
 * `.otr` and every class is `otr-` prefixed. A bare element selector here would
 * restyle the host app.
 *
 * Colours come entirely from the viewer's theme tokens (documented in
 * docs/viewer.md). The fallbacks are for a host that predates them, not a
 * second opinion about what "failed" looks like.
 */
export const CSS = `
.otr { color: var(--fg, #1c1c22); }
.otr-bar { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.75rem; }
.otr-chip { display: inline-flex; gap: 0.35rem; align-items: baseline; }
.otr-chip b { font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.otr-tone-ok { color: var(--ok, #1a7f37); }
.otr-tone-danger { color: var(--danger, #cf222e); }
.otr-tone-warn { color: var(--warn, #9a6700); }
.otr-tone-muted { color: var(--muted, #6a6a78); }
.otr-meta { color: var(--muted, #6a6a78); font-size: 0.85rem; margin: 0.35rem 0 0; }

.otr-controls { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; margin: 1rem 0; }
.otr-controls input[type="search"] {
  flex: 1 1 16rem; min-width: 0; padding: 0.4rem 0.6rem; font: inherit;
  color: inherit; background: var(--bg, #fff);
  border: 1px solid var(--line, #d8d8e0); border-radius: 6px;
}
.otr-toggle { display: inline-flex; gap: 0.4rem; align-items: center; white-space: nowrap; }

.otr-notice {
  border-left: 3px solid var(--warn, #9a6700); padding: 0.5rem 0.75rem;
  margin: 0 0 1rem; font-size: 0.9rem;
}

.otr h2 { font-size: 1rem; margin: 1.5rem 0 0.5rem; }

.otr-failure {
  border: 1px solid var(--line, #d8d8e0); border-left: 3px solid var(--danger, #cf222e);
  border-radius: 6px; padding: 0.6rem 0.8rem; margin: 0 0 0.6rem;
}
.otr-failure h3 { font-size: 0.95rem; margin: 0; font-weight: 600; }
.otr-failure pre {
  overflow-x: auto; margin: 0.5rem 0 0; padding: 0.5rem;
  background: color-mix(in srgb, var(--muted, #6a6a78) 12%, transparent);
  border-radius: 4px; font-size: 0.8rem; line-height: 1.45;
}

.otr-file { border-top: 1px solid var(--line, #d8d8e0); }
.otr-file > summary {
  cursor: pointer; padding: 0.45rem 0.2rem; display: flex;
  flex-wrap: wrap; gap: 0.6rem; align-items: baseline;
}
.otr-file[hidden] { display: none; }
.otr-path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9rem; }
.otr-cases { list-style: none; margin: 0 0 0.6rem; padding: 0 0 0 1.4rem; }
.otr-case { display: flex; gap: 0.6rem; align-items: baseline; padding: 0.15rem 0; }
.otr-case[hidden] { display: none; }
.otr-dot { flex: none; width: 0.55rem; height: 0.55rem; border-radius: 50%; background: currentColor; }
.otr-name { flex: 1 1 auto; min-width: 0; }
.otr-suite { color: var(--muted, #6a6a78); }
.otr-duration { color: var(--muted, #6a6a78); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
.otr-empty { color: var(--muted, #6a6a78); font-style: italic; }
`;
