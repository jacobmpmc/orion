/**
 * A stand-in reporter, so the playground has something to generate.
 *
 * No reporter plugin exists in the workspace yet (the Pulumi diff one is the
 * MVP target), and `orion generate` requires one. This is the minimum that
 * satisfies the contract: it reads nothing and reports the patterns it was
 * handed, which is enough to exercise the whole path from the CLI through
 * storage and back out of the viewer.
 *
 * Delete it the moment a real reporter lands.
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
