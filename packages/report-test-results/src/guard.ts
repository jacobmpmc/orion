import type { TestCase, TestFile, TestResultsData, TestStatus, TestTotals } from "./schema.js";

/**
 * Narrowing for report data that arrived from outside the process.
 *
 * A viewer plugin receives `Report.data` as `unknown` every time -- out of a
 * storage backend, or out of a file the user dropped into the browser -- so
 * this guard, not the TypeScript interface, is what actually enforces the
 * schema. It runs in a browser bundle, which is why this package imports
 * nothing.
 *
 * Optional fields are checked only when present: absent is valid, and a report
 * written by a newer producer may carry fields this version has never heard of,
 * which is not a reason to reject it.
 */

const STATUSES: readonly string[] = ["passed", "failed", "skipped", "todo"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** True when absent, or present and a finite number. */
function isOptionalCount(value: unknown): boolean {
  return value === undefined || isCount(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isLocation(value: unknown): boolean {
  if (value === undefined) return true;
  return isRecord(value) && isCount(value["line"]) && isCount(value["column"]);
}

function isTestCase(value: unknown): value is TestCase {
  if (!isRecord(value)) return false;
  return (
    typeof value["name"] === "string" &&
    typeof value["fullName"] === "string" &&
    isStringArray(value["suite"]) &&
    STATUSES.includes(value["status"] as TestStatus) &&
    isOptionalCount(value["durationMs"]) &&
    (value["failures"] === undefined || isStringArray(value["failures"])) &&
    isLocation(value["location"])
  );
}

function isTestFile(value: unknown): value is TestFile {
  if (!isRecord(value)) return false;
  return (
    typeof value["path"] === "string" &&
    (value["status"] === "passed" || value["status"] === "failed") &&
    (value["message"] === undefined || typeof value["message"] === "string") &&
    isOptionalCount(value["durationMs"]) &&
    Array.isArray(value["cases"]) &&
    value["cases"].every(isTestCase)
  );
}

function isTotals(value: unknown): value is TestTotals {
  if (!isRecord(value)) return false;
  return (["tests", "passed", "failed", "skipped", "todo", "files", "filesFailed"] as const).every(
    (key) => isCount(value[key]),
  );
}

/** Narrows a report's `data` to `TestResultsData`. */
export function isTestResults(data: unknown): data is TestResultsData {
  if (!isRecord(data)) return false;
  return (
    typeof data["tool"] === "string" &&
    typeof data["success"] === "boolean" &&
    typeof data["startedAt"] === "string" &&
    isOptionalCount(data["durationMs"]) &&
    isTotals(data["totals"]) &&
    Array.isArray(data["files"]) &&
    data["files"].every(isTestFile) &&
    isStringArray(data["sources"])
  );
}
