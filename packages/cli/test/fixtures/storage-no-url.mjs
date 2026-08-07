export default {
  kind: "storage",
  name: "fixture-storage-no-url",
  options: [],
  parseOptions() {
    return { ok: true, options: {} };
  },
  async store() {
    return { id: "no-url-001" };
  },
};
