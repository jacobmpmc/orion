import { describe, expect, it } from "vitest";
import { TEST_RESULTS_VERSION } from "@orion/report-test-results";
import type { TestResultsData } from "@orion/report-test-results";
import {
  formatDuration,
  formatTime,
  matches,
  matchesFile,
  readReport,
  rows,
  summarize,
  toneFor,
} from "../browser/model.js";

const data: TestResultsData = {
  tool: "vitest",
  success: false,
  startedAt: "2026-08-07T09:30:00.000Z",
  durationMs: 2300,
  totals: { tests: 4, passed: 2, failed: 1, skipped: 1, todo: 0, files: 2, filesFailed: 2 },
  files: [
    {
      path: "packages/cli/test/args.test.ts",
      status: "failed",
      durationMs: 120,
      cases: [
        { name: "coerces a number", fullName: "args coerces a number", suite: ["args"], status: "passed", durationMs: 4 },
        {
          name: "rejects a typo",
          fullName: "args rejects a typo",
          suite: ["args"],
          status: "failed",
          failures: ["AssertionError: nope"],
        },
        { name: "later", fullName: "later", suite: [], status: "skipped" },
      ],
    },
    {
      path: "packages/viewer/test/tls.test.ts",
      status: "passed",
      cases: [{ name: "serves", fullName: "tls serves", suite: ["tls"], status: "passed", durationMs: 1500 }],
    },
    {
      path: "packages/host/test/broken.test.ts",
      status: "failed",
      message: "Error: Cannot find module './missing.js'",
      cases: [],
    },
  ],
  sources: ["results.json"],
};

const all = rows(data);
const failed = all.find((row) => row.testCase.status === "failed")!;
const passed = all.find((row) => row.testCase.status === "passed")!;

describe("readReport", () => {
  it("accepts a report carrying this schema", () => {
    const loaded = readReport({ version: TEST_RESULTS_VERSION, data });

    expect(loaded?.data).toBe(data);
    expect(loaded?.newerVersion).toBe(false);
  });

  it("flags a report from a newer reporter but still reads it", () => {
    expect(readReport({ version: TEST_RESULTS_VERSION + 1, data })?.newerVersion).toBe(true);
  });

  it("returns undefined rather than throwing for data of another shape", () => {
    expect(readReport({ version: 1, data: { changes: [] } })).toBeUndefined();
    expect(readReport({ version: 1, data: null })).toBeUndefined();
  });
});

describe("rows", () => {
  it("flattens every case, keeping its file", () => {
    expect(all).toHaveLength(4);
    expect(all[0]?.file.path).toBe("packages/cli/test/args.test.ts");
  });
});

describe("matches", () => {
  it("keeps everything for an empty query", () => {
    expect(matches(passed, "", false)).toBe(true);
    expect(matches(passed, "   ", false)).toBe(true);
  });

  it("matches on the test's full name", () => {
    expect(matches(failed, "rejects a typo", false)).toBe(true);
    expect(matches(failed, "coerces", false)).toBe(false);
  });

  it("matches on the file path, so typing a filename narrows to a file", () => {
    expect(matches(failed, "args.test.ts", false)).toBe(true);
    expect(matches(failed, "tls.test.ts", false)).toBe(false);
  });

  it("ignores case", () => {
    expect(matches(failed, "REJECTS A TYPO", false)).toBe(true);
  });

  it("drops anything that did not fail when failed-only is on", () => {
    expect(matches(failed, "", true)).toBe(true);
    expect(matches(passed, "", true)).toBe(false);
  });

  it("applies both filters together", () => {
    expect(matches(failed, "args", true)).toBe(true);
    expect(matches(failed, "tls", true)).toBe(false);
  });
});

describe("matchesFile", () => {
  const broken = data.files[2]!;
  const green = data.files[1]!;

  it("keeps a file that failed to load, which has no cases to match", () => {
    expect(matchesFile(broken, "", true)).toBe(true);
  });

  it("still honours the query", () => {
    expect(matchesFile(broken, "broken", false)).toBe(true);
    expect(matchesFile(broken, "args", false)).toBe(false);
  });

  it("drops a passing file under failed-only", () => {
    expect(matchesFile(green, "", true)).toBe(false);
  });
});

describe("formatDuration", () => {
  it("renders sub-second durations in milliseconds", () => {
    expect(formatDuration(4.4)).toBe("4 ms");
    expect(formatDuration(999)).toBe("999 ms");
  });

  it("renders longer durations in seconds", () => {
    expect(formatDuration(1500)).toBe("1.50 s");
  });

  it("renders a test that never ran as a dash, not as zero", () => {
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(0)).toBe("0 ms");
  });
});

describe("formatTime", () => {
  it("falls back to the raw value when it will not parse", () => {
    expect(formatTime("not a date")).toBe("not a date");
  });

  it("renders a parseable timestamp as something else", () => {
    expect(formatTime("2026-08-07T09:30:00.000Z")).not.toBe("2026-08-07T09:30:00.000Z");
  });
});

describe("summarize", () => {
  it("always shows tests, passed and failed", () => {
    const labels = summarize(data).map((chip) => chip.label);

    expect(labels.slice(0, 3)).toEqual(["tests", "passed", "failed"]);
  });

  it("shows skipped and todo only when there are any", () => {
    const labels = summarize(data).map((chip) => chip.label);
    expect(labels).toContain("skipped");
    expect(labels).not.toContain("todo");
  });

  it("carries the counts and tones", () => {
    const failedChip = summarize(data).find((chip) => chip.label === "failed");

    expect(failedChip).toEqual({ label: "failed", count: 1, tone: "danger" });
  });

  it("mentions failing files when a file failed outright", () => {
    expect(summarize(data).map((chip) => chip.label)).toContain("files failed");
  });
});

describe("toneFor", () => {
  it("maps each status to a theme token", () => {
    expect(toneFor("passed")).toBe("ok");
    expect(toneFor("failed")).toBe("danger");
    expect(toneFor("todo")).toBe("warn");
    expect(toneFor("skipped")).toBe("muted");
  });
});
