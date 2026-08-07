// Implements the role method, but not the option parse phase.
export default {
  kind: "reporter",
  name: "no-parse-reporter",
  async generate() {
    return { kind: "no-parse", version: 1, generatedAt: "2026-08-06T00:00:00.000Z", data: null };
  },
};
