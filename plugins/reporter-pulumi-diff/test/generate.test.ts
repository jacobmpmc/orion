import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isReport } from "@orion/core";
import { isPulumiDiff, PULUMI_DIFF_KIND } from "@orion/report-pulumi-diff";
import type { PulumiDiffData } from "@orion/report-pulumi-diff";
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
async function generate(
  patterns: readonly string[],
  values: Record<string, string | number | boolean> = {},
) {
  const parsed = plugin.parseOptions({ root, ...values });
  if (!parsed.ok) throw new Error(`unexpected issues: ${JSON.stringify(parsed.issues)}`);
  return plugin.generate({ patterns, options: parsed.options });
}

/** Generates from the main fixture and hands back the narrowed data. */
async function preview(values: Record<string, string | number | boolean> = {}) {
  const report = await generate([await place("preview.json")], values);
  if (!isPulumiDiff(report.data)) throw new Error("the report did not match its own schema");
  return report.data;
}

function resource(data: PulumiDiffData, name: string) {
  return data.resources.find((entry) => entry.name === name);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orion-pulumi-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("generate", () => {
  it("builds a well-formed report", async () => {
    const report = await generate([await place("preview.json")]);

    expect(isReport(report)).toBe(true);
    expect(report.kind).toBe(PULUMI_DIFF_KIND);
    expect(report.version).toBe(1);
    expect(Number.isNaN(new Date(report.generatedAt).getTime())).toBe(false);
    expect(isPulumiDiff(report.data)).toBe(true);
  });

  it("names the stack and project the preview covered", async () => {
    const data = await preview();
    expect(data.stack).toBe("prod");
    expect(data.project).toBe("infra");
  });

  it("reports a replacement as one resource, not three steps", async () => {
    const data = await preview();
    const workers = data.resources.filter((entry) => entry.name === "worker");

    expect(workers).toHaveLength(1);
    expect(workers[0]?.op).toBe("replace");
  });

  it("counts unchanged resources without listing them", async () => {
    const data = await preview();

    expect(data.resources.every((entry) => entry.op !== "same")).toBe(true);
    expect(data.totals.counts.same).toBe(2);
    expect(data.totals.resources).toBe(data.resources.length + 2);
    expect(data.totals.changed).toBe(data.resources.length);
  });

  it("agrees with itself: the counts are the list", async () => {
    const data = await preview({ same: true });
    const counted = Object.values(data.totals.counts).reduce((sum, count) => sum + count, 0);

    expect(counted).toBe(data.resources.length);
    expect(data.totals.resources).toBe(data.resources.length);
  });

  it("carries the properties that changed, with their values", async () => {
    const bucket = resource(await preview(), "assets");
    const change = bucket?.changes?.find((entry) => entry.path === 'tags["env"]');

    expect(change).toEqual({
      path: 'tags["env"]',
      kind: "update",
      replaces: false,
      before: "staging",
      after: "prod",
    });
  });

  it("marks the property that forces a replacement", async () => {
    const worker = resource(await preview(), "worker");
    expect(worker?.changes?.find((entry) => entry.path === "ami")?.replaces).toBe(true);
  });

  it("redacts a secret rather than storing its plaintext", async () => {
    const report = await generate([await place("preview.json")]);
    const stored = JSON.stringify(report);

    expect(stored).not.toContain("correct-horse-battery-staple");
    expect(stored).toContain("orionSecret");
  });

  it("leaves stack configuration out of the report entirely", async () => {
    const report = await generate([await place("preview.json")]);

    expect(JSON.stringify(report)).not.toContain("hunter2-in-config-and-never-in-a-report");
  });

  it("truncates an over-long value", async () => {
    const bucket = resource(await preview({ "max-value-length": 20 }), "assets");
    const policy = bucket?.changes?.find((entry) => entry.path === "policy");

    expect(policy?.before).toMatchObject({ orionTruncated: true });
  });

  it("carries paths without values when asked", async () => {
    const bucket = resource(await preview({ "omit-values": true }), "assets");

    expect(bucket?.changes?.length).toBeGreaterThan(0);
    expect(bucket?.changes?.every((entry) => entry.before === undefined)).toBe(true);
    expect(bucket?.changes?.every((entry) => entry.after === undefined)).toBe(true);
  });

  it("reads a resource's own type out of its type chain", async () => {
    expect(resource(await preview(), "legacy")?.type).toBe("aws:ec2/subnet:Subnet");
  });

  it("carries the preview's warnings, which are often why a diff is rejected", async () => {
    expect((await preview()).diagnostics).toEqual([
      {
        severity: "warning",
        message: "aws:s3/bucket:Bucket is deprecated; use aws:s3/bucketV2:BucketV2",
        urn: "urn:pulumi:prod::infra::aws:s3/bucket:Bucket::assets",
      },
    ]);
  });

  it("reports a preview with nothing to do", async () => {
    const report = await generate([await place("no-changes.json")]);
    const data = report.data as PulumiDiffData;

    expect(data.resources).toEqual([]);
    expect(data.totals.changed).toBe(0);
    expect(data.success).toBe(true);
  });

  it("still reports a preview that failed", async () => {
    const report = await generate([await place("failed.json")]);
    const data = report.data as PulumiDiffData;

    expect(isPulumiDiff(data)).toBe(true);
    expect(data.success).toBe(false);
  });

  it("reports the source relative to --root", async () => {
    await place("preview.json");
    const report = await generate([join(root, "preview.json")]);

    expect((report.data as PulumiDiffData).sources).toEqual(["preview.json"]);
  });

  it("names the file when it does not exist", async () => {
    await expect(generate([join(root, "nope.json")])).rejects.toThrow(/Could not read .*nope\.json/);
  });

  it("says so when a pattern matches nothing", async () => {
    await expect(generate([join(root, "*.yaml")])).rejects.toThrow(/No files matched/);
  });

  it("distinguishes invalid JSON from the wrong kind of JSON", async () => {
    const path = join(root, "broken.json");
    await writeFile(path, "{ not json", "utf8");

    await expect(generate([path])).rejects.toThrow(/is not valid JSON/);
  });

  it("rejects JSON that is not a preview digest, and says how to make one", async () => {
    const path = await place("not-pulumi.json");

    await expect(generate([path])).rejects.toThrow(
      /is not a pulumi preview digest.*pulumi preview --json/s,
    );
  });

  it("refuses two previews, and says what to do instead", async () => {
    await place("preview.json", "prod.json");
    await place("no-changes.json", "dev.json");

    await expect(generate([join(root, "*.json")])).rejects.toThrow(
      /Expected one preview digest, got 2.*reporter-composite/s,
    );
  });

  it("asks for a file when given none", async () => {
    await expect(generate([])).rejects.toThrow(/No preview digest given/);
  });
});
