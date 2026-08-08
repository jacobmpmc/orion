import { parseArgs as nodeParseArgs } from "node:util";
import type { OptionSpec, OptionValue, Plugin, Report, StorageResult } from "@orion/core";
import {
  CliError,
  describeFlags,
  optionsForRole,
  pluginFlagDefs,
  type FlagDef,
  type Role,
} from "../args.js";
import { parsePluginOptions } from "../plugins.js";

/**
 * Plumbing shared by every command that names plugins on the command line.
 *
 * `generate` and `store` differ only in which roles they take and what they
 * hand the storage plugin; the two-pass argv scan, the flag schema, the parse
 * phase and the help layout are the same problem in both, so they live here.
 */

export const STORAGE_SPEC: OptionSpec = {
  name: "storage",
  type: "string",
  description: "Storage plugin package that persists the report",
  required: true,
};

export const HELP_SPEC: OptionSpec = {
  name: "help",
  type: "boolean",
  description: "Show usage, including options from the selected plugins",
};

export const STORAGE_DEF: FlagDef = { flag: "storage", target: "storage", spec: STORAGE_SPEC };
export const HELP_DEF: FlagDef = { flag: "help", target: "help", spec: HELP_SPEC };

export interface PreScan {
  /** Package specifier named for each scanned role, when one was given. */
  readonly plugins: Partial<Record<Role, string>>;
  readonly help: boolean;
}

/**
 * A first, deliberately lenient pass over argv. The full option schema is not
 * known until the plugins named by the role flags are loaded, so this pass
 * reads only those flags and ignores everything else. Its positionals and other
 * values are discarded -- unknown flags are misparsed here by design, and the
 * strict second pass is what actually validates.
 */
export function preScan(argv: readonly string[], roles: readonly Role[]): PreScan {
  const options: Record<string, { type: "string" | "boolean"; short?: string }> = {
    help: { type: "boolean", short: "h" },
  };
  for (const role of roles) {
    options[role] = { type: "string" };
  }

  let values: Record<string, unknown>;
  try {
    ({ values } = nodeParseArgs({
      args: [...argv],
      options,
      strict: false,
      allowPositionals: true,
    }));
  } catch {
    return { plugins: {}, help: false };
  }

  const asString = (value: unknown): string | undefined => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      const last = value[value.length - 1];
      return typeof last === "string" ? last : undefined;
    }
    return undefined;
  };

  const plugins: Partial<Record<Role, string>> = {};
  for (const role of roles) {
    const specifier = asString(values[role]);
    if (specifier !== undefined) plugins[role] = specifier;
  }

  return { plugins, help: values["help"] === true };
}

/** One role's contribution to the flag schema, loaded only when named. */
export interface RoleLoad {
  readonly role: Role;
  /** Package named for this role, or `undefined` when the flag was absent. */
  readonly specifier: string | undefined;
  load(specifier: string): Promise<Plugin>;
}

/**
 * Builds the full flag set: the command's own flags, plus each named plugin's
 * contributed options. Roles claim bare aliases in the order given.
 */
export async function buildDefs(
  coreDefs: readonly FlagDef[],
  roles: readonly RoleLoad[],
): Promise<FlagDef[]> {
  const defs: FlagDef[] = [...coreDefs];
  const claimed = new Set<string>(coreDefs.map((def) => def.flag));

  for (const { role, specifier, load } of roles) {
    if (specifier === undefined) continue;

    const plugin = await load(specifier);
    const built = pluginFlagDefs(role, plugin.options ?? [], claimed);
    defs.push(...built.defs);
    for (const claim of built.claims) claimed.add(claim);
  }

  return defs;
}

/**
 * Runs one plugin's parse phase over the values routed to its role.
 *
 * Issues come back rendered rather than thrown so that every plugin can be
 * parsed before any is reported on -- a user fixing options sees every problem
 * in one run instead of one per attempt. `options` is `undefined` when there
 * were issues, which is safe because the caller reports them and stops.
 */
export function buildOptions(
  role: Role,
  plugin: Plugin,
  values: Readonly<Record<string, OptionValue>>,
): { options: unknown; issues: readonly string[] } {
  const result = parsePluginOptions(plugin, optionsForRole(values, role));

  if (result.ok) {
    return { options: result.options, issues: [] };
  }

  return {
    options: undefined,
    issues: result.issues.map((issue) =>
      issue.option === undefined
        ? `  ${role} plugin '${plugin.name}': ${issue.message}`
        : `  --${role}-${issue.option} ${issue.message}`,
    ),
  };
}

/** Throws with every plugin's issues at once, or returns if there are none. */
export function assertNoIssues(...issues: readonly (readonly string[])[]): void {
  const all = issues.flat();
  if (all.length > 0) {
    throw new CliError(["Invalid plugin options:", ...all].join("\n"));
  }
}

const ROLE_HEADINGS: Readonly<Record<Role, string>> = {
  reporter: "Reporter plugin options:",
  storage: "Storage plugin options:",
};

export interface HelpLayout {
  readonly summary: string;
  readonly usage: string;
  /** Prose between the usage line and the option list. */
  readonly intro?: readonly string[];
  readonly defs: readonly FlagDef[];
  readonly coreDefs: readonly FlagDef[];
  /** Roles to list plugin options for, in the order they should appear. */
  readonly roles: readonly Role[];
  /** Shown when a role's plugin was not named, so its options are missing. */
  readonly hint: string;
}

/** Renders help for a plugin-bearing command, with a section per named role. */
export function renderHelp(layout: HelpLayout): string {
  const coreFlags = new Set(layout.coreDefs.map((def) => def.flag));
  const lines = [
    layout.summary,
    "",
    `Usage: ${layout.usage}`,
    "",
    ...(layout.intro === undefined ? [] : [...layout.intro, ""]),
    "Options:",
    ...describeFlags(layout.defs.filter((def) => coreFlags.has(def.flag))),
  ];

  let complete = true;
  for (const role of layout.roles) {
    const roleDefs = layout.defs.filter((def) => def.target.startsWith(`${role}:`));
    if (roleDefs.length === 0) {
      complete = false;
      continue;
    }
    lines.push("", ROLE_HEADINGS[role], ...describeFlags(roleDefs));
  }

  if (!complete) {
    lines.push("", layout.hint);
  }

  lines.push("");
  return lines.join("\n");
}

/** Reports where a stored report landed, in the one format both commands use. */
export function printStored(report: Report, result: StorageResult): void {
  process.stdout.write(`Stored ${report.kind} report as ${result.id}\n`);
  if (result.url !== undefined) {
    process.stdout.write(`${result.url}\n`);
  }
}

/**
 * Runs a command body, turning a `CliError` into the command's own stderr line
 * and exit code. Anything else is a bug and keeps its stack trace.
 */
export async function runCommand(name: string, body: () => Promise<number>): Promise<number> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(`orion ${name}: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
