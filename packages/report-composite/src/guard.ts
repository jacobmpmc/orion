import { isReport } from "@orion/core";
import type { CompositeData, CompositeEntry, CompositeRef } from "./schema.js";

/**
 * Narrowing for report data that arrived from outside the process.
 *
 * A viewer plugin receives `Report.data` as `unknown` every time -- out of a
 * storage backend, or out of a file the user dropped into the browser -- so
 * this guard, not the TypeScript interface, is what actually enforces the
 * schema. It runs in a browser bundle, so the only import is `@orion/core`,
 * which is itself dependency-free and browser-safe.
 *
 * Optional fields are checked only when present, and unknown fields are left
 * alone: a report written by a newer producer is not a report to reject.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when absent, or present and a string. */
function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isCompositeRef(value: unknown): value is CompositeRef {
  if (!isRecord(value)) return false;
  return typeof value["connection"] === "string" && typeof value["id"] === "string";
}

function isCompositeEntry(value: unknown): value is CompositeEntry {
  if (!isRecord(value)) return false;
  if (!isOptionalString(value["title"]) || !isOptionalString(value["description"])) return false;

  const hasReport = value["report"] !== undefined;
  const hasRef = value["ref"] !== undefined;
  // Neither leaves nothing to render; both leaves the viewer choosing which
  // one the producer meant, and it would be guessing.
  if (hasReport === hasRef) return false;

  return hasReport ? isReport(value["report"]) : isCompositeRef(value["ref"]);
}

/** Narrows a report's `data` to `CompositeData`. */
export function isComposite(data: unknown): data is CompositeData {
  if (!isRecord(data)) return false;
  return (
    isOptionalString(data["title"]) &&
    Array.isArray(data["entries"]) &&
    data["entries"].every(isCompositeEntry)
  );
}
