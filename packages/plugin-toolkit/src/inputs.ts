import { glob } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Characters that make a positional a pattern rather than a file name.
 *
 * A positional without any of them is treated as a literal path: expanding
 * `results.json` as a glob would silently yield nothing when the file is
 * missing, and "no files matched" is a much worse answer than "no such file".
 */
const MAGIC = /[*?[\]{}]/;

export interface ExpandOptions {
  /** Directory patterns are resolved against. Defaults to the working directory. */
  readonly cwd?: string;
}

/**
 * Expands the positionals handed to a reporter into absolute file paths.
 *
 * The CLI passes positionals through **verbatim** -- only the reporter knows
 * whether an input is a file, a directory or a set -- so expansion is the
 * plugin's job, and this is it. Results are deduplicated by resolved path with
 * the first occurrence winning, so `results-*.json results-1.json` reads each
 * file once and in the order the user wrote them.
 *
 * Throws when nothing matched at all. A run that silently reports on zero files
 * looks like a passing run, which is the worst possible failure mode for a
 * report about tests.
 */
export async function expandInputs(
  patterns: readonly string[],
  options: ExpandOptions = {},
): Promise<string[]> {
  const cwd = options.cwd ?? process.cwd();
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (path: string): void => {
    const absolute = resolve(cwd, path);
    if (seen.has(absolute)) return;
    seen.add(absolute);
    found.push(absolute);
  };

  for (const pattern of patterns) {
    if (!MAGIC.test(pattern)) {
      add(pattern);
      continue;
    }
    // Matches come back relative to cwd, and with the platform's separator.
    for await (const match of glob(pattern, { cwd })) {
      add(match);
    }
  }

  if (found.length === 0) {
    throw new Error(
      `No files matched ${patterns.map((pattern) => `'${pattern}'`).join(", ")}.`,
    );
  }

  return found;
}
