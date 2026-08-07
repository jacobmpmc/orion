// A reporter, which the viewer must never accept: a pipeline's generation-side
// code has no business in the viewer image.
export default {
  kind: "reporter",
  name: "fixture-reporter",
  parseOptions() {
    return { ok: true, options: {} };
  },
  async generate() {
    return { kind: "fixture", version: 1, generatedAt: "2026-08-07T00:00:00.000Z", data: null };
  },
};
