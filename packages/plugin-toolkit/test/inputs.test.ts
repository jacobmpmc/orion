import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { expandInputs } from "../src/index.js";

let root: string;

async function write(name: string, contents = "{}"): Promise<string> {
  const path = join(root, name);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents, "utf8");
  return path;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orion-inputs-"));
  await write("results-1.json");
  await write("results-2.json");
  await write("nested/results-3.json");
  await write("notes.txt");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("expandInputs", () => {
  it("resolves a literal path against the cwd", async () => {
    const found = await expandInputs(["results-1.json"], { cwd: root });

    expect(found).toEqual([resolve(root, "results-1.json")]);
  });

  it("expands a pattern", async () => {
    const found = await expandInputs(["results-*.json"], { cwd: root });

    expect(found.map((path) => path.replace(root, ""))).toHaveLength(2);
    expect(found.every((path) => path.startsWith(root))).toBe(true);
  });

  it("keeps input order and reads a file matched twice only once", async () => {
    const found = await expandInputs(["results-1.json", "results-*.json"], { cwd: root });

    expect(found[0]).toBe(resolve(root, "results-1.json"));
    expect(found).toHaveLength(2);
  });

  it("returns absolute paths for a pattern that walks into a subdirectory", async () => {
    const found = await expandInputs(["nested/*.json"], { cwd: root });

    expect(found).toEqual([resolve(root, "nested/results-3.json")]);
  });

  it("does not check that a literal path exists -- the reader reports that", async () => {
    const found = await expandInputs(["missing.json"], { cwd: root });

    expect(found).toEqual([resolve(root, "missing.json")]);
  });

  it("throws when a pattern matches nothing", async () => {
    await expect(expandInputs(["*.xml"], { cwd: root })).rejects.toThrow(
      /No files matched '\*\.xml'/,
    );
  });

  it("names every pattern when none matched", async () => {
    await expect(expandInputs(["*.xml", "*.tap"], { cwd: root })).rejects.toThrow(
      /'\*\.xml', '\*\.tap'/,
    );
  });

  it("throws when given no patterns at all", async () => {
    await expect(expandInputs([], { cwd: root })).rejects.toThrow(/No files matched/);
  });
});
