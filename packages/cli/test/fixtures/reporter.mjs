export default {
  kind: "reporter",
  name: "fixture-reporter",
  options: [
    { name: "token", type: "string", description: "Reporter auth token", required: true },
    { name: "tag", type: "string", description: "Tag to attach", multiple: true },
    { name: "depth", type: "number", description: "Traversal depth", default: 3 },
    { name: "verbose", type: "boolean", description: "Chatty output" },
  ],
  parseOptions(values) {
    return { ok: true, options: { ...values } };
  },
  async generate(context) {
    (globalThis.__orionCalls ??= []).push({ role: "reporter", context });
    return {
      kind: "fixture",
      version: 1,
      generatedAt: "2026-08-06T00:00:00.000Z",
      data: { patterns: context.patterns },
    };
  },
};
