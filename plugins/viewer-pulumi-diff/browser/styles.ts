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
 * `.opd` and every class is `opd-` prefixed. A bare element selector here would
 * restyle the host app.
 *
 * Colours come entirely from the viewer's theme tokens (documented in
 * docs/viewer.md). The fallbacks are for a host that predates them, not a
 * second opinion about what "delete" looks like.
 */
export const CSS = `
.opd { color: var(--fg, #1c1c22); }
.opd-bar { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.75rem; }
.opd-chip { display: inline-flex; gap: 0.35rem; align-items: baseline; }
.opd-chip b { font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.opd-tone-ok { color: var(--ok, #1a7f37); }
.opd-tone-danger { color: var(--danger, #cf222e); }
.opd-tone-warn { color: var(--warn, #9a6700); }
.opd-tone-muted { color: var(--muted, #6a6a78); }
.opd-meta { color: var(--muted, #6a6a78); font-size: 0.85rem; margin: 0.35rem 0 0; }

.opd-controls { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; margin: 1rem 0; }
.opd-controls input[type="search"] {
  flex: 1 1 16rem; min-width: 0; padding: 0.4rem 0.6rem; font: inherit;
  color: inherit; background: var(--bg, #fff);
  border: 1px solid var(--line, #d8d8e0); border-radius: 6px;
}
.opd-toggle { display: inline-flex; gap: 0.4rem; align-items: center; white-space: nowrap; }
.opd-expand-all {
  flex: none; padding: 0.4rem 0.7rem; font: inherit; font-size: 0.9rem;
  color: inherit; background: var(--bg, #fff); cursor: pointer;
  border: 1px solid var(--line, #d8d8e0); border-radius: 6px; white-space: nowrap;
  /* Wide enough for the longer of the two labels, so the row does not shift
     under the pointer as the button relabels itself. */
  min-width: 7rem;
}
.opd-expand-all:hover { border-color: var(--accent, #3b5bdb); color: var(--accent, #3b5bdb); }

.opd-notice {
  border-left: 3px solid var(--warn, #9a6700); padding: 0.5rem 0.75rem;
  margin: 0 0 1rem; font-size: 0.9rem;
}

.opd h2 { font-size: 1rem; margin: 1.5rem 0 0.5rem; }

.opd-diagnostics { list-style: none; margin: 0; padding: 0; }
.opd-diagnostic {
  border-left: 3px solid currentColor; padding: 0.35rem 0.75rem; margin: 0 0 0.4rem;
  font-size: 0.9rem;
}
.opd-diagnostic p { margin: 0; color: var(--fg, #1c1c22); }
.opd-diagnostic .opd-urn { color: var(--muted, #6a6a78); font-size: 0.8rem; }

.opd-resource { border-top: 1px solid var(--line, #d8d8e0); }
.opd-resource[hidden] { display: none; }
.opd-resource > summary {
  cursor: pointer; padding: 0.45rem 0.2rem; display: flex;
  flex-wrap: wrap; gap: 0.6rem; align-items: baseline;
}
.opd-badge {
  flex: none; min-width: 5.5rem; text-align: center; padding: 0.1rem 0.45rem;
  border: 1px solid currentColor; border-radius: 999px;
  font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em;
}
.opd-type { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; color: var(--muted, #6a6a78); }
.opd-name { flex: 1 1 auto; min-width: 0; font-weight: 600; }
.opd-count { color: var(--muted, #6a6a78); font-size: 0.85rem; font-variant-numeric: tabular-nums; }

.opd-body { padding: 0 0 0.8rem 0.4rem; }
.opd-urn {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem;
  color: var(--muted, #6a6a78); overflow-wrap: anywhere; margin: 0 0 0.5rem;
}
.opd-scroll { overflow-x: auto; }
.opd-changes { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
.opd-changes th {
  text-align: left; font-weight: 600; color: var(--muted, #6a6a78);
  border-bottom: 1px solid var(--line, #d8d8e0); padding: 0.25rem 0.5rem;
}
.opd-changes td { vertical-align: top; padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--line, #d8d8e0); }
.opd-sign { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; }
.opd-path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.opd-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap;
  overflow-wrap: anywhere; margin: 0; max-width: 28rem;
}
.opd-before { color: var(--danger, #cf222e); }
.opd-after { color: var(--ok, #1a7f37); }
.opd-forces { color: var(--danger, #cf222e); font-size: 0.75rem; white-space: nowrap; }

.opd-empty { color: var(--muted, #6a6a78); font-style: italic; }
`;
