// Deliberately invalid: implements the role method but not parseOptions().
export default {
  kind: "storage",
  name: "no-parse-options",
  async store() {
    return { id: "x" };
  },
};
