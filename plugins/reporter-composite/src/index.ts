import { invalid, isReport, ok, listOption, stringOption } from "@orion/core";
import type { OptionIssue, ReporterPlugin, Report } from "@orion/core";
import { expandInputs, readJsonFile } from "@orion/plugin-toolkit";
import { COMPOSITE_KIND, COMPOSITE_VERSION } from "@orion/report-composite";
import type { CompositeEntry, CompositeRef } from "@orion/report-composite";
import { inlineEntry, parseRef, refEntry } from "./entries.js";

/** What this plugin needs, once the raw flag values have been checked. */
export interface CompositeReporterOptions {
  /** A name for the collection as a whole. */
  readonly title?: string;
  /** Children to reference rather than embed, in the order they were given. */
  readonly refs: readonly CompositeRef[];
}

/** Reads one already-generated report, naming it in anything that goes wrong. */
async function readReport(source: string): Promise<Report> {
  const parsed = await readJsonFile(source);

  if (!isReport(parsed)) {
    throw new Error(
      `${source} is not an Orion report. Pass the JSON files that 'orion generate' produced.`,
    );
  }

  return parsed;
}

const plugin: ReporterPlugin<CompositeReporterOptions> = {
  kind: "reporter",
  name: "composite",
  options: [
    {
      name: "title",
      type: "string",
      description: "Name for the collection as a whole, e.g. the pipeline that produced it",
    },
    {
      name: "ref",
      type: "string",
      multiple: true,
      description:
        "Reference a stored report instead of embedding one, as connection=id. Repeatable",
    },
  ],

  parseOptions(values) {
    const issues: OptionIssue[] = [];

    // Present-but-unusable is the case worth reporting: a blank title is a
    // mistake rather than a request for no title.
    const title = stringOption(values, "title");
    if (title === undefined && values["title"] !== undefined) {
      issues.push({ option: "title", message: "must be a name." });
    }

    const refs: CompositeRef[] = [];
    for (const value of listOption(values, "ref")) {
      const ref = parseRef(value);
      if (ref === undefined) {
        // One issue per bad value, so a run with three typos is fixed once.
        issues.push({
          option: "ref",
          message: `'${value}' must be a connection and an id, as connection=id.`,
        });
        continue;
      }
      refs.push(ref);
    }

    if (issues.length > 0) {
      return invalid(issues);
    }

    return ok({ ...(title !== undefined ? { title } : {}), refs });
  },

  async generate({ patterns, options }) {
    // The CLI hands positionals over untouched, so expanding them is this
    // plugin's job -- and a pipeline that wrote one report per step names them
    // with a glob far more readily than one by one.
    const sources = await expandInputs(patterns);

    const entries: CompositeEntry[] = [];
    for (const source of sources) {
      entries.push(inlineEntry(source, await readReport(source)));
    }

    // Refs last, and unverified: this machine may have no route to the storage
    // a ref names, and failing generation over that would make a composite
    // impossible to produce from a job that only uploads.
    for (const ref of options.refs) {
      entries.push(refEntry(ref));
    }

    return {
      kind: COMPOSITE_KIND,
      version: COMPOSITE_VERSION,
      generatedAt: new Date().toISOString(),
      data: {
        ...(options.title !== undefined ? { title: options.title } : {}),
        entries,
      },
    };
  },
};

export default plugin;
export { inlineEntry, parseRef, refEntry, titleFor } from "./entries.js";
