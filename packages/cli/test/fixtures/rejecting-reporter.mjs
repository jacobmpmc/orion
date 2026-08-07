// Always rejects its options: one issue tied to a flag, one that is not.
export default {
  kind: "reporter",
  name: "picky-reporter",
  options: [{ name: "since", type: "string", description: "Lower bound" }],
  parseOptions() {
    return {
      ok: false,
      issues: [
        { option: "since", message: "must be an ISO-8601 date." },
        { message: "needs either --since or a positional." },
      ],
    };
  },
  async generate(context) {
    (globalThis.__orionCalls ??= []).push({ role: "reporter", context });
    return { kind: "picky", version: 1, generatedAt: "2026-08-06T00:00:00.000Z", data: null };
  },
};
