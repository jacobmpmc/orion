import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJsonFile } from "../src/index.js";

let root: string;

async function write(name: string, contents: string): Promise<string> {
  const path = join(root, name);
  await writeFile(path, contents, "utf8");
  return path;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orion-toolkit-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("readJsonFile", () => {
  it("parses a JSON file", async () => {
    const path = await write("data.json", JSON.stringify({ tests: 3 }));

    await expect(readJsonFile(path)).resolves.toEqual({ tests: 3 });
  });

  it("tolerates a byte-order mark", async () => {
    const path = await write("bom.json", `${String.fromCharCode(0xfeff)}{"tests":3}`);

    await expect(readJsonFile(path)).resolves.toEqual({ tests: 3 });
  });

  it("names the file when it cannot be read", async () => {
    const path = join(root, "missing.json");

    await expect(readJsonFile(path)).rejects.toThrow(/Could not read .*missing\.json/);
  });

  it("distinguishes unreadable from unparseable", async () => {
    const path = await write("junk.json", "not json");

    await expect(readJsonFile(path)).rejects.toThrow(/junk\.json is not valid JSON/);
  });
});
