// Returns something that is not an OptionsResult.
export default {
  kind: "reporter",
  name: "confused-reporter",
  parseOptions() {
    return { options: { fine: true } };
  },
  async generate() {
    return { kind: "confused", version: 1, generatedAt: "2026-08-06T00:00:00.000Z", data: null };
  },
};
