// Declares a required option, to exercise the parse phase at startup.
export default {
  kind: "storage",
  name: "needs-path",
  options: [{ name: "path", type: "string", description: "Where reports live", required: true }],
  parseOptions(values) {
    return { ok: true, options: { ...values } };
  },
  async fetch() {
    return undefined;
  },
};
