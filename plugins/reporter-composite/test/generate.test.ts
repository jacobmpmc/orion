import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isReport } from "@orion/core";
import type { Report } from "@orion/core";
import { COMPOSITE_KIND, isComposite } from "@orion/report-composite";
import type { CompositeData } from "@orion/report-composite";
import plugin from "../src/index.js";

let root: string;

/** Writes a child report to the temp directory and returns its path. */
async function place(name: string, report: Partial<Report> = {}): Promise<string> {
  const path = join(root, name);
  const child: Report = {
    kind: "test-results",
    version: 1,
    generatedAt: "2026-08-06T09:30:00.000Z",
    data: { tool: "vitest" },
    ...report,
  };
  await writeFile(path, JSON.stringify(child), "utf8");
  return path;
}

/** Runs the plugin the way a host would: parse phase first, then generate. */
async function generate(
  patterns: readonly string[],
  values: Record<string, string | readonly string[]> = {},
): Promise<Report> {
  const parsed = plugin.parseOptions(values);
  if (!parsed.ok) throw new Error(`unexpected issues: ${JSON.stringify(parsed.issues)}`);
  return plugin.generate({ patterns, options: parsed.options });
}

function dataOf(report: Report): CompositeData {
  if (!isComposite(report.data)) throw new Error("not a composite");
  return report.data;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orion-composite-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("generate", () => {
  it("builds a well-formed report", async () => {
    const report = await generate([await place("unit.json")]);

    expect(isReport(report)).toBe(true);
    expect(report.kind).toBe(COMPOSITE_KIND);
    expect(report.version).toBe(1);
    expect(Number.isNaN(new Date(report.generatedAt).getTime())).toBe(false);
    expect(isComposite(report.data)).toBe(true);
  });

  it("embeds each child report whole", async () => {
    const report = await generate([await place("unit.json")]);
    const [entry] = dataOf(report).entries;

    expect(entry?.report).toEqual({
      kind: "test-results",
      version: 1,
      generatedAt: "2026-08-06T09:30:00.000Z",
      data: { tool: "vitest" },
    });
  });

  it("titles an entry after the file it came from", async () => {
    const report = await generate([await place("unit-tests.json")]);

    expect(dataOf(report).entries[0]?.title).toBe("unit-tests");
  });

  it("carries the title it was given", async () => {
    const report = await generate([await place("unit.json")], { title: "Nightly" });

    expect(dataOf(report).title).toBe("Nightly");
  });

  it("leaves out a title it was not given", async () => {
    const report = await generate([await place("unit.json")]);

    expect("title" in dataOf(report)).toBe(false);
  });

  it("expands a glob across the reports a pipeline left behind", async () => {
    await place("a.json");
    await place("b.json");

    const report = await generate([join(root, "*.json")]);

    expect(dataOf(report).entries.map((entry) => entry.title)).toEqual(["a", "b"]);
  });

  it("appends refs after the embedded reports", async () => {
    const report = await generate([await place("unit.json")], {
      ref: "prod=reports/infra.json",
    });
    const { entries } = dataOf(report);

    expect(entries.map((entry) => entry.title)).toEqual(["unit", "prod/reports/infra.json"]);
    expect(entries[1]?.ref).toEqual({ connection: "prod", id: "reports/infra.json" });
    expect(entries[1]?.report).toBeUndefined();
  });

  it("does not try to reach the storage a ref names", async () => {
    const report = await generate([await place("unit.json")], { ref: "nowhere=missing.json" });

    expect(dataOf(report).entries).toHaveLength(2);
  });

  it("names the file when it does not exist", async () => {
    await expect(generate([join(root, "nope.json")])).rejects.toThrow(
      /Could not read .*nope\.json/,
    );
  });

  it("says so when a pattern matches nothing", async () => {
    await expect(generate([join(root, "*.xml")])).rejects.toThrow(/No files matched/);
  });

  it("distinguishes invalid JSON from the wrong kind of JSON", async () => {
    const path = join(root, "broken.json");
    await writeFile(path, "{ not json", "utf8");

    await expect(generate([path])).rejects.toThrow(/is not valid JSON/);
  });

  it("rejects JSON that is not an Orion report, and says what to pass instead", async () => {
    const path = join(root, "notes.json");
    await writeFile(path, JSON.stringify({ hello: "world" }), "utf8");

    await expect(generate([path])).rejects.toThrow(
      /notes\.json is not an Orion report.*orion generate/s,
    );
  });

  it("nests a composite inside a composite", async () => {
    const inner = await place("inner.json", { kind: COMPOSITE_KIND, data: { entries: [] } });
    const report = await generate([inner]);

    expect(dataOf(report).entries[0]?.report?.kind).toBe(COMPOSITE_KIND);
  });
});
