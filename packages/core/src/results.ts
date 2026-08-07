import type { OptionIssue, OptionsResult } from "./options.js";

/** Builds the successful result of a parse phase. */
export function ok<TOptions>(options: TOptions): OptionsResult<TOptions> {
  return { ok: true, options };
}

/**
 * Builds the failed result of a parse phase, from one issue or several.
 *
 * `TOptions` is unconstrained by the arguments, so a plugin returning this from
 * `parseOptions` has it inferred from the declared return type.
 */
export function invalid<TOptions = never>(
  issues: OptionIssue | readonly OptionIssue[],
): OptionsResult<TOptions> {
  return { ok: false, issues: Array.isArray(issues) ? issues : [issues as OptionIssue] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Narrows a value to an `OptionIssue`. */
export function isOptionIssue(value: unknown): value is OptionIssue {
  if (!isRecord(value) || typeof value["message"] !== "string") return false;
  return value["option"] === undefined || typeof value["option"] === "string";
}

/**
 * Narrows a value to an `OptionsResult`.
 *
 * A parse result crosses the boundary out of a separately installed plugin
 * package, so a host checks it before trusting it -- the CLI today, the viewer
 * later. Only the result's own shape is checked; `options` is whatever the
 * plugin built and is opaque until that plugin's role method reads it.
 */
export function isOptionsResult(value: unknown): value is OptionsResult<unknown> {
  if (!isRecord(value)) return false;
  if (value["ok"] === true) return true;
  return value["ok"] === false && Array.isArray(value["issues"]) && value["issues"].every(isOptionIssue);
}
