import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OptionValues, Report } from "@orion/core";
import plugin, { type FilesystemStorageOptions } from "../src/index.js";

const report: Report = {
  kind: "pulumi-diff",
  version: 1,
  generatedAt: "2026-08-06T09:30:00.000Z",
  data: { changes: [{ resource: "bucket", op: "update" }] },
};

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orion-fetch-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function options(values: OptionValues): FilesystemStorageOptions {
  const result = plugin.parseOptions(values);
  if (!result.ok) throw new Error(`unexpected issues: ${JSON.stringify(result.issues)}`);
  return result.options;
}

describe("fetch", () => {
  it("reads back a report that store() wrote", async () => {
    const opts = options({ path: root });
    const { id } = await plugin.store({ report, options: opts });

    await expect(plugin.fetch({ id, options: opts })).resolves.toEqual(report);
  });

  it("reads back a report stored under a subdirectory", async () => {
    const opts = options({ path: root, name: "runs/42/diff.json" });
    const { id } = await plugin.store({ report, options: opts });

    expect(id).toBe("runs/42/diff.json");
    await expect(plugin.fetch({ id, options: opts })).resolves.toEqual(report);
  });

  it("resolves undefined when no report has that id", async () => {
    await expect(plugin.fetch({ id: "nope.json", options: options({ path: root }) })).resolves.toBe(
      undefined,
    );
  });

  it("resolves undefined when a path component is not a directory", async () => {
    await writeFile(join(root, "a.json"), "{}", "utf8");

    await expect(
      plugin.fetch({ id: "a.json/b.json", options: options({ path: root }) }),
    ).resolves.toBe(undefined);
  });

  it("resolves undefined for an id that escapes the root", async () => {
    await expect(
      plugin.fetch({ id: "../outside.json", options: options({ path: root }) }),
    ).resolves.toBe(undefined);
  });

  it("resolves undefined for an id naming the root itself", async () => {
    await expect(plugin.fetch({ id: "", options: options({ path: root }) })).resolves.toBe(
      undefined,
    );
  });

  it("throws when the file is not valid JSON", async () => {
    await writeFile(join(root, "broken.json"), "{ not json", "utf8");

    await expect(
      plugin.fetch({ id: "broken.json", options: options({ path: root }) }),
    ).rejects.toThrow();
  });

  it("throws when the file is JSON but not a report", async () => {
    await writeFile(join(root, "other.json"), JSON.stringify({ hello: "world" }), "utf8");

    await expect(
      plugin.fetch({ id: "other.json", options: options({ path: root }) }),
    ).rejects.toThrow(/is not an Orion report/);
  });

  it("reads a report written by something other than store()", async () => {
    await mkdir(join(root, "ci"), { recursive: true });
    await writeFile(join(root, "ci", "run.json"), JSON.stringify(report), "utf8");

    await expect(
      plugin.fetch({ id: "ci/run.json", options: options({ path: root }) }),
    ).resolves.toEqual(report);
  });
});
