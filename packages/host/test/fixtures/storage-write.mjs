// A write-only backend: implements store() but not fetch().
export default {
  kind: "storage",
  name: "write-only-storage",
  parseOptions(values) {
    return { ok: true, options: { ...values } };
  },
  async store() {
    return { id: "fixture-001" };
  },
};
