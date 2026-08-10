import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isReport } from "@orion/core";
import { isTestResults, TEST_RESULTS_KIND } from "@orion/report-test-results";
import plugin from "../src/index.js";

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

let root: string;

/** Copies a fixture into the temp directory under the given name. */
async function place(name: string, as = name): Promise<string> {
  const path = join(root, as);
  await copyFile(fixture(name), path);
  return path;
}

/** Runs the plugin the way a host would: parse phase first, then generate. */
async function generate(patterns: readonly string[], values: Record<string, string | boolean> = {}) {
  const parsed = plugin.parseOptions({ root, ...values });
  if (!parsed.ok) throw new Error(`unexpected issues: ${JSON.stringify(parsed.issues)}`);
  return plugin.generate({ patterns, options: parsed.options });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orion-vitest-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("generate", () => {
  it("builds a well-formed report", async () => {
    const path = await place("mixed.json");
    const report = await generate([path]);

    expect(isReport(report)).toBe(true);
    expect(report.kind).toBe(TEST_RESULTS_KIND);
    expect(report.version).toBe(1);
    expect(Number.isNaN(new Date(report.generatedAt).getTime())).toBe(false);
    expect(isTestResults(report.data)).toBe(true);
  });

  it("expands a glob across a sharded run", async () => {
    await place("shard-a.json", "results-1.json");
    await place("shard-b.json", "results-2.json");

    const report = await generate([join(root, "results-*.json")]);
    const data = report.data as { totals: { tests: number }; sources: readonly string[] };

    expect(data.totals.tests).toBe(3);
    expect(data.sources).toHaveLength(2);
  });

  it("reads a file matched by both a glob and a literal path only once", async () => {
    await place("shard-a.json", "results-1.json");

    const report = await generate([join(root, "results-1.json"), join(root, "results-*.json")]);
    const data = report.data as { sources: readonly string[] };

    expect(data.sources).toHaveLength(1);
  });

  it("names the file when it does not exist", async () => {
    const missing = join(root, "nope.json");

    await expect(generate([missing])).rejects.toThrow(/Could not read .*nope\.json/);
  });

  it("says so when a pattern matches nothing", async () => {
    await expect(generate([join(root, "*.xml")])).rejects.toThrow(/No files matched/);
  });

  it("distinguishes invalid JSON from the wrong kind of JSON", async () => {
    const path = join(root, "broken.json");
    await writeFile(path, "{ not json", "utf8");

    await expect(generate([path])).rejects.toThrow(/is not valid JSON/);
  });

  it("rejects JSON that is not a runner result file, and says how to make one", async () => {
    const path = await place("not-vitest.json");

    await expect(generate([path])).rejects.toThrow(
      /is not a vitest JSON result file.*--reporter=json/s,
    );
  });

  it("reports paths relative to --root", async () => {
    const path = await place("mixed.json");
    const report = await generate([path], { root: resolve("/repo") });
    const data = report.data as { files: readonly { path: string }[] };

    expect(data.files.map((file) => file.path)).toContain("src/math.test.ts");
  });
});
