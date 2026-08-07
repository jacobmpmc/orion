export default {
  kind: "storage",
  name: "fixture-storage",
  options: [
    { name: "token", type: "string", description: "Storage auth token", required: true },
    { name: "bucket", type: "string", description: "Target bucket", required: true },
  ],
  parseOptions(values) {
    return { ok: true, options: { ...values } };
  },
  async store(context) {
    (globalThis.__orionCalls ??= []).push({ role: "storage", context });
    return { id: "fixture-001", url: "https://example.test/r/fixture-001" };
  },
};
