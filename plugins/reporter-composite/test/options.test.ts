import { describe, expect, it } from "vitest";
import type { OptionIssue, OptionValues } from "@orion/core";
import plugin from "../src/index.js";
import type { CompositeReporterOptions } from "../src/index.js";

function options(values: OptionValues): CompositeReporterOptions {
  const result = plugin.parseOptions(values);
  if (!result.ok) throw new Error(`unexpected issues: ${JSON.stringify(result.issues)}`);
  return result.options;
}

function issues(values: OptionValues): readonly OptionIssue[] {
  const result = plugin.parseOptions(values);
  if (result.ok) throw new Error(`expected issues, got ${JSON.stringify(result.options)}`);
  return result.issues;
}

describe("parseOptions", () => {
  it("needs nothing", () => {
    expect(options({})).toEqual({ refs: [] });
  });

  it("keeps a title", () => {
    expect(options({ title: "Nightly" }).title).toBe("Nightly");
  });

  it("rejects a blank title rather than storing one", () => {
    expect(issues({ title: "  " })).toEqual([{ option: "title", message: "must be a name." }]);
  });

  it("splits a ref into a connection and an id", () => {
    expect(options({ ref: "prod=reports/run-12.json" }).refs).toEqual([
      { connection: "prod", id: "reports/run-12.json" },
    ]);
  });

  it("keeps repeated refs in the order they were given", () => {
    expect(options({ ref: ["prod=a.json", "staging=b.json"] }).refs).toEqual([
      { connection: "prod", id: "a.json" },
      { connection: "staging", id: "b.json" },
    ]);
  });

  it("splits on the first separator only, since an id may contain one", () => {
    expect(options({ ref: "prod=a=b.json" }).refs).toEqual([
      { connection: "prod", id: "a=b.json" },
    ]);
  });

  it("reports one issue per bad ref, so three typos are fixed once", () => {
    const reported = issues({ ref: ["prod", "=a.json", "prod="] });

    expect(reported).toHaveLength(3);
    expect(reported.every((issue) => issue.option === "ref")).toBe(true);
    expect(reported[0]?.message).toMatch(/'prod' must be a connection and an id/);
  });

  it("reports a bad ref alongside a bad title", () => {
    expect(issues({ title: "", ref: "prod" }).map((issue) => issue.option)).toEqual([
      "title",
      "ref",
    ]);
  });
});
