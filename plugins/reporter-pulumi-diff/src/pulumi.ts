/**
 * The shape of `pulumi preview --json` output -- the "preview digest".
 *
 * Declared here rather than imported from a pulumi package: this plugin reads a
 * *file* a CI job produced, quite possibly with a different pulumi version than
 * anything installed beside it, so the JSON is the contract and taking a
 * dependency on the CLI would be both useless and enormous.
 *
 * Fields this plugin does not read are omitted -- notably `config`, which
 * routinely holds secrets and is deliberately not carried into the report.
 */

/**
 * Pulumi's step operations, as they appear in the digest.
 *
 * Wider than the report's `ResourceOp`: a replacement is three of these. See
 * `foldOp`.
 */
export type StepOp =
  | "same"
  | "create"
  | "update"
  | "delete"
  | "replace"
  | "create-replacement"
  | "delete-replaced"
  | "read"
  | "read-replacement"
  | "refresh"
  | "discard"
  | "discard-replaced"
  | "remove-pending-replace"
  | "import"
  | "import-replacement";

/** A resource's state, before or after. Only the property bags are read. */
export interface StepState {
  readonly urn?: string;
  readonly type?: string;
  /** What the program asked for. The side of a diff a reviewer wrote. */
  readonly inputs?: Record<string, unknown>;
  /** What the provider reported. Consulted when `inputs` lacks the property. */
  readonly outputs?: Record<string, unknown>;
}

/** One property's entry in `detailedDiff`. */
export interface DiffEntry {
  /**
   * `ADD`, `ADD_REPLACE`, `UPDATE`, `UPDATE_REPLACE`, `DELETE`,
   * `DELETE_REPLACE`. Absent means `UPDATE`: pulumi omits the zero value of the
   * enum when it serialises, so the commonest kind is the one that goes
   * missing.
   */
  readonly kind?: string;
  readonly inputDiff?: boolean;
}

export interface PreviewStep {
  readonly op: string;
  readonly urn: string;
  /** Provider reference: a URN with `::<id>` appended. */
  readonly provider?: string;
  readonly oldState?: StepState;
  readonly newState?: StepState;
  /** Top-level property names that differ. Pulumi's coarse answer. */
  readonly diffReasons?: readonly string[];
  /** Property path to how it changed. Pulumi's fine answer; not always present. */
  readonly detailedDiff?: Record<string, DiffEntry>;
}

export interface PreviewDiagnostic {
  readonly urn?: string;
  readonly message?: string;
  readonly severity?: string;
  /** A prefix pulumi prints before the message, e.g. the resource's label. */
  readonly prefix?: string;
}

export interface PreviewDigest {
  readonly steps: readonly PreviewStep[];
  readonly diagnostics?: readonly PreviewDiagnostic[];
  /** Seconds, despite the name, and 0 for a preview that finished instantly. */
  readonly duration?: number;
  readonly changeSummary?: Record<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStep(value: unknown): value is PreviewStep {
  if (!isRecord(value)) return false;
  return typeof value["op"] === "string" && typeof value["urn"] === "string";
}

/**
 * True for something that looks like a preview digest.
 *
 * Structural rather than exact: the point is to tell "you pointed me at the
 * wrong file" apart from "this pulumi version has an unusual field", and only
 * the fields actually read need to be there. An empty `steps` is valid -- a
 * preview of a stack with nothing in it is a legitimate thing to report.
 */
export function isPreviewDigest(value: unknown): value is PreviewDigest {
  if (!isRecord(value)) return false;
  return Array.isArray(value["steps"]) && value["steps"].every(isStep);
}

/** A URN pulled apart. Every field may be empty for a malformed URN. */
export interface ParsedUrn {
  readonly stack: string;
  readonly project: string;
  /** The resource's own type: the last link of the type chain. */
  readonly type: string;
  readonly name: string;
}

/**
 * Splits `urn:pulumi:<stack>::<project>::<type chain>::<name>`.
 *
 * The type chain records ancestry (`aws:ec2/vpc:Vpc$aws:ec2/subnet:Subnet`);
 * only the last link is the resource's own type, and the ancestry above it is
 * already visible in the resource's name.
 *
 * A URN that does not parse is not an error: it comes out with the raw string
 * as `name` and everything else empty, so one odd entry cannot cost a reviewer
 * the whole report.
 */
export function parseUrn(urn: string): ParsedUrn {
  const parts = urn.split("::");
  if (parts.length < 4 || !parts[0]?.startsWith("urn:pulumi:")) {
    return { stack: "", project: "", type: "", name: urn };
  }

  const stack = parts[0].slice("urn:pulumi:".length);
  const project = parts[1] ?? "";
  const chain = parts[2] ?? "";
  // The name may itself contain "::" -- rejoin everything after the type.
  const name = parts.slice(3).join("::");
  const type = chain.slice(chain.lastIndexOf("$") + 1);

  return { stack, project, type, name };
}

/**
 * A provider reference with its id trimmed.
 *
 * A reference is `<provider urn>::<id>`, and the id changes on every run that
 * touches the provider -- rendering it would show a diff where none is meant.
 */
export function providerUrn(reference: string | undefined): string | undefined {
  if (reference === undefined || reference === "") return undefined;
  const cut = reference.lastIndexOf("::");
  return cut > 0 ? reference.slice(0, cut) : reference;
}
