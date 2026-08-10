import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { OptionIssue, OptionValues } from "@orion/core";
import plugin, { type VitestReporterOptions } from "../src/index.js";

/** Runs the parse phase, failing the test if it reported issues. */
function options(values: OptionValues): VitestReporterOptions {
  const result = plugin.parseOptions(values);
  if (!result.ok) throw new Error(`unexpected issues: ${JSON.stringify(result.issues)}`);
  return result.options;
}

/** Runs the parse phase, failing the test if it succeeded. */
function issues(values: OptionValues): readonly OptionIssue[] {
  const result = plugin.parseOptions(values);
  if (result.ok) throw new Error("expected the options to be rejected");
  return result.issues;
}

describe("vitest reporter plugin", () => {
  it("declares itself as a reporter", () => {
    expect(plugin.kind).toBe("reporter");
    expect(plugin.name).toBe("vitest");
  });

  it("declares only optional options", () => {
    expect(plugin.options?.every((spec) => spec.required !== true)).toBe(true);
  });

  describe("parseOptions", () => {
    it("defaults the root to the working directory", () => {
      expect(options({}).root).toBe(resolve("."));
    });

    it("resolves a relative root", () => {
      expect(options({ root: "./packages/cli" }).root).toBe(resolve("./packages/cli"));
    });

    it("defaults absolute-paths to false", () => {
      expect(options({}).absolutePaths).toBe(false);
    });

    it("reads absolute-paths", () => {
      expect(options({ "absolute-paths": true }).absolutePaths).toBe(true);
    });

    it("rejects a root that is not a path", () => {
      // A viewer config file supplies values uncoerced, so this is reachable.
      expect(issues({ root: 7 as unknown as string })).toEqual([
        { option: "root", message: "must be a directory path." },
      ]);
    });

    it("rejects a blank root", () => {
      expect(issues({ root: "   " })[0]?.option).toBe("root");
    });

    it("rejects a non-boolean absolute-paths", () => {
      expect(issues({ "absolute-paths": "yes" })).toEqual([
        { option: "absolute-paths", message: "must be true or false." },
      ]);
    });

    it("reports both problems at once", () => {
      expect(issues({ root: 7 as unknown as string, "absolute-paths": "yes" })).toHaveLength(2);
    });
  });
});
