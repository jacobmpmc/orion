export default {
  kind: "viewer",
  name: "fixture-viewer",
  reports: ["fixture"],
  bundle: new URL("./browser-bundle.mjs", import.meta.url).href,
  parseOptions() {
    return { ok: true, options: {} };
  },
};
