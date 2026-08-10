// A reporter that hands back a frozen report, and keeps a reference to it.
// Enriching with metadata must copy rather than assign, or this plugin's own
// object changes underneath it -- and in strict mode, throws.
export default {
  kind: "reporter",
  name: "frozen-reporter",
  options: [],
  parseOptions() {
    return { ok: true, options: {} };
  },
  async generate(context) {
    const report = Object.freeze({
      kind: "fixture",
      version: 1,
      generatedAt: "2026-08-06T00:00:00.000Z",
      data: { patterns: context.patterns },
    });
    (globalThis.__orionCalls ??= []).push({ role: "reporter", context, report });
    return report;
  },
};
