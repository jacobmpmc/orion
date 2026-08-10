import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { invalid, isReport, ok, stringOption } from "@orion/core";
import type {
  OptionIssue,
  ReadableStoragePlugin,
  Report,
  WritableStoragePlugin,
} from "@orion/core";
import { isContained, relativeTo } from "@orion/plugin-toolkit";

const EXTENSION = ".json";

/** What this plugin needs, once the raw flag values have been checked. */
export interface FilesystemStorageOptions {
  /** Absolute path of the directory reports are written into. */
  readonly root: string;
  /**
   * Root-relative file name to write, already checked for containment. Absent
   * when a name should be generated per report.
   */
  readonly name?: string;
}

/** Reduces arbitrary text to something safe to embed in a file name. */
function slug(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned === "" ? "report" : cleaned;
}

/**
 * A compact ISO-8601 stamp. The separators are stripped because a colon is not
 * a legal file name character on Windows.
 */
function stamp(generatedAt: string): string {
  const parsed = new Date(generatedAt);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

/**
 * Names are `<kind>-<timestamp>-<random>.json`. The timestamp keeps a directory
 * listing in generation order; the random suffix keeps two reports generated in
 * the same second from colliding.
 */
function defaultName(report: Report): string {
  return `${slug(report.kind)}-${stamp(report.generatedAt)}-${randomBytes(3).toString("hex")}${EXTENSION}`;
}

/**
 * Resolves a report's file inside `root` and derives the id the viewer is
 * given -- the root-relative path, always with forward slashes, so an id
 * written on Windows still resolves elsewhere.
 */
function target(root: string, name: string): { file: string; id: string } {
  const file = resolve(root, name);
  return { file, id: relativeTo(root, file) };
}

/**
 * True for the errors that mean "there is nothing there", as opposed to a fault
 * worth reporting. A path component that is a file rather than a directory, or
 * a directory where a file was expected, are both just misses.
 */
function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR";
}

// Annotated with both capabilities rather than the bare `StoragePlugin`, whose
// methods are optional: a misspelled method name would otherwise compile.
const plugin: WritableStoragePlugin<FilesystemStorageOptions> &
  ReadableStoragePlugin<FilesystemStorageOptions> = {
  kind: "storage",
  name: "filesystem",
  options: [
    {
      name: "path",
      type: "string",
      description: "Directory to write reports into. Created if missing",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "File name to write, relative to --storage-path. Default: generated",
    },
  ],

  parseOptions(values) {
    const issues: OptionIssue[] = [];

    const path = stringOption(values, "path");
    if (path === undefined) {
      issues.push({ option: "path", message: "is required: give a directory to write reports into." });
    }

    const root = path === undefined ? undefined : resolve(path);
    const name = stringOption(values, "name");

    // Only checkable once the root is known, so a missing --path suppresses it
    // rather than producing a second, misleading issue.
    if (root !== undefined && name !== undefined && !isContained(root, name)) {
      issues.push({
        option: "name",
        message: `must name a file inside ${root}, but '${name}' resolves outside it.`,
      });
    }

    if (issues.length > 0 || root === undefined) {
      return invalid(issues);
    }

    return ok({ root, ...(name !== undefined ? { name } : {}) });
  },

  async store({ report, options }) {
    const { file, id } = target(options.root, options.name ?? defaultName(report));

    // The name may carry subdirectories, so create the file's own parent rather
    // than just the root.
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    return { id, url: pathToFileURL(file).href };
  },

  async fetch({ id, options }) {
    // The id is a root-relative posix path this plugin itself produced, but by
    // the time it comes back it has been through a URL, so containment is
    // re-checked rather than assumed.
    if (!isContained(options.root, id)) return undefined;

    const { file } = target(options.root, id.split("/").join(sep));

    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }

    // A file that exists but is not a report is a real fault, not a miss: it
    // means something else is writing into the reports directory.
    const parsed: unknown = JSON.parse(text);
    if (!isReport(parsed)) {
      throw new Error(`${file} is not an Orion report.`);
    }

    return parsed;
  },
};

export default plugin;
