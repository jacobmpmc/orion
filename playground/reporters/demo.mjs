/**
 * A stand-in reporter, kept for the one thing a real one cannot show.
 *
 * `@orion/plugin-reporter-vitest` is the reporter to look at now; this is the
 * minimum that satisfies the contract, reading nothing and reporting the
 * patterns it was handed. What earns it its place is the `demo` kind: no viewer
 * plugin claims it, so `pnpm generate` is how you see what a report the viewer
 * has never heard of looks like. Dispatch is per `Report.kind`, and the empty
 * state is a real state worth having seen.
 *
 * It is also the smallest complete example of the plugin contract, in one file
 * with no build step.
 */
export default {
  kind: "reporter",
  name: "demo",

  options: [
    {
      name: "title",
      type: "string",
      description: "Title recorded in the report",
      default: "Demo report",
    },
    {
      name: "changes",
      type: "number",
      description: "How many made-up changes to record",
      default: 3,
    },
  ],

  parseOptions(values) {
    const changes = values["changes"];
    if (typeof changes !== "number" || !Number.isInteger(changes) || changes < 0) {
      return { ok: false, issues: [{ option: "changes", message: "must be a whole number." }] };
    }
    return { ok: true, options: { title: String(values["title"]), changes } };
  },

  async generate({ patterns, options }) {
    return {
      kind: "demo",
      version: 1,
      generatedAt: new Date().toISOString(),
      data: {
        title: options.title,
        // Passed through verbatim -- expanding globs is the reporter's job, and
        // this one deliberately does not, so you can see exactly what the CLI
        // handed over.
        patterns,
        changes: Array.from({ length: options.changes }, (_, index) => ({
          resource: `demo:resource-${index + 1}`,
          op: ["create", "update", "delete"][index % 3],
        })),
      },
    };
  },
};
