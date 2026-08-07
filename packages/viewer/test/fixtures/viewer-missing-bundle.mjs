// Deliberately invalid: points at a bundle that was never built.
export default {
  kind: "viewer",
  name: "unbuilt-viewer",
  reports: ["fixture"],
  bundle: new URL("./dist/never-built.js", import.meta.url).href,
  parseOptions() {
    return { ok: true, options: {} };
  },
};
