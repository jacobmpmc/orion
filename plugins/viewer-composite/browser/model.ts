import { COMPOSITE_VERSION, isComposite } from "@orion/report-composite";
import type { CompositeData, CompositeEntry } from "@orion/report-composite";
import type { ViewerRenderTarget } from "@orion/core";

/**
 * Everything this plugin decides that does not involve the DOM.
 *
 * Kept free of `document` and `window` on purpose: it is the half worth
 * testing, and a node-environment test run is the only way to test it without
 * dragging in a headless browser. `tsconfig.test.json` includes this file and
 * nothing else from `browser/`, so a DOM reference added here fails the
 * typecheck rather than quietly making the tests unrunnable.
 */

export interface Loaded {
  readonly data: CompositeData;
  /**
   * True when the report was produced against a newer version of the schema
   * than this plugin knows. It still renders -- the fields it understands are
   * still there -- but something may be missing, and saying so beats silence.
   */
  readonly newerVersion: boolean;
}

/**
 * Narrows a report to something this plugin can render.
 *
 * Returns undefined rather than throwing: the host turns a thrown error into a
 * generic "failed to render this report", whereas a caller that gets undefined
 * can say precisely what is wrong.
 */
export function readReport(report: {
  readonly version: number;
  readonly data: unknown;
}): Loaded | undefined {
  if (!isComposite(report.data)) return undefined;
  return { data: report.data, newerVersion: report.version > COMPOSITE_VERSION };
}

/**
 * What the host should render for an entry.
 *
 * Undefined is unreachable for data that passed `isComposite`, which requires
 * exactly one of the two -- but the guard runs elsewhere, and this function
 * should not be the reason a malformed entry becomes a thrown error.
 */
export function entryTarget(entry: CompositeEntry): ViewerRenderTarget | undefined {
  return entry.report ?? entry.ref;
}

/**
 * The kind an entry holds, when that is knowable without fetching anything.
 *
 * A ref's kind is only learned once the host has fetched it, which happens
 * inside the nested render -- so this is undefined for refs, and the header is
 * drawn without a kind rather than with a guess.
 */
export function entryKind(entry: CompositeEntry): string | undefined {
  return entry.report?.kind;
}

/** The heading for an entry, falling back to whatever identifies it. */
export function entryTitle(entry: CompositeEntry): string {
  if (entry.title !== undefined && entry.title.trim() !== "") return entry.title;
  if (entry.report !== undefined) return entry.report.kind;
  if (entry.ref !== undefined) return `${entry.ref.connection}/${entry.ref.id}`;
  return "Untitled";
}

/** The line under a heading: what this part is and where it came from. */
export function entryMeta(entry: CompositeEntry): string {
  if (entry.ref !== undefined) {
    return `stored in ${entry.ref.connection} · ${entry.ref.id}`;
  }
  if (entry.report === undefined) return "";
  return [entry.report.kind, formatTime(entry.report.generatedAt)].join(" · ");
}

/** A timestamp for display, falling back to the raw string if it will not parse. */
export function formatTime(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString();
}
