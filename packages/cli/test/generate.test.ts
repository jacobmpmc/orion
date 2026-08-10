import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Report, ReporterContext, StorageContext } from "@orion/core";
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
  | { role: "reporter"; context: ReporterContext<FixtureOptions>; report?: Report }
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
  // --no-metadata by default: these tests are about option routing, and
  // collecting provenance would spawn a handful of git processes per case for
  // nothing. The metadata block below opts back in deliberately.
  const plugins = [
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
  const base = [...plugins, "--no-metadata"];

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

  describe("metadata", () => {
    // These tests run inside a git checkout, and possibly inside GitHub
    // Actions, so nothing here asserts on the git or ci namespaces -- their
    // contents depend on the machine. Provider detection is covered by the pure
    // tests in metadata.test.ts.
    it("stamps the stored report with when it was collected", async () => {
      const result = await run([...plugins, "a.json"]);

      const metadata = storageCall(result.calls).report.metadata;
      expect(typeof metadata?.collectedAt).toBe("string");
      expect(Number.isNaN(Date.parse(metadata?.collectedAt ?? ""))).toBe(false);
    });

    it("attaches nothing at all with --no-metadata", async () => {
      const result = await run([...base, "a.json"]);

      expect(storageCall(result.calls).report).not.toHaveProperty("metadata");
    });

    it("records --metadata entries under custom", async () => {
      const result = await run([
        ...plugins,
        "--metadata",
        "deploy-env=staging",
        "--metadata",
        "ticket=OPS-12",
        "a.json",
      ]);

      expect(storageCall(result.calls).report.metadata?.custom).toEqual({
        "deploy-env": "staging",
        ticket: "OPS-12",
      });
    });

    it("keeps everything after the first = in the value", async () => {
      const result = await run([...plugins, "--metadata", "args=--depth=3", "a.json"]);

      expect(storageCall(result.calls).report.metadata?.custom).toEqual({ args: "--depth=3" });
    });

    it("does not modify the report the reporter returned", async () => {
      const result = await run(["--reporter", fixture("reporter-frozen.mjs"), "--storage", STORAGE, "--storage-token", "s", "--bucket", "b", "a.json"]);

      const returned = result.calls.find((call) => call.role === "reporter")?.report;
      expect(returned).not.toHaveProperty("metadata");
      expect(storageCall(result.calls).report).not.toBe(returned);
      expect(storageCall(result.calls).report.metadata).toBeDefined();
    });

    it("replaces the namespaces it collects and keeps the reporter's own", async () => {
      const result = await run([
        "--reporter",
        fixture("reporter-metadata.mjs"),
        "--storage",
        STORAGE,
        "--storage-token",
        "s",
        "--bucket",
        "b",
        "--metadata",
        "origin=cli",
        "a.json",
      ]);

      const metadata = storageCall(result.calls).report.metadata;
      expect(metadata?.custom).toEqual({ origin: "cli" });
      expect(metadata?.["fixture"]).toEqual({ note: "kept" });
      expect(metadata?.collectedAt).not.toBe("1999-01-01T00:00:00.000Z");
    });

    it("fails on a --metadata value that is not a pair, before running anything", async () => {
      const result = await run([...plugins, "--metadata", "oops", "a.json"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("key=value");
      expect(result.calls).toHaveLength(0);
    });

    it("fails on a --metadata key that is not usable", async () => {
      const result = await run([...plugins, "--metadata", "not a key=x", "a.json"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("is not usable");
    });

    it("fails when --metadata is combined with --no-metadata", async () => {
      const result = await run([...base, "--metadata", "a=1", "a.json"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("cannot be combined");
      expect(result.calls).toHaveLength(0);
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
