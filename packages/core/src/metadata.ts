import type { CiMetadata, GitMetadata, GitRemote, Report, ReportMetadata } from "./plugin.js";

/**
 * Readers for a report's metadata.
 *
 * Every reader takes the whole report as `unknown` rather than a metadata
 * object, so nothing outside this file has to know where the field sits or what
 * shape it has. That indirection is the point: `report.metadata` is arbitrary
 * JSON by the time anyone reads it -- out of storage, off disk, out of a file
 * dropped into the browser, possibly written by a newer or older orion -- and a
 * plugin reaching in directly would be writing its own half of a validator.
 *
 * The tolerance rules match the option readers in `values.ts`: a field of the
 * wrong type is treated as absent rather than as an error, and nothing here
 * ever throws. A reader returns only the fields it recognised and checked;
 * anything else stays on the wire, since storage persists the report verbatim.
 */

/** A `--metadata key=value` entry, as a pair. */
export interface MetadataEntry {
  readonly key: string;
  readonly value: string;
}

/**
 * Unlike the `isRecord` in `reports.ts`, this rejects arrays.
 *
 * That one guards a report envelope, which is checked field by field anyway. A
 * metadata namespace is read key by key, so `[{ commit: "..." }]` would
 * otherwise be accepted as an object with no keys and reported as empty rather
 * than as garbage.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A string field, or `undefined` when absent, mistyped or blank. */
function text(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function flag(source: Record<string, unknown>, key: string): boolean | undefined {
  const value = source[key];
  return typeof value === "boolean" ? value : undefined;
}

/**
 * A positive integer, accepting the decimal string form too.
 *
 * A PR number is a number here, but plenty of producers would write `"42"` --
 * it comes out of an environment variable everywhere it originates. Rejecting
 * that would lose the field over a formatting detail.
 */
function count(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** Drops the keys that came back `undefined`, so absent stays absent. */
function compact<T extends object>(fields: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) result[key] = value;
  }
  return result as T;
}

/** The metadata block, or `undefined` when the report has none worth reading. */
export function metadataOf(value: unknown): ReportMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const metadata = value["metadata"];
  return isRecord(metadata) ? (metadata as ReportMetadata) : undefined;
}

/**
 * When metadata was collected.
 *
 * Absent means it never was -- an older orion wrote the report, or the run
 * passed `--no-metadata`. That is a different thing from collection running and
 * finding nothing, which is why the field exists at all.
 */
export function metadataCollectedAt(value: unknown): string | undefined {
  const metadata = metadataOf(value);
  return metadata === undefined ? undefined : text(metadata, "collectedAt");
}

function readRemotes(source: Record<string, unknown>): readonly GitRemote[] | undefined {
  const value = source["remotes"];
  if (!Array.isArray(value)) return undefined;

  // One malformed entry drops itself rather than the whole list: a remote is
  // supporting detail, and showing three of four beats showing none.
  const remotes: GitRemote[] = [];
  for (const entry of value as readonly unknown[]) {
    if (!isRecord(entry)) continue;
    const name = text(entry, "name");
    const url = text(entry, "url");
    if (name !== undefined && url !== undefined) remotes.push({ name, url });
  }
  return remotes.length > 0 ? remotes : undefined;
}

/** The git namespace, with every field checked. */
export function gitMetadata(value: unknown): GitMetadata | undefined {
  const metadata = metadataOf(value);
  if (metadata === undefined) return undefined;
  const git = metadata["git"];
  if (!isRecord(git)) return undefined;

  return compact<GitMetadata>({
    commit: text(git, "commit"),
    branch: text(git, "branch"),
    tag: text(git, "tag"),
    subject: text(git, "subject"),
    author: text(git, "author"),
    committedAt: text(git, "committedAt"),
    dirty: flag(git, "dirty"),
    remotes: readRemotes(git),
  });
}

/** The CI namespace, with every field checked. */
export function ciMetadata(value: unknown): CiMetadata | undefined {
  const metadata = metadataOf(value);
  if (metadata === undefined) return undefined;
  const ci = metadata["ci"];
  if (!isRecord(ci)) return undefined;

  return compact<CiMetadata>({
    provider: text(ci, "provider"),
    repository: text(ci, "repository"),
    workflow: text(ci, "workflow"),
    job: text(ci, "job"),
    runId: text(ci, "runId"),
    runAttempt: text(ci, "runAttempt"),
    runUrl: text(ci, "runUrl"),
    pullRequest: count(ci, "pullRequest"),
    pullRequestUrl: text(ci, "pullRequestUrl"),
    refName: text(ci, "refName"),
    eventName: text(ci, "eventName"),
    actor: text(ci, "actor"),
  });
}

/**
 * The user's own entries, sorted by key.
 *
 * A list rather than a record, and empty rather than `undefined`, so a caller
 * can render it without a presence check -- same reasoning as `listOption`.
 */
export function customMetadata(value: unknown): readonly MetadataEntry[] {
  const metadata = metadataOf(value);
  if (metadata === undefined) return [];
  const custom = metadata["custom"];
  if (!isRecord(custom)) return [];

  // Object.entries rather than for..in: a report is parsed JSON, so a
  // `__proto__` key is an ordinary own property here, but walking the prototype
  // chain would pick up things that were never in the file.
  const entries: MetadataEntry[] = [];
  for (const [key, entry] of Object.entries(custom)) {
    if (key.trim() === "" || typeof entry !== "string") continue;
    entries.push({ key, value: entry });
  }
  return entries.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
}

/**
 * A namespace this version does not model, raw.
 *
 * The escape hatch that keeps the typed readers from being a ceiling: a plugin
 * that knows about a namespace orion does not can still read it, and gets the
 * same "it is an object or it is nothing" guarantee.
 */
export function metadataNamespace(
  value: unknown,
  name: string,
): Readonly<Record<string, unknown>> | undefined {
  const metadata = metadataOf(value);
  if (metadata === undefined) return undefined;
  const namespace = metadata[name];
  return isRecord(namespace) ? namespace : undefined;
}

/**
 * A copy of `report` carrying `metadata`.
 *
 * Non-mutating because the report belongs to the reporter that returned it,
 * which is free to hand back a frozen or reused object. Namespaces merge one
 * level deep, so a reporter that set a namespace of its own keeps it while the
 * collected `git`, `ci` and `custom` win. `data` is rebuilt last so that the
 * first lines of a report file are the small, readable ones.
 */
export function withMetadata(report: Report, metadata: ReportMetadata): Report {
  const { data, ...rest } = report;
  return {
    ...rest,
    metadata: { ...rest.metadata, ...metadata },
    data,
  };
}
