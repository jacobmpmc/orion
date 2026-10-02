/**
 * The `pulumi-diff` report kind.
 *
 * This is the contract between *any* reporter that reads an infrastructure
 * preview and *any* viewer that renders it -- which is why it is a package of
 * its own rather than an export of the pulumi reporter.
 *
 * The shape is what a preview is actually read for: which resources change, how
 * they change, and which of their properties differ. It carries no full
 * `oldState`/`newState` -- those are whole resource bodies, and storing two of
 * them per resource would dwarf the diff they were included to explain -- no
 * stack configuration, and no provider credentials. Values pulumi marked secret
 * never reach a report at all; see `SECRET`.
 */

/** `Report.kind` for this schema. */
export const PULUMI_DIFF_KIND = "pulumi-diff";

/**
 * `Report.version` for this schema.
 *
 * Adding an optional field does not need a bump -- a viewer reading an older
 * report simply finds it absent. Removing or repurposing one does.
 */
export const PULUMI_DIFF_VERSION = 1;

/**
 * What a preview says will happen to one resource, normalised.
 *
 * A replacement reaches a producer as up to three steps for the same resource
 * (`create-replacement`, `replace`, `delete-replaced`); they collapse to one
 * `replace` here, because they are one thing happening to one resource.
 * `discard-replaced` and `remove-pending-replace` -- pulumi cleaning up after an
 * interrupted replacement -- collapse to `remove`.
 */
export type ResourceOp =
  | "create"
  | "update"
  | "delete"
  | "replace"
  | "same"
  | "read"
  | "refresh"
  | "import"
  | "remove";

/** Every `ResourceOp`, in the order a summary reads best. */
export const RESOURCE_OPS: readonly ResourceOp[] = [
  "create",
  "update",
  "replace",
  "delete",
  "remove",
  "import",
  "refresh",
  "read",
  "same",
];

/**
 * What happened to one property.
 *
 * Pulumi's replacement-causing kinds (`ADD_REPLACE`, ...) are not separate
 * values: they are the same three changes, and whether one forces a replacement
 * is `PropertyChange.replaces`.
 */
export type PropertyChangeKind = "add" | "update" | "delete";

/**
 * A property's value, as JSON.
 *
 * What a producer puts here has already been through redaction and truncation,
 * so `SECRET`, `UNKNOWN` and `Truncated` are all ordinary objects as far as this type is
 * concerned -- a viewer recognises them with the guards below.
 */
export type PropertyValue =
  | null
  | boolean
  | number
  | string
  | readonly PropertyValue[]
  | { readonly [key: string]: PropertyValue };

/**
 * What a value pulumi marked secret becomes.
 *
 * A report outlives the job that produced it and is readable by anyone who can
 * reach the storage backend, so a secret's plaintext must never be written into
 * one. The property still appears -- knowing that a secret changed is a large
 * part of why a diff gets reviewed -- but its value is this sentinel.
 */
export const SECRET = { orionSecret: true } as const;

/** True for the value `SECRET` stands in for. */
export function isSecretValue(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return (value as Record<string, unknown>)["orionSecret"] === true;
}

/**
 * What a value the preview could not compute becomes.
 *
 * A property built from another resource's output is not known until apply
 * when that resource is itself changing, and pulumi writes a placeholder in
 * its place. Carried as-is the placeholder reads as a real value -- a state
 * machine definition "changing to" a UUID -- so it is replaced with this.
 */
export const UNKNOWN = { orionUnknown: true } as const;

/** True for the value `UNKNOWN` stands in for. */
export function isUnknownValue(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return (value as Record<string, unknown>)["orionUnknown"] === true;
}

/**
 * What a value too long to store becomes.
 *
 * A single property can hold a rendered template or an embedded file; the head
 * of it is what a reviewer reads, and `omitted` says how much was dropped so a
 * viewer can be honest about it.
 */
export interface Truncated {
  readonly orionTruncated: true;
  /** The leading characters that were kept. */
  readonly text: string;
  /** How many characters were dropped. Always at least 1. */
  readonly omitted: number;
}

/** Narrows a value to the truncation sentinel. */
export function isTruncatedValue(value: unknown): value is Truncated {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record["orionTruncated"] === true &&
    typeof record["text"] === "string" &&
    typeof record["omitted"] === "number"
  );
}

export interface PropertyChange {
  /**
   * The property, as the preview named it: a dotted path with bracketed indices
   * and quoted keys, e.g. `tags["env"]` or `ingress[0].fromPort`. Kept verbatim
   * rather than split into segments, because it is what the reviewer will go
   * looking for in their own source.
   */
  readonly path: string;
  readonly kind: PropertyChangeKind;
  /** True when this property is why the resource is being replaced. */
  readonly replaces: boolean;
  /**
   * The value before. Absent for an `add`, and absent from every change when
   * the producer was asked not to carry values.
   */
  readonly before?: PropertyValue;
  /** The value after. Absent for a `delete`, and under the same option. */
  readonly after?: PropertyValue;
}

export interface ResourceChange {
  /** The resource's URN, unparsed -- the identity a reviewer can search for. */
  readonly urn: string;
  /** The resource's type, from the URN. e.g. `aws:s3/bucket:Bucket`. */
  readonly type: string;
  /** The resource's own name, from the URN. */
  readonly name: string;
  readonly op: ResourceOp;
  /**
   * The provider that owns the resource, with its id stripped -- the id is a
   * URN suffix that changes every run and reads as noise.
   */
  readonly provider?: string;
  /**
   * Top-level property names the preview gave as its reason for the change.
   * Absent when the preview gave none, which is normal for a create or delete.
   */
  readonly diffReasons?: readonly string[];
  /**
   * The properties that differ. Absent when the preview carried no detailed
   * diff at all -- which is not the same as an empty list, meaning it carried
   * one and nothing in it differed.
   */
  readonly changes?: readonly PropertyChange[];
}

/**
 * A message the preview emitted.
 *
 * The warnings a preview prints -- a deprecated provider, a pending operation --
 * are often the reason a reviewer rejects it, so they travel with the diff
 * rather than being left behind in the job log.
 */
export interface Diagnostic {
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  /** The resource the message is about, when it names one. */
  readonly urn?: string;
}

/**
 * Counts for the whole preview.
 *
 * A producer computes these from `resources` rather than copying the preview's
 * own change summary, so the totals can never disagree with the list rendered
 * beneath them.
 */
export interface DiffTotals {
  /** Every resource the preview walked, including unchanged ones. */
  readonly resources: number;
  /** Everything but `same`. */
  readonly changed: number;
  /** One entry per `ResourceOp`, all present, zero when nothing did that. */
  readonly counts: Readonly<Record<ResourceOp, number>>;
}

/** The `data` of a `pulumi-diff` report. */
export interface PulumiDiffData {
  /** The tool that produced the preview, for display. e.g. `pulumi`. */
  readonly tool: string;
  /** The project the stack belongs to, when the input named one. */
  readonly project?: string;
  /** The stack previewed, when the input named one. */
  readonly stack?: string;
  /**
   * False if the preview reported an error. A preview that failed part way
   * still has a partial diff worth reading, so this is a field rather than a
   * reason to refuse the report.
   */
  readonly success: boolean;
  /** How long the preview took, when the input recorded it. */
  readonly durationMs?: number;
  readonly totals: DiffTotals;
  /**
   * The resources, in the order the preview walked them. Unchanged resources
   * may be omitted -- `totals` counts them either way, so a summary saying
   * "40 unchanged" above a list of three is consistent, not a contradiction.
   */
  readonly resources: readonly ResourceChange[];
  readonly diagnostics: readonly Diagnostic[];
  /** The preview output files this report was built from, as relative paths. */
  readonly sources: readonly string[];
}
