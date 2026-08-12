import { describe, expect, it } from "vitest";
import type { Report } from "@orion/core";
import { isComposite } from "../src/guard.js";

const child: Report = {
  kind: "test-results",
  version: 1,
  generatedAt: "2026-08-06T09:30:00.000Z",
  data: { tool: "vitest" },
};

const ref = { connection: "prod", id: "reports/run-12.json" };

describe("isComposite", () => {
  it("accepts a composite of inline reports", () => {
    expect(isComposite({ entries: [{ title: "unit", report: child }] })).toBe(true);
  });

  it("accepts a composite of refs", () => {
    expect(isComposite({ entries: [{ ref }] })).toBe(true);
  });

  it("accepts inline and ref entries side by side", () => {
    expect(isComposite({ title: "CI run", entries: [{ report: child }, { ref }] })).toBe(true);
  });

  it("accepts a composite with no entries", () => {
    expect(isComposite({ entries: [] })).toBe(true);
  });

  it("accepts a nested composite, which is what the depth limit exists for", () => {
    const inner: Report = { ...child, kind: "composite", data: { entries: [{ report: child }] } };

    expect(isComposite({ entries: [{ report: inner }] })).toBe(true);
  });

  it("tolerates fields a newer producer added", () => {
    expect(isComposite({ entries: [{ report: child, weight: 3 }], layout: "grid" })).toBe(true);
  });

  it("rejects an entry carrying neither a report nor a ref", () => {
    expect(isComposite({ entries: [{ title: "unit" }] })).toBe(false);
  });

  it("rejects an entry carrying both, since neither would be the answer", () => {
    expect(isComposite({ entries: [{ report: child, ref }] })).toBe(false);
  });

  it("rejects an inline value that is not a report", () => {
    expect(isComposite({ entries: [{ report: { kind: "test-results" } }] })).toBe(false);
  });

  it("rejects a ref missing an id", () => {
    expect(isComposite({ entries: [{ ref: { connection: "prod" } }] })).toBe(false);
  });

  it("rejects a non-string title", () => {
    expect(isComposite({ entries: [{ title: 7, report: child }] })).toBe(false);
  });

  it("rejects data with no entries list", () => {
    expect(isComposite({ title: "CI run" })).toBe(false);
  });

  it("rejects values that are not objects", () => {
    expect(isComposite(undefined)).toBe(false);
    expect(isComposite(null)).toBe(false);
    expect(isComposite([{ report: child }])).toBe(false);
    expect(isComposite("composite")).toBe(false);
  });
});
