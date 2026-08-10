/**
 * Parsing for `--metadata key=value`.
 *
 * Splitting the pair is deliberately not `args.ts`'s job. `OptionSpec.type` is
 * a vocabulary shared with every plugin and with the viewer's config file;
 * adding a `pair` type there to serve one core CLI flag would push a CLI-only
 * concern into `@orion/core`. `--metadata` is an ordinary repeatable string
 * option as far as the parser is concerned, and the pair rule lives here.
 */

/** Conservative on purpose: a metadata key ends up as a JSON key and a label. */
const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Caps, so that a mistake -- a loop appending an entry, a whole file piped into
 * one value -- cannot quietly inflate every stored report.
 */
const MAX_ENTRIES = 32;
const MAX_VALUE = 1024;

export interface CustomResult {
  readonly entries: Record<string, string>;
  /** Messages ready to be shown; empty when every entry parsed. */
  readonly issues: readonly string[];
}

export function parseCustomEntries(raw: readonly string[]): CustomResult {
  const entries: Record<string, string> = {};
  const issues: string[] = [];

  for (const item of raw) {
    // First `=` only: a value may legitimately contain more, base64 especially.
    const separator = item.indexOf("=");
    if (separator === -1) {
      issues.push(`--metadata expects key=value but got '${item}'.`);
      continue;
    }

    const key = item.slice(0, separator).trim();
    if (!KEY.test(key)) {
      issues.push(
        `--metadata key '${key}' is not usable; use letters, digits, '.', '_' or '-', starting with a letter or digit.`,
      );
      continue;
    }

    const value = item.slice(separator + 1);
    if (value.length > MAX_VALUE) {
      issues.push(`--metadata value for '${key}' is longer than ${MAX_VALUE} characters.`);
      continue;
    }

    // Last one wins, matching how a repeated single-valued flag behaves.
    entries[key] = value;
  }

  const count = Object.keys(entries).length;
  if (count > MAX_ENTRIES) {
    issues.push(`--metadata accepts at most ${MAX_ENTRIES} entries but got ${count}.`);
  }

  return { entries, issues };
}
