import { describe, expect, it } from "vitest";
import { canFetch, canStore, isReport, ok } from "../src/index.js";
import type { Report, StoragePlugin } from "../src/index.js";

const report: Report = {
  kind: "pulumi-diff",
  version: 1,
  generatedAt: "2026-08-07T09:30:00.000Z",
  data: { changes: [] },
};

describe("isReport", () => {
  it("accepts a well-formed report", () => {
    expect(isReport(report)).toBe(true);
  });

  it("accepts a report whose data is null", () => {
    expect(isReport({ ...report, data: null })).toBe(true);
  });

  it("rejects a report with no data key at all", () => {
    const { kind, version, generatedAt } = report;

    expect(isReport({ kind, version, generatedAt })).toBe(false);
  });

  it("rejects a version that is not a number", () => {
    expect(isReport({ ...report, version: "1" })).toBe(false);
  });

  it("rejects a missing kind", () => {
    expect(isReport({ ...report, kind: undefined })).toBe(false);
  });

  it("rejects values that are not objects", () => {
    expect(isReport(null)).toBe(false);
    expect(isReport("report")).toBe(false);
    expect(isReport(undefined)).toBe(false);
  });

  // The envelope check must stay indifferent to metadata: a report written
  // before it existed has none, and one carrying nonsense there is still a
  // report worth storing -- otherwise 'orion store' would reject a file the
  // viewer renders perfectly well.
  it("ignores metadata entirely", () => {
    expect(isReport(report)).toBe(true);
    expect(isReport({ ...report, metadata: { collectedAt: "2026-08-07T09:30:00.000Z" } })).toBe(true);
    expect(isReport({ ...report, metadata: {} })).toBe(true);
    expect(isReport({ ...report, metadata: 5 })).toBe(true);
    expect(isReport({ ...report, metadata: null })).toBe(true);
  });
});

function storage(methods: Partial<Pick<StoragePlugin, "store" | "fetch">>): StoragePlugin {
  return {
    kind: "storage",
    name: "test",
    parseOptions: () => ok(undefined),
    ...methods,
  };
}

describe("canStore", () => {
  it("accepts a plugin that implements store", () => {
    expect(canStore(storage({ store: async () => ({ id: "a" }) }))).toBe(true);
  });

  it("rejects a read-only plugin", () => {
    expect(canStore(storage({ fetch: async () => report }))).toBe(false);
  });
});

describe("canFetch", () => {
  it("accepts a plugin that implements fetch", () => {
    expect(canFetch(storage({ fetch: async () => report }))).toBe(true);
  });

  it("rejects a write-only plugin", () => {
    expect(canFetch(storage({ store: async () => ({ id: "a" }) }))).toBe(false);
  });

  it("accepts a plugin that does both", () => {
    const both = storage({ store: async () => ({ id: "a" }), fetch: async () => report });

    expect(canStore(both) && canFetch(both)).toBe(true);
  });
});
