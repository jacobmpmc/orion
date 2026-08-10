import { posixPath, relativeTo } from "@orion/plugin-toolkit";
import type {
  TestCase,
  TestFile,
  TestResultsData,
  TestStatus,
  TestTotals,
} from "@orion/report-test-results";
import type { VitestAssertion, VitestFile, VitestResults } from "./vitest.js";

/** One input file and what was read out of it. */
export interface Run {
  /** Absolute path of the JSON file this was read from. */
  readonly source: string;
  readonly results: VitestResults;
}

export interface MapOptions {
  /** Absolute directory paths are reported relative to. */
  readonly root: string;
  /** True to report paths as the runner emitted them. */
  readonly absolutePaths: boolean;
}

/**
 * Narrows a runner's status to the report's four.
 *
 * `pending` and `disabled` join `skipped` because nothing renders them
 * differently. An unrecognised status -- a future vitest may add one -- also
 * becomes `skipped` rather than throwing: refusing to report a whole run over
 * one unfamiliar word would be a bad trade.
 */
function foldStatus(status: string | undefined): TestStatus {
  switch (status) {
    case "passed":
    case "failed":
    case "todo":
      return status;
    default:
      return "skipped";
  }
}

/** A finite number, or undefined -- which is what an absent duration must stay. */
function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toCase(assertion: VitestAssertion): TestCase {
  const name = assertion.title ?? "";
  const suite = assertion.ancestorTitles ?? [];
  const durationMs = finite(assertion.duration);
  const failures = assertion.failureMessages ?? [];
  const location = assertion.location;

  return {
    name,
    fullName: assertion.fullName ?? [...suite, name].filter((part) => part !== "").join(" "),
    suite: [...suite],
    status: foldStatus(assertion.status),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(failures.length > 0 ? { failures: [...failures] } : {}),
    ...(location != null ? { location: { line: location.line, column: location.column } } : {}),
  };
}

function toFile(file: VitestFile, options: MapOptions): TestFile {
  const cases = file.assertionResults.map(toCase);
  const start = finite(file.startTime);
  const end = finite(file.endTime);
  const durationMs = start !== undefined && end !== undefined ? end - start : undefined;

  return {
    path: options.absolutePaths ? posixPath(file.name) : relativeTo(options.root, file.name),
    // A file with no failing test can still have failed: a collection error
    // means it never produced tests to fail.
    status: file.status === "failed" || cases.some((one) => one.status === "failed")
      ? "failed"
      : "passed",
    ...(file.message !== undefined && file.message !== "" ? { message: file.message } : {}),
    ...(durationMs !== undefined && durationMs >= 0 ? { durationMs } : {}),
    cases,
  };
}

/**
 * Counts, computed from the files rather than copied from the runner's own
 * totals -- so the summary can never disagree with the list rendered under it,
 * and so merging several runs needs no special case.
 */
function totalsFor(files: readonly TestFile[]): TestTotals {
  const totals = {
    tests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    todo: 0,
    files: files.length,
    filesFailed: 0,
  };

  for (const file of files) {
    if (file.status === "failed") totals.filesFailed += 1;
    for (const one of file.cases) {
      totals.tests += 1;
      totals[one.status] += 1;
    }
  }

  return totals;
}

/**
 * Builds one report's data from one or more runner output files.
 *
 * Several inputs merge rather than erroring, because `generate` returns exactly
 * one report and a sharded run (`vitest --shard`) writes one file per shard.
 * Files are concatenated in input order and deliberately **not** deduplicated
 * by path: two projects legitimately run the same file, and collapsing them
 * would hide a failure.
 */
export function mergeRuns(runs: readonly Run[], options: MapOptions): TestResultsData {
  const files = runs.flatMap((run) => run.results.testResults.map((file) => toFile(file, options)));
  const totals = totalsFor(files);

  const starts = runs.map((run) => run.results.startTime).filter((time) => Number.isFinite(time));
  const ends = runs.flatMap((run) =>
    run.results.testResults.map((file) => finite(file.endTime)).filter((time) => time !== undefined),
  );

  const startedAt = starts.length > 0 ? Math.min(...starts) : Date.now();
  const durationMs = ends.length > 0 ? Math.max(...ends) - startedAt : undefined;

  return {
    tool: "vitest",
    // Trusting the runner's own verdict as well as the counts: a run can fail
    // for a reason no individual test records.
    success: runs.every((run) => run.results.success) && totals.failed === 0 && totals.filesFailed === 0,
    startedAt: new Date(startedAt).toISOString(),
    ...(durationMs !== undefined && durationMs >= 0 ? { durationMs } : {}),
    totals,
    files,
    sources: runs.map((run) =>
      options.absolutePaths ? posixPath(run.source) : relativeTo(options.root, run.source),
    ),
  };
}
