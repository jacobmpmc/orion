// Always rejects its options, so a test can see a plugin's own issues surface.
export default {
  kind: "storage",
  name: "rejecting-storage",
  options: [{ name: "region", type: "string", description: "Region" }],
  parseOptions() {
    return { ok: false, issues: [{ option: "region", message: "must name a known region." }] };
  },
  async fetch() {
    return undefined;
  },
};
