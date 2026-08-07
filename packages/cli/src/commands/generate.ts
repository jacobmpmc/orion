import { parseArgs as nodeParseArgs } from "node:util";
import type { OptionSpec, OptionValue, Plugin } from "@orion/core";
import {
  CliError,
  describeFlags,
  optionsForRole,
  parseFlags,
  pluginFlagDefs,
  type FlagDef,
} from "../args.js";
import { loadReporter, loadStorage, parsePluginOptions } from "../plugins.js";
import type { Command } from "./types.js";

const REPORTER_SPEC: OptionSpec = {
  name: "reporter",
  type: "string",
  description: "Reporter plugin package that builds the report",
  required: true,
};

const STORAGE_SPEC: OptionSpec = {
  name: "storage",
  type: "string",
  description: "Storage plugin package that persists the report",
  required: true,
};

const HELP_SPEC: OptionSpec = {
  name: "help",
  type: "boolean",
  description: "Show usage, including options from the selected plugins",
};

const CORE_DEFS: readonly FlagDef[] = [
  { flag: "reporter", target: "reporter", spec: REPORTER_SPEC },
  { flag: "storage", target: "storage", spec: STORAGE_SPEC },
  { flag: "help", target: "help", spec: HELP_SPEC },
];

const CORE_FLAGS: ReadonlySet<string> = new Set(CORE_DEFS.map((def) => def.flag));

/**
 * A first, deliberately lenient pass over argv. The full option schema is not
 * known until the plugins named by `--reporter` and `--storage` are loaded, so
 * this pass reads only those two flags and ignores everything else. Its
 * positionals and other values are discarded -- unknown flags are misparsed
 * here by design, and the strict second pass is what actually validates.
 */
function preScan(argv: readonly string[]): {
  reporter?: string;
  storage?: string;
  help: boolean;
} {
  let values: Record<string, unknown>;
  try {
    ({ values } = nodeParseArgs({
      args: [...argv],
      options: {
        reporter: { type: "string" },
        storage: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      strict: false,
      allowPositionals: true,
    }));
  } catch {
    return { help: false };
  }

  const asString = (value: unknown): string | undefined => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      const last = value[value.length - 1];
      return typeof last === "string" ? last : undefined;
    }
    return undefined;
  };

  const reporter = asString(values["reporter"]);
  const storage = asString(values["storage"]);

  return {
    ...(reporter !== undefined ? { reporter } : {}),
    ...(storage !== undefined ? { storage } : {}),
    help: values["help"] === true,
  };
}

/**
 * Builds the full flag set: the core flags, plus each plugin's contributed
 * options. Plugins are loaded only when named.
 */
async function buildDefs(
  reporterPkg: string | undefined,
  storagePkg: string | undefined,
): Promise<FlagDef[]> {
  const defs: FlagDef[] = [...CORE_DEFS];
  const claimed = new Set<string>(CORE_FLAGS);

  if (reporterPkg !== undefined) {
    const reporter = await loadReporter(reporterPkg);
    const built = pluginFlagDefs("reporter", reporter.options ?? [], claimed);
    defs.push(...built.defs);
    for (const claim of built.claims) claimed.add(claim);
  }

  if (storagePkg !== undefined) {
    const storage = await loadStorage(storagePkg);
    const built = pluginFlagDefs("storage", storage.options ?? [], claimed);
    defs.push(...built.defs);
    for (const claim of built.claims) claimed.add(claim);
  }

  return defs;
}

/**
 * Runs one plugin's parse phase over the values routed to its role.
 *
 * Issues come back rendered rather than thrown so that both plugins can be
 * parsed before either is reported on -- a user fixing options sees every
 * problem in one run instead of one per attempt. `options` is `undefined` when
 * there were issues, which is safe because the caller reports them and stops.
 */
function buildOptions(
  role: "reporter" | "storage",
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

function renderHelp(defs: readonly FlagDef[], loaded: boolean): string {
  const core = defs.filter((def) => CORE_FLAGS.has(def.flag));
  const reporterDefs = defs.filter((def) => def.target.startsWith("reporter:"));
  const storageDefs = defs.filter((def) => def.target.startsWith("storage:"));

  const lines = [
    generateCommand.summary,
    "",
    `Usage: ${generateCommand.usage}`,
    "",
    "Positional arguments are file names or glob patterns, passed through to",
    "the reporter plugin unexpanded.",
    "",
    "Options:",
    ...describeFlags(core),
  ];

  if (reporterDefs.length > 0) {
    lines.push("", "Reporter plugin options:", ...describeFlags(reporterDefs));
  }
  if (storageDefs.length > 0) {
    lines.push("", "Storage plugin options:", ...describeFlags(storageDefs));
  }

  if (!loaded) {
    lines.push(
      "",
      "Pass --reporter and --storage to see the options those plugins add.",
    );
  }

  lines.push("");
  return lines.join("\n");
}

export const generateCommand: Command = {
  name: "generate",
  summary: "Build a report with a reporter plugin and persist it with a storage plugin",
  usage: "orion generate --reporter <package> --storage <package> [options] <file|glob...>",
  details: [
    "Plugins contribute their own named arguments. Each plugin option is always",
    "available in its canonical form (--reporter-<name> / --storage-<name>), and",
    "also as a bare --<name> when no other plugin or core flag has claimed it.",
    "",
    "Run 'orion generate --reporter <pkg> --storage <pkg> --help' to list the",
    "options contributed by a specific pair of plugins.",
  ].join("\n"),

  async run(argv) {
    try {
      const scanned = preScan(argv);
      const defs = await buildDefs(scanned.reporter, scanned.storage);

      if (scanned.help) {
        const loaded = scanned.reporter !== undefined && scanned.storage !== undefined;
        process.stdout.write(renderHelp(defs, loaded));
        return 0;
      }

      const { values, positionals } = parseFlags(argv, defs);

      // Re-read from the validated pass rather than trusting the lenient one.
      const reporterPkg = values["reporter"] as string;
      const storagePkg = values["storage"] as string;

      if (positionals.length === 0) {
        throw new CliError(
          "No input files given. Pass at least one file name or glob pattern for the reporter to read.",
        );
      }

      const reporter = await loadReporter(reporterPkg);
      const storage = await loadStorage(storagePkg);

      // Both plugins build their options before either runs, so a bad option
      // never leaves a half-finished report behind.
      const reporterOptions = buildOptions("reporter", reporter, values);
      const storageOptions = buildOptions("storage", storage, values);
      const issues = [...reporterOptions.issues, ...storageOptions.issues];

      if (issues.length > 0) {
        throw new CliError(["Invalid plugin options:", ...issues].join("\n"));
      }

      const report = await reporter.generate({
        patterns: positionals,
        options: reporterOptions.options,
      });

      const result = await storage.store({
        report,
        options: storageOptions.options,
      });

      process.stdout.write(`Stored ${report.kind} report as ${result.id}\n`);
      if (result.url !== undefined) {
        process.stdout.write(`${result.url}\n`);
      }
      return 0;
    } catch (error) {
      if (error instanceof CliError) {
        process.stderr.write(`orion generate: ${error.message}\n`);
        return 1;
      }
      throw error;
    }
  },
};
