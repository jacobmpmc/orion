// Always rejects its options.
export default {
  kind: "storage",
  name: "picky-storage",
  options: [{ name: "region", type: "string", description: "Target region" }],
  parseOptions() {
    return { ok: false, issues: [{ option: "region", message: "is not a known region." }] };
  },
  async store(context) {
    (globalThis.__orionCalls ??= []).push({ role: "storage", context });
    return { id: "picky-001" };
  },
};
