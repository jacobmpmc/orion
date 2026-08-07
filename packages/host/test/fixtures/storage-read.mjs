// A read-only backend: implements fetch() but not store().
export default {
  kind: "storage",
  name: "read-only-storage",
  parseOptions(values) {
    return { ok: true, options: { ...values } };
  },
  async fetch({ id }) {
    return { kind: "fixture", version: 1, generatedAt: "2026-08-07T00:00:00.000Z", data: { id } };
  },
};
