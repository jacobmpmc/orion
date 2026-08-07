// A viewer plugin, which has no role method at all -- only data.
export const viewer = {
  kind: "viewer",
  name: "fixture-viewer",
  reports: ["fixture"],
  bundle: new URL("./browser-bundle.mjs", import.meta.url).href,
  parseOptions() {
    return { ok: true, options: {} };
  },
};
