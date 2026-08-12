/**
 * The `composite` report kind: a report whose content is other reports.
 *
 * One CI job usually produces several reports -- a test run, an infrastructure
 * diff, a bundle-size check -- and publishing them separately gives the reader
 * several links and no single answer to "what did this pipeline do?". A
 * composite is that answer: one artefact, one link, each part rendered by
 * whichever viewer plugin already claims its kind.
 *
 * It carries no summary, status or verdict of its own. Rolling several report
 * kinds up into one traffic light would mean this package understanding every
 * kind there is; the parts speak for themselves.
 *
 * A composite may contain a composite. Nothing here prevents a cycle -- an
 * entry could reference a report that references it back -- so the viewer host
 * enforces a nesting depth limit rather than the schema pretending it can.
 */

import type { Report } from "@orion/core";

/** `Report.kind` for this schema. */
export const COMPOSITE_KIND = "composite";

/**
 * `Report.version` for this schema.
 *
 * Adding an optional field does not need a bump -- a viewer reading an older
 * report simply finds it absent. Removing or repurposing one does.
 */
export const COMPOSITE_VERSION = 1;

/** A report left in storage, addressed the way the viewer addresses one. */
export interface CompositeRef {
  /** Storage connection name, as configured in the viewer. */
  readonly connection: string;
  /** The `StorageResult.id` that backend returned. */
  readonly id: string;
}

/**
 * One part of a composite.
 *
 * Exactly one of `report` and `ref` is present, and the choice is a real
 * trade-off rather than a formatting detail. An inline `report` makes the
 * composite self-contained: it survives being downloaded, mailed and dropped
 * into the viewer, at the cost of duplicating the child's bytes. A `ref` keeps
 * a composite of large children small, but only renders for a reader whose
 * viewer has that connection configured, and only while the child is still
 * there.
 */
export interface CompositeEntry {
  /** Heading for this part. Viewers fall back to the child's kind when absent. */
  readonly title?: string;
  /** A line of context under the heading, when the producer has one to give. */
  readonly description?: string;
  /** The child, in full. */
  readonly report?: Report;
  /** The child, left in storage and fetched when the viewer renders it. */
  readonly ref?: CompositeRef;
}

/** The `data` of a `composite` report. */
export interface CompositeData {
  /** A name for the collection as a whole, e.g. the pipeline that produced it. */
  readonly title?: string;
  /** The parts, in the order they should be shown. May be empty. */
  readonly entries: readonly CompositeEntry[];
}
