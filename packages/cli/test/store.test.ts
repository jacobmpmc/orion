import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Report, StorageContext } from "@orion/core";
import { storeCommand } from "../src/commands/store.js";

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

const STORAGE = fixture("storage.mjs");

// The fixture's parse phase passes the raw values straight through, so its
// built options are still a plain record.
type FixtureOptions = Record<string, unknown>;

type RecordedCall = { role: string; context: StorageContext<FixtureOptions> };

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  calls: RecordedCall[];
}

const report: Report = {
  kind: "fixture",
  version: 2,
  generatedAt: "2026-08-06T09:30:00.000Z",
  data: { changes: 3 },
};

let root: string;
let reportPath: string;

async function write(name: string, contents: string): Promise<string> {
  const path = join(root, name);
  await writeFile(path, contents, "utf8");
  return path;
}

async function run(argv: string[]): Promise<RunResult> {
  let stdout = "";
  let stderr = "";

  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  });

  const code = await storeCommand.run(argv);
  const calls = ((globalThis as Record<string, unknown>)["__orionCalls"] ?? []) as RecordedCall[];

  return { code, stdout, stderr, calls };
}

function storageCall(calls: RecordedCall[]): StorageContext<FixtureOptions> {
  const found = calls.find((call) => call.role === "storage");
  if (found === undefined) throw new Error("storage was not invoked");
  return found.context;
}

beforeEach(async () => {
  (globalThis as Record<string, unknown>)["__orionCalls"] = [];
  root = await mkdtemp(join(tmpdir(), "orion-cli-store-"));
  reportPath = await write("report.json", JSON.stringify(report));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe("store", () => {
  const base = ["--storage", STORAGE, "--token", "sto-tok", "--bucket", "my-bucket"];

  it("hands the file's report to the storage plugin and reports where it landed", async () => {
    const result = await run([...base, reportPath]);

    expect(result.code).toBe(0);
    expect(storageCall(result.calls).report).toEqual(report);
    expect(result.stdout).toContain("Stored fixture report as fixture-001");
    expect(result.stdout).toContain("https://example.test/r/fixture-001");
  });

  it("gives the storage plugin the bare alias, with no reporter to claim it", async () => {
    const result = await run([...base, reportPath]);

    expect(storageCall(result.calls).options).toMatchObject({
      token: "sto-tok",
      bucket: "my-bucket",
    });
  });

  it("accepts a path relative to the working directory", async () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
    try {
      const result = await run([...base, "report.json"]);

      expect(result.code).toBe(0);
      expect(storageCall(result.calls).report).toEqual(report);
    } finally {
      cwd.mockRestore();
    }
  });

  it("tolerates a byte-order mark on a file written by a Windows tool", async () => {
    const path = await write("bom.json", `${String.fromCharCode(0xfeff)}${JSON.stringify(report)}`);
    const result = await run([...base, path]);

    expect(result.code).toBe(0);
    expect(storageCall(result.calls).report).toEqual(report);
  });

  it("omits the URL line when storage does not provide one", async () => {
    const result = await run(["--storage", fixture("storage-no-url.mjs"), reportPath]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("no-url-001");
    expect(result.stdout).not.toContain("https://");
  });

  describe("failures", () => {
    it("fails when --storage is missing", async () => {
      const result = await run([reportPath]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Missing required option --storage/);
    });

    it("fails when no report file is given", async () => {
      const result = await run(base);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/No report file given/);
    });

    it("fails when more than one file is given", async () => {
      const result = await run([...base, reportPath, reportPath]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Expected a single report file but got 2/);
    });

    it("fails when the file does not exist", async () => {
      const result = await run([...base, join(root, "missing.json")]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Could not read report file/);
      expect(result.calls).toHaveLength(0);
    });

    it("fails when the file is not JSON", async () => {
      const path = await write("junk.json", "not json at all");
      const result = await run([...base, path]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/is not valid JSON/);
      expect(result.calls).toHaveLength(0);
    });

    it("fails when the JSON is not a report envelope", async () => {
      const path = await write("other.json", JSON.stringify({ kind: "fixture", data: {} }));
      const result = await run([...base, path]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/is not an orion report/);
      expect(result.calls).toHaveLength(0);
    });

    it("fails on an unknown option", async () => {
      const result = await run([...base, "--nope", "x", reportPath]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Unknown option/);
    });

    it("fails when a required plugin option is missing", async () => {
      const result = await run(["--storage", STORAGE, "--token", "t", reportPath]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Missing required option --storage-bucket/);
    });

    it("fails when the storage plugin cannot be loaded", async () => {
      const result = await run(["--storage", "@orion/nope", reportPath]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Could not load plugin/);
    });

    it("rejects a reporter plugin passed as the storage plugin", async () => {
      const result = await run(["--storage", fixture("reporter.mjs"), reportPath]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/is a 'reporter' plugin/);
    });

    it("does not read the file when the plugin rejects its options", async () => {
      const result = await run(["--storage", fixture("rejecting-storage.mjs"), reportPath]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("--storage-region is not a known region.");
      expect(result.calls).toHaveLength(0);
    });
  });

  describe("--help", () => {
    it("lists core options without loading any plugin", async () => {
      const result = await run(["--help"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("--storage <string>");
      expect(result.stdout).not.toContain("--reporter");
      expect(result.stdout).toContain("Pass --storage to see the options");
    });

    it("lists the plugin's options once it is named", async () => {
      const result = await run(["--storage", STORAGE, "--help"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Storage plugin options:");
      expect(result.stdout).toContain("--storage-token, --token");
      expect(result.stdout).not.toContain("Pass --storage to see the options");
    });

    it("does not run the plugin", async () => {
      const result = await run(["--storage", STORAGE, "--help"]);

      expect(result.calls).toHaveLength(0);
    });
  });
});
