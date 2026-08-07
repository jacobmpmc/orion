import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OptionIssue, OptionValues, Report } from "@orion/core";
import plugin, { type FilesystemStorageOptions } from "../src/index.js";

const report: Report = {
  kind: "pulumi-diff",
  version: 1,
  generatedAt: "2026-08-06T09:30:00.000Z",
  data: { changes: [{ resource: "bucket", op: "update" }] },
};

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orion-storage-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Runs the parse phase, failing the test if it reported issues. */
function options(values: OptionValues): FilesystemStorageOptions {
  const result = plugin.parseOptions(values);
  if (!result.ok) throw new Error(`unexpected issues: ${JSON.stringify(result.issues)}`);
  return result.options;
}

/** Runs the parse phase, failing the test if it succeeded. */
function issues(values: OptionValues): readonly OptionIssue[] {
  const result = plugin.parseOptions(values);
  if (result.ok) throw new Error("expected the options to be rejected");
  return result.issues;
}

async function readReport(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

describe("filesystem storage plugin", () => {
  it("declares itself as a storage plugin", () => {
    expect(plugin.kind).toBe("storage");
    expect(plugin.name).toBe("filesystem");
  });

  describe("parseOptions", () => {
    it("resolves the path to an absolute root", () => {
      expect(options({ path: "reports" }).root).toBe(resolve("reports"));
    });

    it("leaves the name absent when none was given", () => {
      expect(options({ path: root }).name).toBeUndefined();
    });

    it("keeps an explicit name", () => {
      expect(options({ path: root, name: "latest.json" }).name).toBe("latest.json");
    });

    it("reports a missing path against --path", () => {
      expect(issues({})).toEqual([
        { option: "path", message: expect.stringContaining("is required") },
      ]);
    });

    it("treats a blank path as missing", () => {
      expect(issues({ path: "  " })).toHaveLength(1);
    });

    it("rejects a name that escapes the path", () => {
      expect(issues({ path: root, name: "../escaped.json" })).toEqual([
        { option: "name", message: expect.stringContaining("resolves outside it") },
      ]);
    });

    it("rejects an absolute name", () => {
      expect(issues({ path: root, name: join(tmpdir(), "elsewhere.json") })).toHaveLength(1);
    });

    it("does not fault the name when the path is missing", () => {
      const reported = issues({ name: "../escaped.json" });

      expect(reported).toHaveLength(1);
      expect(reported[0]?.option).toBe("path");
    });

    it("accepts a name with subdirectories", () => {
      expect(options({ path: root, name: "builds/42/diff.json" }).name).toBe("builds/42/diff.json");
    });
  });

  describe("store", () => {
    it("writes the report as JSON under the given path", async () => {
      const result = await plugin.store({ report, options: options({ path: root }) });

      expect(await readReport(join(root, result.id))).toEqual(report);
    });

    it("returns a file: url pointing at the written file", async () => {
      const result = await plugin.store({ report, options: options({ path: root }) });

      expect(result.url).toBeDefined();
      expect(fileURLToPath(result.url as string)).toBe(join(root, result.id));
    });

    it("names the file after the report kind and generation time", async () => {
      const result = await plugin.store({ report, options: options({ path: root }) });

      expect(result.id).toMatch(/^pulumi-diff-20260806T093000Z-[0-9a-f]{6}\.json$/);
    });

    it("does not collide when two reports share a timestamp", async () => {
      const first = await plugin.store({ report, options: options({ path: root }) });
      const second = await plugin.store({ report, options: options({ path: root }) });

      expect(first.id).not.toBe(second.id);
    });

    it("falls back to the current time when generatedAt is unusable", async () => {
      const result = await plugin.store({
        report: { ...report, generatedAt: "not a date" },
        options: options({ path: root }),
      });

      expect(result.id).toMatch(/^pulumi-diff-\d{8}T\d{6}Z-[0-9a-f]{6}\.json$/);
    });

    it("creates the directory when it does not exist", async () => {
      const nested = join(root, "reports", "ci");

      const result = await plugin.store({ report, options: options({ path: nested }) });

      expect(await readReport(join(nested, result.id))).toEqual(report);
    });

    it("uses an explicit name when given", async () => {
      const result = await plugin.store({
        report,
        options: options({ path: root, name: "latest.json" }),
      });

      expect(result.id).toBe("latest.json");
      expect(await readReport(join(root, "latest.json"))).toEqual(report);
    });

    it("overwrites an existing file of the same name", async () => {
      const built = options({ path: root, name: "latest.json" });
      await plugin.store({ report, options: built });
      const replacement = { ...report, version: 2 };

      await plugin.store({ report: replacement, options: built });

      expect(await readReport(join(root, "latest.json"))).toEqual(replacement);
    });

    it("creates a subdirectory named by the option and reports a posix id", async () => {
      const result = await plugin.store({
        report,
        options: options({ path: root, name: join("builds", "42", "diff.json") }),
      });

      expect(result.id).toBe("builds/42/diff.json");
      expect(await readReport(join(root, "builds", "42", "diff.json"))).toEqual(report);
    });
  });
});
