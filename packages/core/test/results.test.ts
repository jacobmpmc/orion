import { describe, expect, it } from "vitest";
import { invalid, isOptionIssue, isOptionsResult, ok } from "../src/index.js";
import type { OptionsResult } from "../src/index.js";

interface Options {
  readonly root: string;
}

describe("ok", () => {
  it("wraps the built options", () => {
    expect(ok({ root: "/tmp" })).toEqual({ ok: true, options: { root: "/tmp" } });
  });

  it("carries the options type through", () => {
    const result: OptionsResult<Options> = ok({ root: "/tmp" });

    expect(result.ok && result.options.root).toBe("/tmp");
  });

  it("accepts options that are not an object", () => {
    expect(ok(null)).toEqual({ ok: true, options: null });
  });
});

describe("invalid", () => {
  it("wraps a single issue in an array", () => {
    expect(invalid({ option: "path", message: "is required." })).toEqual({
      ok: false,
      issues: [{ option: "path", message: "is required." }],
    });
  });

  it("keeps an array of issues as given", () => {
    const issues = [{ option: "path", message: "is required." }, { message: "nothing to do." }];

    expect(invalid(issues)).toEqual({ ok: false, issues });
  });

  it("produces an empty failure for an empty array", () => {
    expect(invalid([])).toEqual({ ok: false, issues: [] });
  });
});

describe("isOptionIssue", () => {
  it("accepts an issue with an option", () => {
    expect(isOptionIssue({ option: "path", message: "is required." })).toBe(true);
  });

  it("accepts an issue without an option", () => {
    expect(isOptionIssue({ message: "nothing to do." })).toBe(true);
  });

  it("rejects a missing message", () => {
    expect(isOptionIssue({ option: "path" })).toBe(false);
  });

  it("rejects a non-string option", () => {
    expect(isOptionIssue({ option: 1, message: "no." })).toBe(false);
  });

  it("rejects values that are not objects", () => {
    expect(isOptionIssue("is required.")).toBe(false);
    expect(isOptionIssue(null)).toBe(false);
  });
});

describe("isOptionsResult", () => {
  it("accepts what ok() builds", () => {
    expect(isOptionsResult(ok({ root: "/tmp" }))).toBe(true);
  });

  it("accepts what invalid() builds", () => {
    expect(isOptionsResult(invalid({ message: "no." }))).toBe(true);
  });

  it("accepts a success with no options", () => {
    expect(isOptionsResult({ ok: true })).toBe(true);
  });

  it("rejects a result with no ok discriminant", () => {
    expect(isOptionsResult({ options: {} })).toBe(false);
  });

  it("rejects a failure with no issues", () => {
    expect(isOptionsResult({ ok: false })).toBe(false);
  });

  it("rejects a failure whose issues are not issues", () => {
    expect(isOptionsResult({ ok: false, issues: ["no."] })).toBe(false);
  });

  it("rejects values that are not objects", () => {
    expect(isOptionsResult(undefined)).toBe(false);
    expect(isOptionsResult("ok")).toBe(false);
  });
});
