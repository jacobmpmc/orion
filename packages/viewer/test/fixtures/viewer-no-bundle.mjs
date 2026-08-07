// Deliberately invalid: declares no browser bundle.
export default {
  kind: "viewer",
  name: "no-bundle-viewer",
  reports: ["fixture"],
  parseOptions() {
    return { ok: true, options: {} };
  },
};
