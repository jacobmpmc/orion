import { isTestResults, TEST_RESULTS_VERSION } from "@orion/report-test-results";
import type { TestCase, TestFile, TestResultsData, TestStatus } from "@orion/report-test-results";

/**
 * Everything this plugin decides that does not involve the DOM.
 *
 * Kept free of `document` and `window` on purpose: it is the half worth
 * testing, and a node-environment test run is the only way to test it without
 * dragging in a headless browser. `tsconfig.test.json` includes this file and
 * nothing else from `browser/`, so a DOM reference added here fails the
 * typecheck rather than quietly making the tests unrunnable.
 */

/** Which theme colour a status maps to. See docs/viewer.md for the tokens. */
export type Tone = "ok" | "warn" | "danger" | "muted";

/** One test, paired with the file it came from. The unit the filter acts on. */
export interface Row {
  readonly file: TestFile;
  readonly testCase: TestCase;
}

export interface Loaded {
  readonly data: TestResultsData;
  /**
   * True when the report was produced against a newer version of the schema
   * than this plugin knows. It still renders -- the fields it understands are
   * still there -- but something may be missing, and saying so beats silence.
   */
  readonly newerVersion: boolean;
}

const TONES: Readonly<Record<TestStatus, Tone>> = {
  passed: "ok",
  failed: "danger",
  todo: "warn",
  skipped: "muted",
};

/** The tone for a status. */
export function toneFor(status: TestStatus): Tone {
  return TONES[status];
}

/**
 * Narrows a report to something this plugin can render.
 *
 * Returns undefined rather than throwing: the host turns a thrown error into a
 * generic "failed to render this report", whereas a caller that gets undefined
 * can say precisely what is wrong.
 */
export function readReport(report: { readonly version: number; readonly data: unknown }): Loaded | undefined {
  if (!isTestResults(report.data)) return undefined;
  return { data: report.data, newerVersion: report.version > TEST_RESULTS_VERSION };
}

/** Every test in the report, in file order. */
export function rows(data: TestResultsData): Row[] {
  return data.files.flatMap((file) => file.cases.map((testCase) => ({ file, testCase })));
}

/**
 * Whether a row survives the current filters.
 *
 * The query matches the test's full name *or* its file path, so typing part of
 * a filename narrows to that file -- which is what someone chasing one failing
 * suite actually wants to type.
 */
export function matches(row: Row, query: string, failedOnly: boolean): boolean {
  if (failedOnly && row.testCase.status !== "failed") return false;

  const needle = query.trim().toLowerCase();
  if (needle === "") return true;

  return (
    row.testCase.fullName.toLowerCase().includes(needle) ||
    row.file.path.toLowerCase().includes(needle)
  );
}

/**
 * Whether a file with no tests at all survives the filters.
 *
 * A file that failed to load has nothing for `matches` to act on, and dropping
 * it would hide the very failure that stopped its tests from existing -- so it
 * is matched on its own path instead.
 */
export function matchesFile(file: TestFile, query: string, failedOnly: boolean): boolean {
  if (failedOnly && file.status !== "failed") return false;

  const needle = query.trim().toLowerCase();
  return needle === "" || file.path.toLowerCase().includes(needle);
}

/**
 * A duration for display. An absent one is not zero -- it means the test never
 * ran -- so it renders as a dash rather than "0 ms".
 */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** A timestamp for display, falling back to the raw string if it will not parse. */
export function formatTime(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString();
}

export interface Chip {
  readonly label: string;
  readonly count: number;
  readonly tone: Tone;
}

/**
 * The counts worth showing. Passed and failed always appear -- "0 failed" is
 * information -- while skipped and todo only earn their space when non-zero.
 */
export function summarize(data: TestResultsData): Chip[] {
  const { totals } = data;
  const chips: Chip[] = [
    { label: "tests", count: totals.tests, tone: "muted" },
    { label: "passed", count: totals.passed, tone: "ok" },
    { label: "failed", count: totals.failed, tone: "danger" },
  ];

  if (totals.skipped > 0) chips.push({ label: "skipped", count: totals.skipped, tone: "muted" });
  if (totals.todo > 0) chips.push({ label: "todo", count: totals.todo, tone: "warn" });
  if (totals.filesFailed > 0) {
    chips.push({ label: "files failed", count: totals.filesFailed, tone: "danger" });
  }

  return chips;
}
