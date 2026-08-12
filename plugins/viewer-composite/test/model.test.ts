import { describe, expect, it } from "vitest";
import type { Report } from "@orion/core";
import { COMPOSITE_KIND, COMPOSITE_VERSION } from "@orion/report-composite";
import { entryKind, entryMeta, entryTarget, entryTitle, readReport } from "../browser/model.js";

const child: Report = {
  kind: "test-results",
  version: 1,
  generatedAt: "2026-08-06T09:30:00.000Z",
  data: { tool: "vitest" },
};

const ref = { connection: "prod", id: "reports/run-12.json" };

function report(data: unknown, version = COMPOSITE_VERSION): Report {
  return { kind: COMPOSITE_KIND, version, generatedAt: "2026-08-06T09:30:00.000Z", data };
}

describe("readReport", () => {
  it("reads a composite", () => {
    const loaded = readReport(report({ entries: [{ report: child }] }));

    expect(loaded?.data.entries).toHaveLength(1);
    expect(loaded?.newerVersion).toBe(false);
  });

  it("refuses data that is not a composite", () => {
    expect(readReport(report({ tool: "vitest" }))).toBeUndefined();
  });

  it("flags a report from a newer producer, and still reads it", () => {
    const loaded = readReport(report({ entries: [] }, COMPOSITE_VERSION + 1));

    expect(loaded?.newerVersion).toBe(true);
  });
});

describe("entryTarget", () => {
  it("hands an inline report straight to the host", () => {
    expect(entryTarget({ report: child })).toBe(child);
  });

  it("hands a ref over for the host to fetch", () => {
    expect(entryTarget({ ref })).toBe(ref);
  });

  it("has nothing to render for an entry carrying neither", () => {
    expect(entryTarget({ title: "unit" })).toBeUndefined();
  });
});

describe("entryKind", () => {
  it("knows an inline report's kind", () => {
    expect(entryKind({ report: child })).toBe("test-results");
  });

  it("cannot know a ref's kind before it is fetched", () => {
    expect(entryKind({ ref })).toBeUndefined();
  });
});

describe("entryTitle", () => {
  it("prefers the title the producer gave", () => {
    expect(entryTitle({ title: "unit tests", report: child })).toBe("unit tests");
  });

  it("falls back to an inline report's kind", () => {
    expect(entryTitle({ report: child })).toBe("test-results");
  });

  it("falls back to a ref's address", () => {
    expect(entryTitle({ ref })).toBe("prod/reports/run-12.json");
  });

  it("treats a blank title as no title", () => {
    expect(entryTitle({ title: "   ", report: child })).toBe("test-results");
  });
});

describe("entryMeta", () => {
  it("says where a ref lives", () => {
    expect(entryMeta({ ref })).toBe("stored in prod · reports/run-12.json");
  });

  it("leads with an inline report's kind", () => {
    expect(entryMeta({ report: child })).toMatch(/^test-results · /);
  });

  it("shows an unparseable timestamp as it stands", () => {
    expect(entryMeta({ report: { ...child, generatedAt: "whenever" } })).toBe(
      "test-results · whenever",
    );
  });
});
