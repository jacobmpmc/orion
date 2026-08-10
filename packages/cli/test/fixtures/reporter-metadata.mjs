// A reporter that sets metadata namespaces of its own. The CLI's collected
// namespaces replace the ones it also collects; anything else it wrote survives.
export default {
  kind: "reporter",
  name: "metadata-reporter",
  options: [],
  parseOptions() {
    return { ok: true, options: {} };
  },
  async generate(context) {
    (globalThis.__orionCalls ??= []).push({ role: "reporter", context });
    return {
      kind: "fixture",
      version: 1,
      generatedAt: "2026-08-06T00:00:00.000Z",
      metadata: {
        collectedAt: "1999-01-01T00:00:00.000Z",
        custom: { origin: "reporter" },
        fixture: { note: "kept" },
      },
      data: { patterns: context.patterns },
    };
  },
};
