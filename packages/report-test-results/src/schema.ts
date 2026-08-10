/**
 * The `test-results` report kind.
 *
 * This is the contract between *any* reporter that reads a test runner's output
 * and *any* viewer that renders it -- which is why it is a package of its own
 * rather than an export of the vitest reporter. A jest or playwright reporter
 * produces this same shape and the same viewer plugin renders it unchanged.
 *
 * The shape is deliberately the intersection of what test runners agree on. It
 * carries no coverage map (it would bloat every stored report), no snapshot
 * summary, no runner-specific metadata or tags, and no absolute run root: CI
 * paths leak and render badly, so `TestFile.path` is already relative.
 */

/** `Report.kind` for this schema. */
export const TEST_RESULTS_KIND = "test-results";

/**
 * `Report.version` for this schema.
 *
 * Adding an optional field does not need a bump -- a viewer reading an older
 * report simply finds it absent. Removing or repurposing one does.
 */
export const TEST_RESULTS_VERSION = 1;

/**
 * A test's outcome, normalised across runners.
 *
 * A runner's finer distinctions collapse: vitest's `pending` and `disabled` are
 * both `skipped` here, because nothing renders them differently.
 */
export type TestStatus = "passed" | "failed" | "skipped" | "todo";

export interface TestCase {
  /** The test's own title, without its enclosing suites. */
  readonly name: string;
  /** Suites and title joined -- the identity used for display and filtering. */
  readonly fullName: string;
  /** Enclosing suite names, outermost first. Empty for a top-level test. */
  readonly suite: readonly string[];
  readonly status: TestStatus;
  /** Absent when the test never ran, which is not the same as taking 0 ms. */
  readonly durationMs?: number;
  /**
   * One entry per error, as the runner rendered it -- a stack trace, usually.
   * Absent when the runner recorded none, which is the normal case for anything
   * that did not fail.
   */
  readonly failures?: readonly string[];
  /** Where the test is declared, when the runner was asked to record it. */
  readonly location?: {
    readonly line: number;
    readonly column: number;
  };
}

export interface TestFile {
  /**
   * Path of the file, with forward slashes, relative to the run root. Absolute
   * only when it falls outside that root.
   */
  readonly path: string;
  /** A file fails if any of its tests failed, or if it failed to load at all. */
  readonly status: "passed" | "failed";
  /** A file-level error -- a collection failure, where no test ran. */
  readonly message?: string;
  readonly durationMs?: number;
  readonly cases: readonly TestCase[];
}

/**
 * Counts for the whole run.
 *
 * A producer computes these from `files` rather than copying the runner's own
 * totals, so the summary can never disagree with the list rendered beneath it.
 */
export interface TestTotals {
  readonly tests: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly todo: number;
  readonly files: number;
  readonly filesFailed: number;
}

/** The `data` of a `test-results` report. */
export interface TestResultsData {
  /** The runner that produced the run, for display. e.g. `vitest`. */
  readonly tool: string;
  /** False if anything failed. Not derivable from counts alone: a run can fail
   * with every test passing, when a file failed to load. */
  readonly success: boolean;
  /** ISO-8601 timestamp of when the run started. */
  readonly startedAt: string;
  /** Wall-clock duration of the run, when the input allows deriving it. */
  readonly durationMs?: number;
  readonly totals: TestTotals;
  readonly files: readonly TestFile[];
  /** The runner output files this report was built from, normalised like `TestFile.path`. */
  readonly sources: readonly string[];
}
