// A read-only backend that records every fetch, so tests can assert on exactly
// what the router routed to it.
export default {
  kind: "storage",
  name: "fixture-storage",
  options: [{ name: "label", type: "string", description: "Ignored, for option tests" }],
  parseOptions(values) {
    return { ok: true, options: { ...values } };
  },
  async fetch({ id, options }) {
    (globalThis.__orionCalls ??= []).push({ role: "storage", id, options });

    if (id === "missing.json") return undefined;
    if (id === "not-a-report.json") return { hello: "world" };
    if (id === "boom.json") throw new Error("bucket orion-secret-prod is unreachable");

    return {
      kind: "fixture",
      version: 1,
      generatedAt: "2026-08-07T09:30:00.000Z",
      data: { id },
    };
  },
};
