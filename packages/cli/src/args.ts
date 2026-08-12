import { parseArgs as nodeParseArgs } from "node:util";
import type { OptionSpec, OptionValue, OptionValues } from "@orion/core";

/**
 * A plugin role the CLI routes options to. `viewer` plugins are never named on
 * the command line, so the CLI's own role type is narrower than `PluginKind`.
 */
export type Role = "reporter" | "storage";

/** An error with a message already suitable for display to the user. */
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

/**
 * A single accepted flag. Several flags may share a `target`, which is how a
 * plugin option gets both a canonical prefixed form and a bare alias.
 */
export interface FlagDef {
  /** Flag as typed on the command line, without the leading `--`. */
  readonly flag: string;
  /** Key the resolved value is stored under. */
  readonly target: string;
  readonly spec: OptionSpec;
}

export interface ParseResult {
  readonly values: Readonly<Record<string, OptionValue>>;
  readonly positionals: readonly string[];
}

function coerce(def: FlagDef, raw: string | boolean): string | number | boolean {
  if (def.spec.type === "boolean") {
    return true;
  }

  const text = String(raw);

  if (def.spec.type === "number") {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      throw new CliError(`Option --${def.flag} expects a number but got '${text}'.`);
    }
    return parsed;
  }

  return text;
}

/**
 * The environment variable a plugin option also reads from:
 * `ORION_<ROLE>_<OPTION_NAME>`, upper-cased, with anything that is not a letter
 * or digit becoming `_` (so `api-token` is `ORION_STORAGE_API_TOKEN`).
 *
 * Only plugin options get one. The core flags do not -- `--storage` names the
 * package that *supplies* `ORION_STORAGE_*`, so reading it from the environment
 * under a name inside that same prefix would be its own trap.
 */
export function envVarName(role: Role, name: string): string {
  const normalized = name.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
  return `ORION_${role.toUpperCase()}_${normalized}`;
}

/** The env var for a `role:name` target, or `undefined` for a core flag. */
function envVarForTarget(target: string): string | undefined {
  const separator = target.indexOf(":");
  if (separator === -1) return undefined;

  const role = target.slice(0, separator);
  if (role !== "reporter" && role !== "storage") return undefined;

  return envVarName(role, target.slice(separator + 1));
}

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", ""]);

/**
 * Turns one environment value into an option value.
 *
 * Booleans take a word rather than mere presence: a variable inherited from a
 * CI job's environment is easy to set and hard to unset, so `FLAG=false` has to
 * mean false. An unrecognised word is an error rather than a falsy default --
 * `VERBOSE=maybe` is a mistake, and silently disabling something is the worst
 * way to answer it.
 */
function coerceEnv(variable: string, spec: OptionSpec, raw: string): OptionValue {
  if (spec.type === "boolean") {
    const word = raw.trim().toLowerCase();
    if (TRUE_VALUES.has(word)) return true;
    if (FALSE_VALUES.has(word)) return false;
    throw new CliError(
      `Environment variable ${variable} expects a boolean (true/false, 1/0, yes/no, on/off) but got '${raw}'.`,
    );
  }

  if (spec.type === "number") {
    const parsed = Number(raw.trim());
    if (raw.trim() === "" || !Number.isFinite(parsed)) {
      throw new CliError(`Environment variable ${variable} expects a number but got '${raw}'.`);
    }
    return spec.multiple === true ? [parsed] : parsed;
  }

  // A repeatable option takes the whole value as a single entry. There is no
  // separator that is safe for arbitrary plugin values -- paths and key=value
  // pairs both contain the obvious candidates -- so several values stay a
  // command-line-only thing rather than a quietly mangled one.
  return spec.multiple === true ? [raw] : raw;
}

/**
 * Parses `argv` against `defs`. Unknown flags are rejected so that a typo in a
 * plugin option fails loudly rather than being silently ignored.
 *
 * A plugin option not given on the command line falls back to its
 * `ORION_<ROLE>_<NAME>` environment variable before its declared default, so a
 * pipeline can keep credentials out of the command it runs. `env` is a
 * parameter rather than a read of `process.env` so tests can supply one.
 */
export function parseFlags(
  argv: readonly string[],
  defs: readonly FlagDef[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): ParseResult {
  const options: Record<string, { type: "string" | "boolean"; multiple?: boolean }> = {};
  for (const def of defs) {
    options[def.flag] = {
      type: def.spec.type === "boolean" ? "boolean" : "string",
      ...(def.spec.multiple === true ? { multiple: true } : {}),
    };
  }

  let parsed;
  try {
    parsed = nodeParseArgs({
      args: [...argv],
      options,
      strict: true,
      allowPositionals: true,
      // Tokens preserve the order flags appeared in, which `values` alone does
      // not. Repeatable options must collect in command-line order even when
      // mixed between a canonical flag and its alias.
      tokens: true,
    });
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error));
  }

  const defsByFlag = new Map<string, FlagDef>();
  for (const def of defs) {
    defsByFlag.set(def.flag, def);
  }

  const values: Record<string, OptionValue> = {};
  const setBy = new Map<string, string>();

  for (const token of parsed.tokens ?? []) {
    if (token.kind !== "option") continue;

    const def = defsByFlag.get(token.name);
    // Unknown flags were already rejected by the strict pass above.
    if (def === undefined) continue;

    const coerced = coerce(def, token.value ?? true);

    if (def.spec.multiple === true) {
      const previous = values[def.target];
      const list = Array.isArray(previous) ? [...previous] : [];
      values[def.target] = [...list, coerced] as OptionValue;
    } else {
      const previousFlag = setBy.get(def.target);
      // Repeating one flag is fine (last wins), but mixing a canonical flag
      // with its alias is ambiguous.
      if (previousFlag !== undefined && previousFlag !== def.flag) {
        throw new CliError(
          `Option --${def.flag} conflicts with --${previousFlag}; specify only one.`,
        );
      }
      values[def.target] = coerced;
    }
    setBy.set(def.target, def.flag);
  }

  // Fill from the environment, apply defaults and enforce required options,
  // once per target rather than once per alias. A flag given on the command
  // line already sat in `values` before this runs, which is what makes argv win
  // over the environment.
  const seenTargets = new Set<string>();
  for (const def of defs) {
    if (seenTargets.has(def.target)) continue;
    seenTargets.add(def.target);

    if (values[def.target] !== undefined) continue;

    const variable = envVarForTarget(def.target);
    const raw = variable === undefined ? undefined : env[variable];
    if (variable !== undefined && raw !== undefined) {
      values[def.target] = coerceEnv(variable, def.spec, raw);
      continue;
    }

    if (def.spec.default !== undefined) {
      values[def.target] = def.spec.default;
    } else if (def.spec.required === true) {
      throw new CliError(
        variable === undefined
          ? `Missing required option --${def.flag}.`
          : `Missing required option --${def.flag} (or set ${variable}).`,
      );
    } else if (def.spec.type === "boolean") {
      values[def.target] = false;
    }
  }

  return { values, positionals: parsed.positionals };
}

/**
 * Builds the flag definitions for a plugin's options.
 *
 * Every option gets a canonical `--<role>-<name>` form, so a reporter and a
 * storage plugin that both want `--token` can always be disambiguated. The bare
 * `--<name>` is registered as an alias too, but only when nothing else has
 * claimed it -- that keeps the common case terse without making plugin pairs
 * mutually incompatible.
 */
export function pluginFlagDefs(
  role: Role,
  specs: readonly OptionSpec[],
  claimed: ReadonlySet<string>,
): { defs: FlagDef[]; claims: Set<string> } {
  const defs: FlagDef[] = [];
  const claims = new Set<string>();

  for (const spec of specs) {
    const canonical = `${role}-${spec.name}`;
    const target = `${role}:${spec.name}`;

    defs.push({ flag: canonical, target, spec });
    claims.add(canonical);

    if (!claimed.has(spec.name) && !claims.has(spec.name)) {
      defs.push({ flag: spec.name, target, spec });
      claims.add(spec.name);
    }
  }

  return { defs, claims };
}

/** Extracts one role's options, keyed by their bare `OptionSpec.name`. */
export function optionsForRole(
  values: Readonly<Record<string, OptionValue>>,
  role: Role,
): OptionValues {
  const prefix = `${role}:`;
  const result: Record<string, OptionValue> = {};

  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith(prefix)) {
      result[key.slice(prefix.length)] = value;
    }
  }

  return result;
}

/** Renders `defs` as aligned help lines, one per distinct option. */
export function describeFlags(defs: readonly FlagDef[]): string[] {
  const byTarget = new Map<string, { flags: string[]; spec: OptionSpec }>();

  for (const def of defs) {
    const entry = byTarget.get(def.target);
    if (entry === undefined) {
      byTarget.set(def.target, { flags: [def.flag], spec: def.spec });
    } else {
      entry.flags.push(def.flag);
    }
  }

  const rows = [...byTarget.entries()].map(([target, { flags, spec }]) => {
    const rendered = flags.map((flag) => `--${flag}`).join(", ");
    const argument = spec.type === "boolean" ? "" : ` <${spec.type}>`;
    return { left: `${rendered}${argument}`, spec, variable: envVarForTarget(target) };
  });

  const width = Math.max(0, ...rows.map((row) => row.left.length));

  return rows.map(({ left, spec, variable }) => {
    const notes: string[] = [];
    if (spec.required === true) notes.push("required");
    if (spec.multiple === true) notes.push("repeatable");
    if (spec.default !== undefined) notes.push(`default: ${String(spec.default)}`);
    // The env var is listed with the option rather than in a block of its own:
    // it is the same setting, and the name is derived, so nothing else says it.
    if (variable !== undefined) notes.push(`env: ${variable}`);
    const suffix = notes.length > 0 ? ` [${notes.join(", ")}]` : "";
    return `  ${left.padEnd(width)}  ${spec.description}${suffix}`;
  });
}
