import { resolve } from "node:path";
import { booleanOption, invalid, ok, stringOption } from "@orion/core";
import type { OptionIssue, ReporterPlugin } from "@orion/core";
import { expandInputs, readJsonFile } from "@orion/plugin-toolkit";
import { TEST_RESULTS_KIND, TEST_RESULTS_VERSION } from "@orion/report-test-results";
import { mergeRuns, type Run } from "./map.js";
import { isVitestResults } from "./vitest.js";

/** What this plugin needs, once the raw flag values have been checked. */
export interface VitestReporterOptions {
  /** Absolute directory that reported file paths are relative to. */
  readonly root: string;
  /** True to report paths exactly as the runner emitted them. */
  readonly absolutePaths: boolean;
}

/** Reads one runner output file, naming it in anything that goes wrong. */
async function readRun(source: string): Promise<Run> {
  const parsed = await readJsonFile(source);

  if (!isVitestResults(parsed)) {
    throw new Error(
      `${source} is not a vitest JSON result file. Produce one with: vitest run --reporter=json --outputFile=results.json`,
    );
  }

  return { source, results: parsed };
}

const plugin: ReporterPlugin<VitestReporterOptions> = {
  kind: "reporter",
  name: "vitest",
  options: [
    {
      name: "root",
      type: "string",
      description: "Directory reported file paths are relative to. Default: the working directory",
    },
    {
      name: "absolute-paths",
      type: "boolean",
      description: "Report file paths as the runner emitted them, unrelativised",
    },
  ],

  parseOptions(values) {
    const issues: OptionIssue[] = [];

    // Present-but-unusable is the case worth reporting: the viewer's config
    // file is arbitrary JavaScript, so a value can arrive uncoerced, and a
    // blank string is a mistake rather than a request for the current
    // directory.
    const root = stringOption(values, "root");
    if (root === undefined && values["root"] !== undefined) {
      issues.push({ option: "root", message: "must be a directory path." });
    }

    const absolutePaths = booleanOption(values, "absolute-paths");
    if (absolutePaths === undefined && values["absolute-paths"] !== undefined) {
      issues.push({ option: "absolute-paths", message: "must be true or false." });
    }

    if (issues.length > 0) {
      return invalid(issues);
    }

    return ok({ root: resolve(root ?? "."), absolutePaths: absolutePaths ?? false });
  },

  async generate({ patterns, options }) {
    // The CLI hands positionals over untouched, so expanding them is this
    // plugin's job. A sharded run writes one file per shard; they merge.
    //
    // Expanded against the working directory, not --root: the positionals are
    // paths the user just typed, while --root only says what the paths *inside*
    // the results are relative to. The two are routinely different directories.
    const sources = await expandInputs(patterns);
    const runs: Run[] = [];
    for (const source of sources) {
      runs.push(await readRun(source));
    }

    return {
      kind: TEST_RESULTS_KIND,
      version: TEST_RESULTS_VERSION,
      generatedAt: new Date().toISOString(),
      data: mergeRuns(runs, options),
    };
  },
};

export default plugin;
export type { MapOptions, Run } from "./map.js";
export { mergeRuns } from "./map.js";
export { isVitestResults } from "./vitest.js";
export type { VitestAssertion, VitestFile, VitestResults, VitestStatus } from "./vitest.js";
