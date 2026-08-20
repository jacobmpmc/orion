import { relativeTo } from "@orion/plugin-toolkit";
import { RESOURCE_OPS, SECRET } from "@orion/report-pulumi-diff";
import type {
  Diagnostic,
  DiffTotals,
  PropertyChange,
  PropertyChangeKind,
  PropertyValue,
  PulumiDiffData,
  ResourceChange,
  ResourceOp,
} from "@orion/report-pulumi-diff";
import { parseUrn, providerUrn } from "./pulumi.js";
import type { DiffEntry, PreviewDigest, PreviewStep, StepState } from "./pulumi.js";

/** One input file and what was read out of it. */
export interface Run {
  /** Absolute path of the JSON file this was read from. */
  readonly source: string;
  readonly digest: PreviewDigest;
}

export interface MapOptions {
  /** Absolute directory `sources` is reported relative to. */
  readonly root: string;
  /** The stack to report when the digest's URNs do not name one. */
  readonly stack?: string;
  /** False to carry property paths without their before/after values. */
  readonly values: boolean;
  /** Strings longer than this are truncated. */
  readonly maxValueLength: number;
  /** True to keep unchanged resources in the resource list. */
  readonly same: boolean;
}

/**
 * Pulumi's special-signature key, and the signatures that matter here.
 *
 * A secret arrives as an object carrying this key -- not as a flag on the
 * property -- so redaction is a matter of recognising the shape wherever it
 * turns up, at any depth, which is why `sanitize` recurses rather than checking
 * only the top of a value.
 */
const SIG_KEY = "4dabf18193072939515e22adb298388d";
const SECRET_SIG = "1b47061264138c4ac30d75fd1eb44270";
const OUTPUT_SIG = "d0e6a833031e9bbcd3f4e8bde6ca49a4";

/**
 * How deep `sanitize` will walk.
 *
 * A resource input is arbitrary program output: it can be deep, and a
 * hand-built one can be cyclic. Past this depth the value is reported as
 * elided rather than followed, so a malformed input costs a property's detail
 * instead of hanging the job.
 */
const MAX_DEPTH = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrows a step's operation to the report's nine.
 *
 * The three-step replacement chain all folds to `replace`; pulumi's cleanup of
 * an interrupted replacement folds to `remove`. An unrecognised op -- a future
 * pulumi may add one -- becomes `update` rather than throwing: refusing to
 * report a whole preview over one unfamiliar word would be a bad trade, and
 * `update` is the reading that keeps the resource visible as changed.
 */
export function foldOp(op: string): ResourceOp {
  switch (op) {
    case "same":
    case "create":
    case "update":
    case "delete":
    case "replace":
    case "refresh":
      return op;
    case "create-replacement":
    case "delete-replaced":
      return "replace";
    case "read":
    case "read-replacement":
      return "read";
    case "import":
    case "import-replacement":
      return "import";
    case "discard":
    case "discard-replaced":
    case "remove-pending-replace":
      return "remove";
    default:
      return "update";
  }
}

/**
 * Which of two ops for the same resource wins.
 *
 * A replacement emits `create-replacement`, `replace` and `delete-replaced` for
 * one URN, and a refresh can precede a real change. The more consequential
 * reading wins, so a resource that is being replaced never renders as merely
 * refreshed.
 */
const OP_RANK: Readonly<Record<ResourceOp, number>> = {
  same: 0,
  read: 1,
  refresh: 2,
  remove: 3,
  import: 4,
  create: 5,
  delete: 6,
  update: 7,
  replace: 8,
};

/** Pulumi's diff kinds, folded to the report's three plus a replaces flag. */
export function foldKind(kind: string | undefined): {
  kind: PropertyChangeKind;
  replaces: boolean;
} {
  // Upper-cased in the wire format, lower-cased by some tooling in between.
  const normalised = (kind ?? "update").toLowerCase().replace(/_/g, "-");
  const replaces = normalised.endsWith("-replace");
  const base = replaces ? normalised.slice(0, -"-replace".length) : normalised;

  switch (base) {
    case "add":
    case "delete":
      return { kind: base, replaces };
    default:
      // Includes the absent kind: pulumi omits the enum's zero value, which is
      // UPDATE, so a missing kind means the commonest change of all.
      return { kind: "update", replaces };
  }
}

/**
 * Splits a detailed-diff path into the keys it walks.
 *
 * Pulumi writes `ingress[0].fromPort` and `tags["env"]`; a key needing quotes
 * is quoted, everything else is bare. Indices come out as strings, which is
 * what indexing an array with them wants anyway.
 */
export function pathSegments(path: string): string[] {
  const segments: string[] = [];
  let current = "";
  let index = 0;

  const flush = (): void => {
    if (current !== "") segments.push(current);
    current = "";
  };

  while (index < path.length) {
    const char = path[index];

    if (char === ".") {
      flush();
      index += 1;
      continue;
    }

    if (char === "[") {
      flush();
      const close = path.indexOf("]", index);
      if (close === -1) {
        // Unbalanced: take the rest verbatim rather than dropping it.
        current = path.slice(index + 1);
        break;
      }
      const inner = path.slice(index + 1, close);
      const quoted = inner.startsWith('"') && inner.endsWith('"') && inner.length >= 2;
      segments.push(quoted ? inner.slice(1, -1) : inner);
      index = close + 1;
      continue;
    }

    current += char;
    index += 1;
  }

  flush();
  return segments;
}

/**
 * The value at a detailed-diff path, or undefined when the path is absent.
 *
 * `inputs` is consulted first and `outputs` second: inputs are what the program
 * asked for, which is what the reviewer wrote and will recognise, but a
 * property the provider computes only exists on the output side.
 */
export function valueAt(state: StepState | undefined, path: string): unknown {
  if (state === undefined) return undefined;

  const segments = pathSegments(path);
  if (segments.length === 0) return undefined;

  for (const bag of [state.inputs, state.outputs]) {
    const found = walk(bag, segments);
    if (found !== undefined) return found;
  }

  return undefined;
}

function walk(bag: unknown, segments: readonly string[]): unknown {
  let current: unknown = bag;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0) return undefined;
      current = current[index];
      continue;
    }

    // A secret's plaintext is under the sentinel, not beside it; stepping into
    // one would report the wrong value rather than the redacted one, so the
    // walk stops here and hands back the sentinel for `sanitize` to redact.
    if (isRecord(current) && !isSecretShape(current)) {
      current = current[segment];
      continue;
    }

    return undefined;
  }

  return current;
}

/** True for an object carrying pulumi's secret signature, at any nesting. */
function isSecretShape(value: Record<string, unknown>): boolean {
  if (value[SIG_KEY] === SECRET_SIG) return true;
  // An output value carries its own signature and says whether it is secret.
  return value[SIG_KEY] === OUTPUT_SIG && value["secret"] === true;
}

/**
 * A value ready to be written into a report.
 *
 * Three things happen here, and all three are the reason values can be carried
 * at all: pulumi's secrets are replaced with the sentinel, over-long strings
 * lose their tail, and anything JSON cannot hold is dropped. Undefined comes
 * back for a value that vanishes entirely, which the caller renders as an
 * absent field rather than a null.
 */
export function sanitize(value: unknown, options: MapOptions, depth = 0): PropertyValue | undefined {
  if (value === null) return null;

  const type = typeof value;
  if (type === "boolean") return value as boolean;
  if (type === "number") return Number.isFinite(value as number) ? (value as number) : undefined;
  if (type === "string") return truncate(value as string, options.maxValueLength);
  if (type !== "object") return undefined;

  if (depth >= MAX_DEPTH) {
    return { orionTruncated: true, text: "", omitted: 0 };
  }

  if (Array.isArray(value)) {
    // A dropped entry becomes null rather than shifting everything after it:
    // an index in a diff path has to keep pointing at the same element.
    return value.map((entry) => sanitize(entry, options, depth + 1) ?? null);
  }

  const record = value as Record<string, unknown>;
  if (isSecretShape(record)) return SECRET;

  const result: Record<string, PropertyValue> = {};
  for (const [key, entry] of Object.entries(record)) {
    const clean = sanitize(entry, options, depth + 1);
    if (clean !== undefined) result[key] = clean;
  }
  return result;
}

function truncate(text: string, limit: number): PropertyValue {
  if (text.length <= limit) return text;
  return { orionTruncated: true, text: text.slice(0, limit), omitted: text.length - limit };
}

/** The property changes for one step, in the order pulumi listed them. */
function changesFor(step: PreviewStep, options: MapOptions): readonly PropertyChange[] | undefined {
  const detailed = step.detailedDiff;
  if (detailed === undefined) return undefined;

  return Object.entries(detailed).map(([path, entry]) => toChange(path, entry, step, options));
}

function toChange(
  path: string,
  entry: DiffEntry,
  step: PreviewStep,
  options: MapOptions,
): PropertyChange {
  const { kind, replaces } = foldKind(entry.kind);

  if (!options.values) {
    return { path, kind, replaces };
  }

  // An add has no before and a delete has no after -- and a value that is
  // genuinely absent stays absent rather than becoming null, which would read
  // as "it was set to null".
  const before = kind === "add" ? undefined : sanitize(valueAt(step.oldState, path), options);
  const after = kind === "delete" ? undefined : sanitize(valueAt(step.newState, path), options);

  return {
    path,
    kind,
    replaces,
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
  };
}

/**
 * Folds the steps into one entry per resource.
 *
 * A replacement is three steps for one URN, so grouping is not an optimisation:
 * without it a replaced resource appears three times and the counts say three
 * things changed when one did. Order is the order each URN was first seen.
 */
export function foldSteps(digest: PreviewDigest, options: MapOptions): ResourceChange[] {
  const byUrn = new Map<string, ResourceChange>();

  for (const step of digest.steps) {
    const op = foldOp(step.op);
    const existing = byUrn.get(step.urn);
    const changes = changesFor(step, options);
    const parsed = parseUrn(step.urn);
    const provider = providerUrn(step.provider);
    const reasons = step.diffReasons;

    if (existing === undefined) {
      byUrn.set(step.urn, {
        urn: step.urn,
        type: parsed.type,
        name: parsed.name,
        op,
        ...(provider !== undefined ? { provider } : {}),
        ...(reasons !== undefined && reasons.length > 0 ? { diffReasons: [...reasons] } : {}),
        ...(changes !== undefined ? { changes } : {}),
      });
      continue;
    }

    byUrn.set(step.urn, {
      ...existing,
      op: OP_RANK[op] > OP_RANK[existing.op] ? op : existing.op,
      ...(existing.provider === undefined && provider !== undefined ? { provider } : {}),
      ...(existing.diffReasons === undefined && reasons !== undefined && reasons.length > 0
        ? { diffReasons: [...reasons] }
        : {}),
      // The detailed diff rides on one step of a replacement chain and is
      // absent from the others; whichever step carried it is the one to keep.
      ...(existing.changes === undefined && changes !== undefined ? { changes } : {}),
    });
  }

  return [...byUrn.values()];
}

/**
 * Counts, computed from the folded resources rather than copied from the
 * preview's own `changeSummary` -- so the summary can never disagree with the
 * list rendered under it, and so it stays right when unchanged resources are
 * dropped from that list.
 */
export function totalsFor(resources: readonly ResourceChange[]): DiffTotals {
  const counts = Object.fromEntries(RESOURCE_OPS.map((op) => [op, 0])) as Record<
    ResourceOp,
    number
  >;

  for (const resource of resources) {
    counts[resource.op] += 1;
  }

  return {
    resources: resources.length,
    changed: resources.length - counts.same,
    counts,
  };
}

function toDiagnostics(digest: PreviewDigest): Diagnostic[] {
  return (digest.diagnostics ?? []).flatMap((entry) => {
    const message = (entry.message ?? "").trim();
    if (message === "") return [];

    const severity =
      entry.severity === "error" || entry.severity === "warning" ? entry.severity : "info";

    return [
      {
        severity,
        message,
        ...(entry.urn !== undefined && entry.urn !== "" ? { urn: entry.urn } : {}),
      },
    ];
  });
}

/**
 * Builds one report's data from one preview digest.
 *
 * Unlike a sharded test run, two preview files are two different stacks, so
 * this takes exactly one run -- combining previews is what
 * `@orion/plugin-reporter-composite` is for.
 */
export function mapDigest(run: Run, options: MapOptions): PulumiDiffData {
  const { digest } = run;
  const all = foldSteps(digest, options);
  const totals = totalsFor(all);
  const diagnostics = toDiagnostics(digest);

  // Every URN names the same stack and project, so the first one that parses
  // answers for the whole preview. An explicit --stack still wins: a digest can
  // be replayed from somewhere its URNs do not describe.
  const named = digest.steps.map((step) => parseUrn(step.urn)).find((urn) => urn.stack !== "");
  const stack = options.stack ?? named?.stack;
  const project = named?.project;

  // Seconds on the wire, milliseconds in the report, matching every other
  // duration a report carries.
  const durationMs =
    typeof digest.duration === "number" && Number.isFinite(digest.duration) && digest.duration >= 0
      ? digest.duration * 1000
      : undefined;

  return {
    tool: "pulumi",
    ...(project !== undefined && project !== "" ? { project } : {}),
    ...(stack !== undefined && stack !== "" ? { stack } : {}),
    success: !diagnostics.some((entry) => entry.severity === "error"),
    ...(durationMs !== undefined ? { durationMs } : {}),
    totals,
    resources: options.same ? all : all.filter((resource) => resource.op !== "same"),
    diagnostics,
    sources: [relativeTo(options.root, run.source)],
  };
}
