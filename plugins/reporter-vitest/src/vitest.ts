/**
 * The shape of `vitest --reporter=json` output.
 *
 * Declared here rather than imported from vitest: this plugin reads a *file* a
 * CI job produced, quite possibly with a different vitest version than anything
 * installed beside it, so the JSON is the contract and taking a dependency on
 * the tool would be both useless and heavy. Jest's `--json` output is
 * near-identical, which is why the guard below checks structure rather than
 * looking for a vitest marker.
 *
 * Fields this plugin does not read are omitted -- notably `coverageMap` and
 * `snapshot`, which are deliberately not carried into the report.
 */

/** Vitest's per-test status. Wider than the report's: see `foldStatus`. */
export type VitestStatus = "passed" | "failed" | "skipped" | "pending" | "todo" | "disabled";

export interface VitestAssertion {
  /** Enclosing describe() names, outermost first. */
  readonly ancestorTitles?: readonly string[];
  readonly fullName?: string;
  readonly title?: string;
  readonly status?: string;
  /**
   * Milliseconds. Absent -- not null, and not zero -- when the test never ran,
   * so a missing value must not be defaulted to 0.
   */
  readonly duration?: number | null;
  /** Each error's stack, falling back to its message. */
  readonly failureMessages?: readonly string[] | null;
  /** Only present when the run was configured to record task locations. */
  readonly location?: { readonly line: number; readonly column: number } | null;
}

export interface VitestFile {
  /** Absolute path of the test file, as it was on the machine that ran it. */
  readonly name: string;
  /** Only ever "passed" or "failed" at file level -- there is no skipped file. */
  readonly status: string;
  /** Epoch milliseconds. */
  readonly startTime: number;
  readonly endTime?: number;
  /** A collection error, `""` when there was none. */
  readonly message?: string;
  readonly assertionResults: readonly VitestAssertion[];
}

export interface VitestResults {
  readonly success: boolean;
  /** Epoch milliseconds when the run started. There is no top-level endTime. */
  readonly startTime: number;
  readonly testResults: readonly VitestFile[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFile(value: unknown): value is VitestFile {
  if (!isRecord(value)) return false;
  return (
    typeof value["name"] === "string" &&
    typeof value["status"] === "string" &&
    Array.isArray(value["assertionResults"])
  );
}

/**
 * True for something that looks like a test runner's JSON results.
 *
 * Structural rather than exact: the point is to tell "you pointed me at the
 * wrong file" apart from "this run had an unusual field", and only the fields
 * actually read need to be there. `startTime` is checked because the report's
 * `startedAt` comes from it and a missing one would silently become 1970.
 */
export function isVitestResults(value: unknown): value is VitestResults {
  if (!isRecord(value)) return false;
  return (
    typeof value["success"] === "boolean" &&
    typeof value["startTime"] === "number" &&
    Array.isArray(value["testResults"]) &&
    value["testResults"].every(isFile)
  );
}
