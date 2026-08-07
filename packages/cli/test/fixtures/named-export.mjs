// Exposes the plugin via a role-named export rather than a default export.
export const reporter = {
  kind: "reporter",
  name: "named-export-reporter",
  parseOptions() {
    return { ok: true, options: {} };
  },
  async generate() {
    return { kind: "named", version: 1, generatedAt: "2026-08-06T00:00:00.000Z", data: null };
  },
};
