// Deliberately invalid: declares a bundle but no report kinds to dispatch on.
export default {
  kind: "viewer",
  name: "no-reports-viewer",
  reports: [],
  bundle: new URL("./browser-bundle.mjs", import.meta.url).href,
  parseOptions() {
    return { ok: true, options: {} };
  },
};
