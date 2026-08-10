import { readFile } from "node:fs/promises";

const BOM = String.fromCharCode(0xfeff);

/**
 * Reads and parses a JSON file, failing with a message written for the person
 * who named the file.
 *
 * A plugin has no way to report a runtime fault other than throwing, and
 * whatever it throws is what the user sees, so the two failure modes are
 * separated: "I could not read this" and "this is not JSON" need different
 * fixes. The underlying error is quoted rather than swallowed -- a permission
 * error and a missing file both surface as `ENOENT`-style detail that matters.
 *
 * A leading byte-order mark is tolerated. Tools on Windows emit one and
 * `JSON.parse` rejects it, which is not the user's mistake to fix.
 */
export async function readJsonFile(file: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    throw new Error(
      `Could not read ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    return JSON.parse(text.startsWith(BOM) ? text.slice(BOM.length) : text);
  } catch (error) {
    throw new Error(
      `${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
