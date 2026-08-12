import { basename, extname } from "node:path";
import type { CompositeEntry, CompositeRef } from "@orion/report-composite";
import type { Report } from "@orion/core";

/**
 * Building entries out of what the command line can express.
 *
 * Kept apart from the plugin object so the naming and parsing rules can be
 * tested without touching a filesystem.
 */

/** Separates a `--ref` value's connection from its id. */
const REF_SEPARATOR = "=";

/**
 * A heading for an inline entry, derived from the file it was read from.
 *
 * Per-entry titles are not configurable: pairing a title with a positional
 * would need an ordering the option model does not express, and the file name
 * is what the person who wrote the pipeline already chose. `unit-tests.json`
 * becomes `unit-tests`.
 */
export function titleFor(source: string): string {
  const name = basename(source);
  const extension = extname(name);
  const stem = extension === "" ? name : name.slice(0, -extension.length);
  return stem === "" ? name : stem;
}

/** An inline entry: the child report, in full, under the file's name. */
export function inlineEntry(source: string, report: Report): CompositeEntry {
  return { title: titleFor(source), report };
}

/** A ref entry, headed by the address it points at -- there is nothing else to
 * name it by without fetching it. */
export function refEntry(ref: CompositeRef): CompositeEntry {
  return { title: `${ref.connection}/${ref.id}`, ref };
}

/**
 * Splits a `--ref connection=id` value.
 *
 * `=` rather than `:` because ids are routinely paths, and a Windows one can
 * carry a drive letter. Only the first `=` separates: an id may contain more.
 */
export function parseRef(value: string): CompositeRef | undefined {
  const at = value.indexOf(REF_SEPARATOR);
  if (at === -1) return undefined;

  const connection = value.slice(0, at).trim();
  const id = value.slice(at + 1).trim();
  if (connection === "" || id === "") return undefined;

  return { connection, id };
}
