import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { OptionIssue, OptionValues } from "@orion/core";
import plugin, { type PulumiDiffReporterOptions } from "../src/index.js";

/** Runs the parse phase, failing the test if it reported issues. */
function options(values: OptionValues): PulumiDiffReporterOptions {
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

describe("pulumi-diff reporter plugin", () => {
  it("declares itself as a reporter", () => {
    expect(plugin.kind).toBe("reporter");
    expect(plugin.name).toBe("pulumi-diff");
  });

  it("declares only optional options", () => {
    expect(plugin.options?.every((spec) => spec.required !== true)).toBe(true);
  });

  // A host that was not given a boolean supplies `false` for it, and on the
  // command line a boolean is presence -- so every boolean here has to be named
  // for its off-state and default to false, or it could never be turned off.
  it("declares the default of every option that has one", () => {
    const defaults = Object.fromEntries(
      (plugin.options ?? []).map((spec) => [spec.name, spec.default]),
    );

    expect(defaults["omit-values"]).toBe(false);
    expect(defaults["same"]).toBe(false);
    expect(defaults["max-value-length"]).toBe(2000);
  });

  describe("parseOptions", () => {
    it("defaults the root to the working directory", () => {
      expect(options({}).root).toBe(resolve("."));
    });

    it("resolves a relative root", () => {
      expect(options({ root: "./packages/cli" }).root).toBe(resolve("./packages/cli"));
    });

    it("leaves the stack to the preview when none is given", () => {
      expect(options({}).stack).toBeUndefined();
    });

    it("reads a stack", () => {
      expect(options({ stack: "prod" }).stack).toBe("prod");
    });

    it("carries values by default", () => {
      expect(options({}).values).toBe(true);
    });

    it("drops values when asked to omit them", () => {
      expect(options({ "omit-values": true }).values).toBe(false);
    });

    it("defaults max-value-length to 2000", () => {
      expect(options({}).maxValueLength).toBe(2000);
    });

    it("reads max-value-length", () => {
      expect(options({ "max-value-length": 80 }).maxValueLength).toBe(80);
    });

    it("drops unchanged resources by default", () => {
      expect(options({}).same).toBe(false);
    });

    it("reads same", () => {
      expect(options({ same: true }).same).toBe(true);
    });

    it("rejects a root that is not a path", () => {
      // A viewer config file supplies values uncoerced, so this is reachable.
      expect(issues({ root: 7 as unknown as string })).toEqual([
        { option: "root", message: "must be a directory path." },
      ]);
    });

    it("rejects a blank stack", () => {
      expect(issues({ stack: "   " })[0]?.option).toBe("stack");
    });

    it("rejects a non-boolean omit-values", () => {
      expect(issues({ "omit-values": "yes" })).toEqual([
        { option: "omit-values", message: "must be true or false." },
      ]);
    });

    it("rejects a non-numeric max-value-length", () => {
      expect(issues({ "max-value-length": "lots" })).toEqual([
        { option: "max-value-length", message: "must be a number." },
      ]);
    });

    it("points a zero max-value-length at the option that means it", () => {
      const issue = issues({ "max-value-length": 0 })[0];
      expect(issue?.option).toBe("max-value-length");
      expect(issue?.message).toContain("--omit-values");
    });

    it("reports every problem at once", () => {
      expect(
        issues({ root: 7 as unknown as string, "omit-values": "yes", same: "no" }),
      ).toHaveLength(3);
    });
  });
});
