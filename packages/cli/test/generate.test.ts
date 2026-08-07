import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReporterContext, StorageContext } from "@orion/core";
import { generateCommand } from "../src/commands/generate.js";

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

const REPORTER = fixture("reporter.mjs");
const STORAGE = fixture("storage.mjs");

// The fixtures' parse phase passes the raw values straight through, so their
// built options are still a plain record.
type FixtureOptions = Record<string, unknown>;

type RecordedCall =
  | { role: "reporter"; context: ReporterContext<FixtureOptions> }
  | { role: "storage"; context: StorageContext<FixtureOptions> };

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  calls: RecordedCall[];
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

  const code = await generateCommand.run(argv);
  const calls = ((globalThis as Record<string, unknown>)["__orionCalls"] ?? []) as RecordedCall[];

  return { code, stdout, stderr, calls };
}

function reporterCall(calls: RecordedCall[]): ReporterContext<FixtureOptions> {
  const found = calls.find((call) => call.role === "reporter");
  if (found === undefined) throw new Error("reporter was not invoked");
  return found.context;
}

function storageCall(calls: RecordedCall[]): StorageContext<FixtureOptions> {
  const found = calls.find((call) => call.role === "storage");
  if (found === undefined) throw new Error("storage was not invoked");
  return found.context;
}

beforeEach(() => {
  (globalThis as Record<string, unknown>)["__orionCalls"] = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generate", () => {
  const base = [
    "--reporter",
    REPORTER,
    "--storage",
    STORAGE,
    "--token",
    "rep-tok",
    "--storage-token",
    "sto-tok",
    "--bucket",
    "my-bucket",
  ];

  it("runs the reporter then the storage plugin and reports where it landed", async () => {
    const result = await run([...base, "a.json"]);

    expect(result.code).toBe(0);
    expect(result.calls.map((call) => call.role)).toEqual(["reporter", "storage"]);
    expect(result.stdout).toContain("Stored fixture report as fixture-001");
    expect(result.stdout).toContain("https://example.test/r/fixture-001");
  });

  it("passes positionals to the reporter verbatim, without expanding globs", async () => {
    const result = await run([...base, "src/**/*.json", "out/report.txt"]);

    expect(reporterCall(result.calls).patterns).toEqual(["src/**/*.json", "out/report.txt"]);
  });

  it("routes a colliding option to the right plugin", async () => {
    const result = await run([...base, "a.json"]);

    expect(reporterCall(result.calls).options["token"]).toBe("rep-tok");
    expect(storageCall(result.calls).options["token"]).toBe("sto-tok");
  });

  it("does not leak one plugin's options into the other", async () => {
    const result = await run([...base, "a.json"]);

    expect(reporterCall(result.calls).options).not.toHaveProperty("bucket");
    expect(storageCall(result.calls).options).not.toHaveProperty("tag");
  });

  it("applies plugin defaults and collects repeatable options", async () => {
    const result = await run([...base, "--tag", "a", "--tag", "b", "--verbose", "x.json"]);

    const options = reporterCall(result.calls).options;
    expect(options["depth"]).toBe(3);
    expect(options["tag"]).toEqual(["a", "b"]);
    expect(options["verbose"]).toBe(true);
  });

  it("passes the reporter's report through to storage unchanged", async () => {
    const result = await run([...base, "a.json"]);

    expect(storageCall(result.calls).report).toMatchObject({ kind: "fixture", version: 1 });
  });

  it("omits the URL line when storage does not provide one", async () => {
    const result = await run([
      "--reporter",
      REPORTER,
      "--storage",
      fixture("storage-no-url.mjs"),
      "--token",
      "t",
      "a.json",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("no-url-001");
    expect(result.stdout).not.toContain("https://");
  });

  describe("failures", () => {
    it("fails when --reporter is missing", async () => {
      const result = await run(["--storage", STORAGE, "a.json"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Missing required option --reporter/);
    });

    it("fails when --storage is missing", async () => {
      const result = await run(["--reporter", REPORTER, "--token", "t", "a.json"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Missing required option --storage/);
    });

    it("fails when no input files are given", async () => {
      const result = await run(base);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/No input files given/);
    });

    it("fails on an unknown option", async () => {
      const result = await run([...base, "--nope", "x", "a.json"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Unknown option/);
    });

    it("fails when a required plugin option is missing", async () => {
      const result = await run([
        "--reporter",
        REPORTER,
        "--storage",
        STORAGE,
        "--token",
        "t",
        "--storage-token",
        "s",
        "a.json",
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Missing required option --storage-bucket/);
    });

    it("fails when a plugin package cannot be loaded", async () => {
      const result = await run(["--reporter", "@orion/nope", "--storage", STORAGE, "a.json"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Could not load plugin/);
    });

    it("does not invoke storage when the reporter cannot be loaded", async () => {
      const result = await run(["--reporter", "@orion/nope", "--storage", STORAGE, "a.json"]);

      expect(result.calls).toHaveLength(0);
    });
  });

  describe("option parse phase", () => {
    const REJECTING_REPORTER = fixture("rejecting-reporter.mjs");
    const REJECTING_STORAGE = fixture("rejecting-storage.mjs");

    it("reports a plugin's issues against the flag that carries them", async () => {
      const result = await run([
        "--reporter",
        REJECTING_REPORTER,
        "--storage",
        fixture("storage-no-url.mjs"),
        "a.json",
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("--reporter-since must be an ISO-8601 date.");
    });

    it("names the plugin for an issue that belongs to no single option", async () => {
      const result = await run([
        "--reporter",
        REJECTING_REPORTER,
        "--storage",
        fixture("storage-no-url.mjs"),
        "a.json",
      ]);

      expect(result.stderr).toContain(
        "reporter plugin 'picky-reporter': needs either --since or a positional.",
      );
    });

    it("reports both plugins' issues together", async () => {
      const result = await run([
        "--reporter",
        REJECTING_REPORTER,
        "--storage",
        REJECTING_STORAGE,
        "a.json",
      ]);

      expect(result.stderr).toContain("--reporter-since");
      expect(result.stderr).toContain("--storage-region is not a known region.");
    });

    it("does not run the reporter when only storage rejects its options", async () => {
      const result = await run([
        "--reporter",
        REPORTER,
        "--storage",
        REJECTING_STORAGE,
        "--token",
        "t",
        "a.json",
      ]);

      expect(result.code).toBe(1);
      expect(result.calls).toHaveLength(0);
    });

    it("hands each plugin the options its own parse built", async () => {
      const result = await run([...base, "a.json"]);

      expect(reporterCall(result.calls).options).toMatchObject({ token: "rep-tok", depth: 3 });
      expect(storageCall(result.calls).options).toMatchObject({
        token: "sto-tok",
        bucket: "my-bucket",
      });
    });

    it("fails when a plugin returns a malformed result", async () => {
      const result = await run([
        "--reporter",
        fixture("bad-options-result.mjs"),
        "--storage",
        fixture("storage-no-url.mjs"),
        "a.json",
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/returned an invalid result from parseOptions/);
    });
  });

  describe("--help", () => {
    it("lists core options without loading any plugins", async () => {
      const result = await run(["--help"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("--reporter <string>");
      expect(result.stdout).toContain("Pass --reporter and --storage to see the options");
    });

    it("lists plugin options once both plugins are named", async () => {
      const result = await run(["--reporter", REPORTER, "--storage", STORAGE, "--help"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Reporter plugin options:");
      expect(result.stdout).toContain("Storage plugin options:");
      expect(result.stdout).toContain("--reporter-token, --token");
    });

    it("shows the canonical form only for an option whose alias was taken", async () => {
      const result = await run(["--reporter", REPORTER, "--storage", STORAGE, "--help"]);

      expect(result.stdout).toContain("--storage-token <string>");
      expect(result.stdout).not.toContain("--storage-token, --token");
    });

    it("does not run the plugins", async () => {
      const result = await run(["--reporter", REPORTER, "--storage", STORAGE, "--help"]);

      expect(result.calls).toHaveLength(0);
    });
  });
});
