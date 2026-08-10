import type { OptionValues } from "./options.js";

/**
 * Readers for the raw values a host routes to a plugin's parse phase.
 *
 * Every `parseOptions` starts by pulling typed values out of an `OptionValues`
 * record, and every one of them has to cope with the same two facts: a value
 * may be absent, and a host other than the CLI may supply something of the
 * wrong type. The CLI coerces against the `OptionSpec` before a plugin ever
 * sees a value, but the viewer's config file is arbitrary JavaScript -- so the
 * checks are not redundant.
 *
 * These live in core rather than a plugin-side package because they are pure:
 * no `node:` import, nothing that would keep them out of a browser bundle. Same
 * reason `ok` and `invalid` are here.
 */

/**
 * A string option, or `undefined` when it is absent, not a string, or blank.
 *
 * Blank counts as absent: a `--path ""` is a mistake rather than a request for
 * the empty path, and every caller would otherwise have to say so itself.
 */
export function stringOption(values: OptionValues, name: string): string | undefined {
  const value = values[name];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * A number option, or `undefined` when absent or not a number.
 *
 * `NaN` and the infinities are rejected: they arrive from a config file that
 * wrote `Number("abc")`, and no plugin means to accept them.
 */
export function numberOption(values: OptionValues, name: string): number | undefined {
  const value = values[name];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * A boolean option, or `undefined` when absent or not a boolean.
 *
 * Pass a fallback with `?? false` at the call site rather than defaulting here,
 * so a plugin that wants to distinguish "absent" from "false" still can.
 */
export function booleanOption(values: OptionValues, name: string): boolean | undefined {
  const value = values[name];
  return typeof value === "boolean" ? value : undefined;
}

/**
 * The values of a repeatable option, as a list.
 *
 * A `multiple` option collects into an array, but a host that was given a
 * single value may hand over the scalar -- the viewer's `collectOptions` does
 * exactly that. Both shapes are normalised to a list here. Entries of the wrong
 * type are dropped rather than failing, since a plugin reports its own issues
 * and an empty list is indistinguishable from an absent option anyway.
 */
export function listOption(values: OptionValues, name: string): readonly string[] {
  const value = values[name];
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return (value as readonly unknown[]).filter((entry): entry is string => typeof entry === "string");
}
