import { RESOURCE_OPS } from "./schema.js";
import type {
  Diagnostic,
  DiffTotals,
  PropertyChange,
  PropertyValue,
  PulumiDiffData,
  ResourceChange,
  ResourceOp,
} from "./schema.js";

/**
 * Narrowing for report data that arrived from outside the process.
 *
 * A viewer plugin receives `Report.data` as `unknown` every time -- out of a
 * storage backend, or out of a file the user dropped into the browser -- so
 * this guard, not the TypeScript interface, is what actually enforces the
 * schema. It runs in a browser bundle, which is why this package imports
 * nothing beyond its own schema.
 *
 * Optional fields are checked only when present: absent is valid, and a report
 * written by a newer producer may carry fields this version has never heard of,
 * which is not a reason to reject it.
 */

const KINDS: readonly string[] = ["add", "update", "delete"];
const SEVERITIES: readonly string[] = ["info", "warning", "error"];

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

/**
 * True for anything JSON can hold.
 *
 * Recursive, because a property's value is an arbitrary resource input: a list
 * of security group rules, a nested policy document. `undefined` is rejected
 * rather than tolerated -- it cannot survive a round trip through JSON, so a
 * report carrying one did not come from a producer that stored it.
 */
function isPropertyValue(value: unknown): value is PropertyValue {
  if (value === null) return true;
  const type = typeof value;
  if (type === "boolean" || type === "number" || type === "string") return true;
  if (Array.isArray(value)) return value.every(isPropertyValue);
  if (isRecord(value)) return Object.values(value).every(isPropertyValue);
  return false;
}

/** True when absent, or present and a valid value. */
function isOptionalPropertyValue(value: unknown): boolean {
  return value === undefined || isPropertyValue(value);
}

function isPropertyChange(value: unknown): value is PropertyChange {
  if (!isRecord(value)) return false;
  return (
    typeof value["path"] === "string" &&
    KINDS.includes(value["kind"] as string) &&
    typeof value["replaces"] === "boolean" &&
    isOptionalPropertyValue(value["before"]) &&
    isOptionalPropertyValue(value["after"])
  );
}

function isResourceChange(value: unknown): value is ResourceChange {
  if (!isRecord(value)) return false;
  return (
    typeof value["urn"] === "string" &&
    typeof value["type"] === "string" &&
    typeof value["name"] === "string" &&
    RESOURCE_OPS.includes(value["op"] as ResourceOp) &&
    (value["provider"] === undefined || typeof value["provider"] === "string") &&
    (value["diffReasons"] === undefined || isStringArray(value["diffReasons"])) &&
    (value["changes"] === undefined ||
      (Array.isArray(value["changes"]) && value["changes"].every(isPropertyChange)))
  );
}

function isDiagnostic(value: unknown): value is Diagnostic {
  if (!isRecord(value)) return false;
  return (
    SEVERITIES.includes(value["severity"] as string) &&
    typeof value["message"] === "string" &&
    (value["urn"] === undefined || typeof value["urn"] === "string")
  );
}

function isTotals(value: unknown): value is DiffTotals {
  if (!isRecord(value)) return false;
  if (!isCount(value["resources"]) || !isCount(value["changed"])) return false;

  const counts = value["counts"];
  if (!isRecord(counts)) return false;
  // Every op is required to be present, so a viewer can read a count without
  // deciding what a missing one means.
  return RESOURCE_OPS.every((op) => isCount(counts[op]));
}

/** Narrows a report's `data` to `PulumiDiffData`. */
export function isPulumiDiff(data: unknown): data is PulumiDiffData {
  if (!isRecord(data)) return false;
  return (
    typeof data["tool"] === "string" &&
    (data["project"] === undefined || typeof data["project"] === "string") &&
    (data["stack"] === undefined || typeof data["stack"] === "string") &&
    typeof data["success"] === "boolean" &&
    isOptionalCount(data["durationMs"]) &&
    isTotals(data["totals"]) &&
    Array.isArray(data["resources"]) &&
    data["resources"].every(isResourceChange) &&
    Array.isArray(data["diagnostics"]) &&
    data["diagnostics"].every(isDiagnostic) &&
    isStringArray(data["sources"])
  );
}
