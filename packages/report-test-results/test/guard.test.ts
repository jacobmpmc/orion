import { describe, expect, it } from "vitest";
import { isTestResults, TEST_RESULTS_KIND, TEST_RESULTS_VERSION } from "../src/index.js";
import type { TestResultsData } from "../src/index.js";

const data: TestResultsData = {
  tool: "vitest",
  success: false,
  startedAt: "2026-08-07T09:30:00.000Z",
  durationMs: 2300,
  totals: { tests: 3, passed: 1, failed: 1, skipped: 1, todo: 0, files: 1, filesFailed: 1 },
  files: [
    {
      path: "test/args.test.ts",
      status: "failed",
      durationMs: 120,
      cases: [
        { name: "adds", fullName: "math adds", suite: ["math"], status: "passed", durationMs: 4 },
        {
          name: "divides",
          fullName: "math divides",
          suite: ["math"],
          status: "failed",
          failures: ["AssertionError: expected 2 to be 3"],
          location: { line: 12, column: 3 },
        },
        { name: "later", fullName: "later", suite: [], status: "skipped" },
      ],
    },
  ],
  sources: ["results.json"],
};

/** The data with one field replaced, as an unknown to hand to the guard. */
function withData(patch: Record<string, unknown>): unknown {
  return { ...data, ...patch };
}

/** The data with its single file's field replaced. */
function withFile(patch: Record<string, unknown>): unknown {
  return { ...data, files: [{ ...data.files[0], ...patch }] };
}

/** The data with its first case's field replaced. */
function withCase(patch: Record<string, unknown>): unknown {
  const file = data.files[0]!;
  return { ...data, files: [{ ...file, cases: [{ ...file.cases[0], ...patch }] }] };
}

describe("constants", () => {
  it("names the kind and version the schema documents", () => {
    expect(TEST_RESULTS_KIND).toBe("test-results");
    expect(TEST_RESULTS_VERSION).toBe(1);
  });
});

describe("isTestResults", () => {
  it("accepts well-formed data", () => {
    expect(isTestResults(data)).toBe(true);
  });

  it("accepts data with every optional field absent", () => {
    expect(
      isTestResults({
        tool: "jest",
        success: true,
        startedAt: "2026-08-07T09:30:00.000Z",
        totals: { tests: 0, passed: 0, failed: 0, skipped: 0, todo: 0, files: 0, filesFailed: 0 },
        files: [],
        sources: [],
      }),
    ).toBe(true);
  });

  it("accepts unknown extra fields, which a newer producer may add", () => {
    expect(isTestResults(withData({ flakes: 2 }))).toBe(true);
  });

  it.each([null, undefined, "data", 42, []])("rejects %p", (value) => {
    expect(isTestResults(value)).toBe(false);
  });

  it.each(["tool", "success", "startedAt", "totals", "files", "sources"])(
    "rejects data missing %s",
    (key) => {
      const partial: Record<string, unknown> = { ...data };
      delete partial[key];
      expect(isTestResults(partial)).toBe(false);
    },
  );

  it("rejects a non-boolean success", () => {
    expect(isTestResults(withData({ success: "false" }))).toBe(false);
  });

  it("rejects totals missing a count", () => {
    expect(isTestResults(withData({ totals: { tests: 1 } }))).toBe(false);
  });

  it("rejects a non-numeric count", () => {
    expect(isTestResults(withData({ totals: { ...data.totals, passed: "1" } }))).toBe(false);
  });

  it("rejects sources that are not all strings", () => {
    expect(isTestResults(withData({ sources: ["a", 2] }))).toBe(false);
  });

  it("rejects a file with an unknown status", () => {
    expect(isTestResults(withFile({ status: "skipped" }))).toBe(false);
  });

  it("rejects a file without cases", () => {
    expect(isTestResults(withFile({ cases: undefined }))).toBe(false);
  });

  it("rejects a case with an unknown status", () => {
    expect(isTestResults(withCase({ status: "pending" }))).toBe(false);
  });

  it("rejects a case whose suite is not a string list", () => {
    expect(isTestResults(withCase({ suite: "math" }))).toBe(false);
  });

  it("rejects a case whose durationMs is not a number", () => {
    expect(isTestResults(withCase({ durationMs: "4ms" }))).toBe(false);
  });

  it("rejects a case whose location is half-formed", () => {
    expect(isTestResults(withCase({ location: { line: 3 } }))).toBe(false);
  });
});
