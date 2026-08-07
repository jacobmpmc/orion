// Valid, but cannot be read from -- the viewer must refuse it at startup.
export default {
  kind: "storage",
  name: "write-only-storage",
  parseOptions() {
    return { ok: true, options: {} };
  },
  async store() {
    return { id: "x" };
  },
};
