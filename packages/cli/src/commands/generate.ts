import { withMetadata } from "@orion/core";
import type { OptionSpec } from "@orion/core";
import { CliError, parseFlags, type FlagDef } from "../args.js";
import { collectMetadata, parseCustomEntries } from "../metadata/index.js";
import { loadReporter, loadStorage } from "../plugins.js";
import {
  assertNoIssues,
  buildDefs,
  buildOptions,
  HELP_DEF,
  preScan,
  printStored,
  renderHelp,
  runCommand,
  STORAGE_DEF,
} from "./plugin-command.js";
import type { Command } from "./types.js";

const REPORTER_SPEC: OptionSpec = {
  name: "reporter",
  type: "string",
  description: "Reporter plugin package that builds the report",
  required: true,
};

const METADATA_SPEC: OptionSpec = {
  name: "metadata",
  type: "string",
  description: "Extra metadata entry as key=value",
  multiple: true,
};

// Named `no-metadata` outright rather than relying on a negation convention:
// node's parseArgs has no `--no-` handling of its own (that is yargs and
// commander), so this is an ordinary boolean flag whose name happens to read
// like one.
const NO_METADATA_SPEC: OptionSpec = {
  name: "no-metadata",
  type: "boolean",
  description: "Skip collecting git and CI metadata",
};

const CORE_DEFS: readonly FlagDef[] = [
  { flag: "reporter", target: "reporter", spec: REPORTER_SPEC },
  STORAGE_DEF,
  { flag: "metadata", target: "metadata", spec: METADATA_SPEC },
  { flag: "no-metadata", target: "no-metadata", spec: NO_METADATA_SPEC },
  HELP_DEF,
];

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
    "",
    "The report is stamped with the commit, branch, remotes and CI run it was",
    "generated from. Nothing is collected that git or the environment does not",
    "already provide, and --no-metadata turns it off entirely.",
  ].join("\n"),

  run(argv) {
    return runCommand("generate", async () => {
      const scanned = preScan(argv, ["reporter", "storage"]);
      const defs = await buildDefs(CORE_DEFS, [
        { role: "reporter", specifier: scanned.plugins.reporter, load: loadReporter },
        { role: "storage", specifier: scanned.plugins.storage, load: loadStorage },
      ]);

      if (scanned.help) {
        process.stdout.write(
          renderHelp({
            summary: generateCommand.summary,
            usage: generateCommand.usage,
            intro: [
              "Positional arguments are file names or glob patterns, passed through to",
              "the reporter plugin unexpanded.",
            ],
            defs,
            coreDefs: CORE_DEFS,
            roles: ["reporter", "storage"],
            hint: "Pass --reporter and --storage to see the options those plugins add.",
          }),
        );
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

      const skipMetadata = values["no-metadata"] === true;
      const raw = Array.isArray(values["metadata"])
        ? (values["metadata"] as readonly string[])
        : [];

      // Both checks happen before a plugin is loaded, matching how the rest of
      // this command works: a typo should cost nothing and leave nothing behind.
      if (skipMetadata && raw.length > 0) {
        throw new CliError(
          "--metadata cannot be combined with --no-metadata; drop one of the two.",
        );
      }

      const custom = parseCustomEntries(raw);
      if (custom.issues.length > 0) {
        throw new CliError(custom.issues.join("\n"));
      }

      const reporter = await loadReporter(reporterPkg);
      const storage = await loadStorage(storagePkg);

      // Both plugins build their options before either runs, so a bad option
      // never leaves a half-finished report behind.
      const reporterOptions = buildOptions("reporter", reporter, values);
      const storageOptions = buildOptions("storage", storage, values);
      assertNoIssues(reporterOptions.issues, storageOptions.issues);

      const report = await reporter.generate({
        patterns: positionals,
        options: reporterOptions.options,
      });

      // Provenance is attached here rather than in the reporter: every report
      // should carry the same facts whichever plugin produced it, and a reporter
      // author should not have to reimplement `git rev-parse` to get them.
      // Collection runs after generate, so a reporter failure costs nothing, and
      // collectMetadata never rejects -- a missing git is a missing field.
      const stored = skipMetadata
        ? report
        : withMetadata(
            report,
            await collectMetadata({ cwd: process.cwd(), env: process.env, custom: custom.entries }),
          );

      const result = await storage.store({
        report: stored,
        options: storageOptions.options,
      });

      printStored(stored, result);
      return 0;
    });
  },
};
