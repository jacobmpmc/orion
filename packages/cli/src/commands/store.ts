import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isReport } from "@orion/core";
import type { Report } from "@orion/core";
import { CliError, parseFlags, type FlagDef } from "../args.js";
import { loadStorage } from "../plugins.js";
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

const CORE_DEFS: readonly FlagDef[] = [STORAGE_DEF, HELP_DEF];

const BOM = String.fromCharCode(0xfeff);

function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

/**
 * Reads a report that some earlier run already generated.
 *
 * Unlike `generate`'s positionals -- which are reporter input and are passed
 * through unexpanded -- this path is read by the CLI itself, so it must be a
 * single existing JSON file. The envelope is checked here rather than left to
 * the storage plugin: a file that is not a report should be rejected before a
 * backend is asked to keep it.
 */
async function readReport(path: string): Promise<Report> {
  let text: string;
  try {
    text = await readFile(resolve(path), "utf8");
  } catch (error) {
    throw new CliError(
      `Could not read report file '${path}'.\n  ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  let parsed: unknown;
  try {
    // A file written by a Windows tool often starts with a BOM, which
    // JSON.parse rejects. The CLI reads whatever a pipeline left on disk, so it
    // tolerates one rather than blaming the user's JSON.
    parsed = JSON.parse(stripBom(text));
  } catch (error) {
    throw new CliError(
      `Report file '${path}' is not valid JSON.\n  ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!isReport(parsed)) {
    throw new CliError(
      `Report file '${path}' is not an orion report; expected an object with kind, version, generatedAt and data.`,
    );
  }

  return parsed;
}

export const storeCommand: Command = {
  name: "store",
  summary: "Persist an already-generated report file with a storage plugin",
  usage: "orion store --storage <package> [options] <file>",
  details: [
    "Takes the JSON report a previous 'orion generate' produced -- or one written",
    "by any other tool -- and hands it to a storage plugin unchanged. No reporter",
    "is involved, so only --storage options apply.",
    "",
    "The single positional is a path to one report file, read by the CLI itself:",
    "unlike 'orion generate' it is not a glob and is not passed through to a",
    "plugin.",
    "",
    "Run 'orion store --storage <pkg> --help' to list the options that plugin",
    "adds.",
  ].join("\n"),

  run(argv) {
    return runCommand("store", async () => {
      const scanned = preScan(argv, ["storage"]);
      const defs = await buildDefs(CORE_DEFS, [
        { role: "storage", specifier: scanned.plugins.storage, load: loadStorage },
      ]);

      if (scanned.help) {
        process.stdout.write(
          renderHelp({
            summary: storeCommand.summary,
            usage: storeCommand.usage,
            intro: [
              "The positional argument is the path to a JSON report file, read as-is.",
            ],
            defs,
            coreDefs: CORE_DEFS,
            roles: ["storage"],
            hint: "Pass --storage to see the options that plugin adds.",
          }),
        );
        return 0;
      }

      const { values, positionals } = parseFlags(argv, defs);

      // Re-read from the validated pass rather than trusting the lenient one.
      const storagePkg = values["storage"] as string;

      const [path, ...extra] = positionals;
      if (path === undefined) {
        throw new CliError(
          "No report file given. Pass the path to a JSON report to store.",
        );
      }
      if (extra.length > 0) {
        throw new CliError(
          `Expected a single report file but got ${positionals.length}: ${positionals.join(", ")}.`,
        );
      }

      const storage = await loadStorage(storagePkg);

      // Options are built before the file is read, matching generate: a bad
      // option fails before any work happens.
      const storageOptions = buildOptions("storage", storage, values);
      assertNoIssues(storageOptions.issues);

      const report = await readReport(path);

      const result = await storage.store({
        report,
        options: storageOptions.options,
      });

      printStored(report, result);
      return 0;
    });
  },
};
