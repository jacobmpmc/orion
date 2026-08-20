import { isSecretValue, isTruncatedValue, PULUMI_DIFF_VERSION, isPulumiDiff } from "@orion/report-pulumi-diff";
import type {
  PropertyChange,
  PropertyValue,
  PulumiDiffData,
  ResourceChange,
  ResourceOp,
} from "@orion/report-pulumi-diff";

/**
 * Everything this plugin decides that does not involve the DOM.
 *
 * Kept free of `document` and `window` on purpose: it is the half worth
 * testing, and a node-environment test run is the only way to test it without
 * dragging in a headless browser. `tsconfig.test.json` includes this file and
 * nothing else from `browser/`, so a DOM reference added here fails the
 * typecheck rather than quietly making the tests unrunnable.
 */

/** Which theme colour an op maps to. See docs/viewer.md for the tokens. */
export type Tone = "ok" | "warn" | "danger" | "muted";

export interface Loaded {
  readonly data: PulumiDiffData;
  /**
   * True when the report was produced against a newer version of the schema
   * than this plugin knows. It still renders -- the fields it understands are
   * still there -- but something may be missing, and saying so beats silence.
   */
  readonly newerVersion: boolean;
}

/**
 * The tone for an op.
 *
 * The same three colours a test report uses, meaning the same three things: a
 * create is the safe outcome, an update wants a look, and anything that
 * destroys a resource -- a delete, or the delete half of a replacement -- is
 * what a reviewer is really scanning for.
 */
const TONES: Readonly<Record<ResourceOp, Tone>> = {
  create: "ok",
  import: "ok",
  update: "warn",
  replace: "danger",
  delete: "danger",
  remove: "warn",
  refresh: "muted",
  read: "muted",
  same: "muted",
};

/** What each op is called in the summary and on a badge. */
const LABELS: Readonly<Record<ResourceOp, string>> = {
  create: "create",
  update: "update",
  replace: "replace",
  delete: "delete",
  remove: "remove",
  import: "import",
  refresh: "refresh",
  read: "read",
  same: "unchanged",
};

export function toneFor(op: ResourceOp): Tone {
  return TONES[op];
}

export function labelFor(op: ResourceOp): string {
  return LABELS[op];
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
  if (!isPulumiDiff(report.data)) return undefined;
  return { data: report.data, newerVersion: report.version > PULUMI_DIFF_VERSION };
}

export interface Chip {
  readonly label: string;
  readonly count: number;
  readonly tone: Tone;
}

/**
 * The counts worth showing.
 *
 * Create, update and delete always appear -- "0 delete" is information a
 * reviewer wants confirmed -- while the rarer ops earn their space only when
 * something did them.
 */
export function summarize(data: PulumiDiffData): Chip[] {
  const { counts } = data.totals;
  const always: readonly ResourceOp[] = ["create", "update", "delete"];

  const chips: Chip[] = always.map((op) => ({
    label: labelFor(op),
    count: counts[op],
    tone: toneFor(op),
  }));

  for (const op of ["replace", "remove", "import", "refresh", "read", "same"] as const) {
    if (counts[op] > 0) chips.push({ label: labelFor(op), count: counts[op], tone: toneFor(op) });
  }

  return chips;
}

/**
 * Whether a resource survives the current filters.
 *
 * The query matches the resource's name, its type or its URN, so typing a
 * provider prefix narrows to that provider -- which is what someone auditing
 * one service actually types.
 */
export function matches(resource: ResourceChange, query: string, changedOnly: boolean): boolean {
  if (changedOnly && resource.op === "same") return false;

  const needle = query.trim().toLowerCase();
  if (needle === "") return true;

  return (
    resource.name.toLowerCase().includes(needle) ||
    resource.type.toLowerCase().includes(needle) ||
    resource.urn.toLowerCase().includes(needle) ||
    (resource.changes ?? []).some((change) => change.path.toLowerCase().includes(needle))
  );
}

/**
 * A property value for display.
 *
 * A redacted secret says so rather than showing an object with a signature in
 * it, and a truncated string admits what it dropped -- a reader who cannot tell
 * a shortened value from a real one will make the wrong call about the diff.
 */
export function formatValue(value: PropertyValue | undefined): string {
  if (value === undefined) return "—";
  if (isSecretValue(value)) return "(secret)";
  if (isTruncatedValue(value)) return `${value.text}… (+${value.omitted} more characters)`;
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value, replacer);
  } catch {
    // A value that will not stringify is not worth failing a render over.
    return "(unrenderable)";
  }
}

/** Keeps the two sentinels legible inside a nested value. */
function replacer(_key: string, value: unknown): unknown {
  if (isSecretValue(value)) return "(secret)";
  if (isTruncatedValue(value)) return `${value.text}… (+${value.omitted} more characters)`;
  return value;
}

/** The sign shown against a property change. */
export function signFor(change: PropertyChange): string {
  switch (change.kind) {
    case "add":
      return "+";
    case "delete":
      return "−";
    default:
      return "~";
  }
}

export function toneForChange(change: PropertyChange): Tone {
  if (change.replaces) return "danger";
  switch (change.kind) {
    case "add":
      return "ok";
    case "delete":
      return "danger";
    default:
      return "warn";
  }
}

export interface Expansion {
  /** True when the button should open the list rather than close it. */
  readonly expand: boolean;
  /** What the button says: the action it will take, not the current state. */
  readonly label: string;
}

/**
 * What the expand/collapse button should do next, given which resources are
 * currently open.
 *
 * One button rather than two, and it offers to *expand* whenever anything is
 * still closed. A reader who has opened three resources by hand and wants the
 * rest is the common case; only when everything is already open does collapsing
 * become the useful move.
 *
 * The states passed in are the visible ones -- expanding should not open forty
 * resources the filter is hiding, which would spring back into a wall of text
 * the moment the filter cleared.
 */
export function expansionFor(open: readonly boolean[]): Expansion {
  const anyClosed = open.some((one) => !one);
  return anyClosed ? { expand: true, label: "Expand all" } : { expand: false, label: "Collapse all" };
}

/**
 * A duration for display. An absent one is not zero -- it means the input never
 * recorded one -- so it renders as a dash rather than "0 ms".
 */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** The line under the summary: what was previewed, and how it went. */
export function subtitle(data: PulumiDiffData): string {
  const stack = data.stack === undefined ? undefined : `stack ${data.stack}`;
  const project = data.project === undefined ? undefined : `project ${data.project}`;

  return [
    data.tool,
    project,
    stack,
    data.durationMs === undefined ? undefined : formatDuration(data.durationMs),
    data.success ? undefined : "preview reported an error",
  ]
    .filter((part): part is string => part !== undefined)
    .join(" · ");
}

/**
 * Whether the resource list is showing everything the preview walked.
 *
 * A reporter run without `--same` counts unchanged resources without listing
 * them, and a summary that says "40 unchanged" above a list of three is only
 * honest if the page says which it is.
 */
export function omittedUnchanged(data: PulumiDiffData): number {
  const listed = data.resources.filter((resource) => resource.op === "same").length;
  return Math.max(0, data.totals.counts.same - listed);
}
