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
 * `.ocp` and every class is `ocp-` prefixed. A bare element selector here would
 * restyle the host app -- and, worse than for most plugins, it would restyle the
 * child reports rendered inside this one. Nothing here reaches into `.ocp-body`.
 *
 * Colours come entirely from the viewer's theme tokens (documented in
 * docs/viewer.md). The fallbacks are for a host that predates them, not a
 * second opinion about what "failed" looks like.
 */
export const CSS = `
.ocp { color: var(--fg, #1c1c22); }
.ocp-title { font-size: 1.1rem; margin: 0; }
.ocp-meta { color: var(--muted, #6a6a78); font-size: 0.85rem; margin: 0.35rem 0 0; }

.ocp-notice {
  border-left: 3px solid var(--warn, #9a6700); padding: 0.5rem 0.75rem;
  margin: 0 0 1rem; font-size: 0.9rem;
}

.ocp-entry {
  border: 1px solid var(--line, #d8d8e0); border-radius: 6px;
  margin: 0.75rem 0; padding: 0;
}
.ocp-entry > summary {
  cursor: pointer; padding: 0.55rem 0.75rem; display: flex;
  flex-wrap: wrap; gap: 0.75rem; align-items: baseline;
}
.ocp-name { font-weight: 600; }
.ocp-entry > summary .ocp-meta { margin: 0; }
.ocp-description { color: var(--muted, #6a6a78); font-size: 0.9rem; margin: 0 0.75rem; }

/* The child report's own element. Padding and a rule to separate it from the
   header, and nothing else: everything inside belongs to another plugin. */
.ocp-body {
  border-top: 1px solid var(--line, #d8d8e0);
  padding: 0.75rem;
}

.ocp-empty { color: var(--muted, #6a6a78); font-style: italic; }
`;
