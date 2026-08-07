import type { OptionIssue, OptionSpec, OptionValue, OptionValues } from "@orion/core";
import type { PluginOptionValues } from "./types.js";

export interface CollectedOptions {
  readonly values: OptionValues;
  readonly issues: readonly OptionIssue[];
}

type Coerced = { ok: true; value: OptionValue } | { ok: false; issue: OptionIssue };

function describe(value: unknown): string {
  return Array.isArray(value) ? "a list" : `a ${typeof value}`;
}

/** Coerces one scalar against a spec's declared type. */
function coerceScalar(spec: OptionSpec, value: unknown): Coerced {
  const bad = (message: string): Coerced => ({ ok: false, issue: { option: spec.name, message } });

  switch (spec.type) {
    case "string":
      return typeof value === "string"
        ? { ok: true, value }
        : bad(`must be a string, but got ${describe(value)}.`);
    case "number":
      if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value };
      // A string is accepted so values sourced from the environment work
      // without the config file having to convert them.
      if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return { ok: true, value: Number(value) };
      }
      return bad(`must be a number, but got ${JSON.stringify(value)}.`);
    case "boolean":
      return typeof value === "boolean"
        ? { ok: true, value }
        : bad(`must be true or false, but got ${describe(value)}.`);
  }
}

function coerce(spec: OptionSpec, value: OptionValue): Coerced {
  if (spec.multiple !== true) {
    if (Array.isArray(value)) {
      return {
        ok: false,
        issue: { option: spec.name, message: "was given a list but is not repeatable." },
      };
    }
    return coerceScalar(spec, value);
  }

  // A single value is a list of one, so a repeatable option does not have to be
  // written as an array when there is only one of it.
  const items: readonly unknown[] = Array.isArray(value) ? value : [value];
  const collected: unknown[] = [];
  for (const item of items) {
    const one = coerceScalar(spec, item);
    if (!one.ok) return one;
    collected.push(one.value);
  }
  return { ok: true, value: collected as unknown as OptionValue };
}

/**
 * Turns the option values a config file supplied into the `OptionValues` a
 * plugin's parse phase expects.
 *
 * This is the config-file counterpart of what the CLI does after coercing
 * argv -- applying declared defaults, enforcing `required`, checking types and
 * rejecting names the plugin never declared. It is separate from that code
 * because the CLI's version is welded to flags and argv order, neither of which
 * exists here.
 */
export function collectOptions(
  specs: readonly OptionSpec[],
  supplied: PluginOptionValues,
): CollectedOptions {
  const issues: OptionIssue[] = [];
  const values: Record<string, OptionValue> = {};
  const declared = new Set(specs.map((spec) => spec.name));

  for (const name of Object.keys(supplied)) {
    if (declared.has(name)) continue;
    const known = specs.map((spec) => `'${spec.name}'`).join(", ");
    issues.push({
      message:
        known === ""
          ? `does not accept any options, but '${name}' was given.`
          : `does not have an option '${name}'. It accepts ${known}.`,
    });
  }

  for (const spec of specs) {
    const value = supplied[spec.name];

    if (value === undefined) {
      if (spec.default !== undefined) values[spec.name] = spec.default;
      else if (spec.required === true) issues.push({ option: spec.name, message: "is required." });
      else if (spec.type === "boolean") values[spec.name] = false;
      continue;
    }

    const coerced = coerce(spec, value);
    if (coerced.ok) values[spec.name] = coerced.value;
    else issues.push(coerced.issue);
  }

  return { values, issues };
}
