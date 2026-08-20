import { resolve } from "node:path";
import { booleanOption, invalid, numberOption, ok, stringOption } from "@orion/core";
import type { OptionIssue, ReporterPlugin } from "@orion/core";
import { expandInputs, readJsonFile } from "@orion/plugin-toolkit";
import { PULUMI_DIFF_KIND, PULUMI_DIFF_VERSION } from "@orion/report-pulumi-diff";
import { mapDigest, type Run } from "./map.js";
import { isPreviewDigest } from "./pulumi.js";

/** What this plugin needs, once the raw flag values have been checked. */
export interface PulumiDiffReporterOptions {
  /** Absolute directory that `sources` is reported relative to. */
  readonly root: string;
  /** The stack to report when the preview's URNs do not name one. */
  readonly stack?: string;
  /** True to carry each changed property's before and after value. */
  readonly values: boolean;
  /** Strings longer than this are truncated. */
  readonly maxValueLength: number;
  /** True to keep unchanged resources in the resource list. */
  readonly same: boolean;
}

/** Reads one preview digest, naming the file in anything that goes wrong. */
async function readDigest(source: string): Promise<Run> {
  const parsed = await readJsonFile(source);

  if (!isPreviewDigest(parsed)) {
    throw new Error(
      `${source} is not a pulumi preview digest. Produce one with: pulumi preview --json > preview.json`,
    );
  }

  return { source, digest: parsed };
}

const plugin: ReporterPlugin<PulumiDiffReporterOptions> = {
  kind: "reporter",
  name: "pulumi-diff",
  options: [
    {
      name: "stack",
      type: "string",
      description: "Stack to report. Default: the stack named by the preview's URNs",
    },
    {
      // Named for the off-state, not the on-state: on the command line a
      // boolean is presence -- `--values` could only ever turn values *on*, and
      // they are on already. A flag has to be able to say the thing that is not
      // the default.
      name: "omit-values",
      type: "boolean",
      description:
        "Carry only the paths of changed properties, not their before and after values. Secrets are redacted either way",
      default: false,
    },
    {
      name: "max-value-length",
      type: "number",
      description: "Truncate property values longer than this many characters",
      default: 2000,
    },
    {
      name: "same",
      type: "boolean",
      description: "Keep unchanged resources in the report. They are counted in the totals either way",
      default: false,
    },
    {
      name: "root",
      type: "string",
      description: "Directory the reported source path is relative to. Default: the working directory",
    },
  ],

  parseOptions(values) {
    const issues: OptionIssue[] = [];

    // Present-but-unusable is the case worth reporting: the viewer's config
    // file is arbitrary JavaScript, so a value can arrive uncoerced, and a
    // blank string is a mistake rather than a request for the default.
    const root = stringOption(values, "root");
    if (root === undefined && values["root"] !== undefined) {
      issues.push({ option: "root", message: "must be a directory path." });
    }

    const stack = stringOption(values, "stack");
    if (stack === undefined && values["stack"] !== undefined) {
      issues.push({ option: "stack", message: "must be a stack name." });
    }

    const omitValues = booleanOption(values, "omit-values");
    if (omitValues === undefined && values["omit-values"] !== undefined) {
      issues.push({ option: "omit-values", message: "must be true or false." });
    }

    const same = booleanOption(values, "same");
    if (same === undefined && values["same"] !== undefined) {
      issues.push({ option: "same", message: "must be true or false." });
    }

    const maxValueLength = numberOption(values, "max-value-length");
    if (maxValueLength === undefined && values["max-value-length"] !== undefined) {
      issues.push({ option: "max-value-length", message: "must be a number." });
    } else if (maxValueLength !== undefined && maxValueLength < 1) {
      // Zero would truncate every value to nothing, which is what
      // `--omit-values` is for and says so much more clearly.
      issues.push({
        option: "max-value-length",
        message: "must be at least 1. To drop values entirely, use --omit-values.",
      });
    }

    if (issues.length > 0) {
      return invalid(issues);
    }

    return ok({
      root: resolve(root ?? "."),
      ...(stack !== undefined ? { stack } : {}),
      values: !(omitValues ?? false),
      maxValueLength: maxValueLength ?? 2000,
      same: same ?? false,
    });
  },

  async generate({ patterns, options }) {
    // Asked before expanding, because expansion's own answer for nothing at all
    // is "no files matched .", which describes the glob rather than the
    // mistake.
    if (patterns.length === 0) {
      throw new Error(
        "No preview digest given. Pass the file pulumi preview --json wrote, e.g. orion generate --reporter pulumi-diff preview.json",
      );
    }

    // The CLI hands positionals over untouched, so expanding them is this
    // plugin's job. Expanded against the working directory, not --root: the
    // positionals are paths the user just typed, while --root only says what
    // the path recorded *in* the report is relative to.
    const sources = await expandInputs(patterns);

    // Exactly one, unlike a sharded test run: two previews are two different
    // stacks, and merging them would report one deployment that nobody is
    // about to make.
    const [source, ...extra] = sources;
    if (source === undefined) {
      throw new Error(`No preview digest matched ${patterns.join(", ")}.`);
    }
    if (extra.length > 0) {
      throw new Error(
        `Expected one preview digest, got ${sources.length}: ${sources.join(", ")}. A preview covers one stack, so merging them would describe a deployment nobody is making. Generate one report per stack and combine them with @orion/plugin-reporter-composite.`,
      );
    }

    return {
      kind: PULUMI_DIFF_KIND,
      version: PULUMI_DIFF_VERSION,
      generatedAt: new Date().toISOString(),
      data: mapDigest(await readDigest(source), options),
    };
  },
};

export default plugin;
export { foldKind, foldOp, foldSteps, mapDigest, pathSegments, sanitize, totalsFor, valueAt } from "./map.js";
export type { MapOptions, Run } from "./map.js";
export { isPreviewDigest, parseUrn, providerUrn } from "./pulumi.js";
export type {
  DiffEntry,
  PreviewDiagnostic,
  PreviewDigest,
  PreviewStep,
  StepOp,
  StepState,
} from "./pulumi.js";
