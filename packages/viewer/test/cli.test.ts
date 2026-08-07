import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCliArgs, run } from "../src/cli.js";
import { ViewerError } from "../src/errors.js";

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

afterEach(() => {
  vi.restoreAllMocks();
});

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function invoke(argv: readonly string[]): Promise<Run> {
  let stdout = "";
  let stderr = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });

  const code = await run(argv);
  return { code, stdout, stderr };
}

describe("parseCliArgs", () => {
  it("reads the server settings", () => {
    const { input } = parseCliArgs(["--host", "0.0.0.0", "--port", "9000", "--base-path", "/o"]);

    expect(input).toMatchObject({ host: "0.0.0.0", port: 9000, basePath: "/o" });
  });

  it("collects repeatable connections and viewers", () => {
    const { input } = parseCliArgs([
      "--connection",
      "prod=@orion/plugin-storage-s3",
      "--connection",
      "local=@orion/plugin-storage-filesystem",
      "--viewer",
      "@orion/plugin-viewer-pulumi-diff",
    ]);

    expect(input.connections).toEqual([
      { name: "prod", package: "@orion/plugin-storage-s3" },
      { name: "local", package: "@orion/plugin-storage-filesystem" },
    ]);
    expect(input.viewers).toEqual([{ package: "@orion/plugin-viewer-pulumi-diff" }]);
  });

  it("turns --no-config into skipping discovery", () => {
    expect(parseCliArgs(["--no-config"]).input.config).toBe(false);
  });

  it("reports help without doing anything else", () => {
    expect(parseCliArgs(["--help"]).help).toBe(true);
    expect(parseCliArgs(["-h"]).help).toBe(true);
  });

  it("rejects a connection that is not name=package", () => {
    expect(() => parseCliArgs(["--connection", "prod"])).toThrow(ViewerError);
    expect(() => parseCliArgs(["--connection", "prod"])).toThrow(/<name>=<package>/);
  });

  it("rejects a port that is not a port", () => {
    expect(() => parseCliArgs(["--port", "https"])).toThrow(/--port must be an integer/);
    expect(() => parseCliArgs(["--port", "70000"])).toThrow(/--port must be an integer/);
  });

  it("rejects a certificate with no key", () => {
    expect(() => parseCliArgs(["--tls-cert", "cert.pem"])).toThrow(
      /--tls-cert and --tls-key must be given together/,
    );
  });

  it("rejects --config and --no-config together", () => {
    expect(() => parseCliArgs(["--config", "a.js", "--no-config"])).toThrow(
      /cannot both be given/,
    );
  });

  it("rejects an unknown flag", () => {
    expect(() => parseCliArgs(["--nope"])).toThrow(ViewerError);
  });

  it("rejects positional arguments", () => {
    expect(() => parseCliArgs(["report.json"])).toThrow(ViewerError);
  });
});

describe("run", () => {
  it("prints usage and exits 0 for --help", async () => {
    const { code, stdout } = await invoke(["--help"]);

    expect(code).toBe(0);
    for (const flag of [
      "--config",
      "--no-config",
      "--host",
      "--port",
      "--base-path",
      "--tls-cert",
      "--tls-key",
      "--connection",
      "--viewer",
      "--client-dir",
      "--help",
    ]) {
      expect(stdout).toContain(flag);
    }
  });

  it("prefixes a failure with the command name and exits 1", async () => {
    const { code, stderr } = await invoke(["--nope"]);

    expect(code).toBe(1);
    expect(stderr).toMatch(/^orion-viewer: /);
  });

  it("reports a plugin it cannot load", async () => {
    const { code, stderr } = await invoke([
      "--no-config",
      "--port",
      "0",
      "--connection",
      "a=@orion/definitely-not-installed",
    ]);

    expect(code).toBe(1);
    expect(stderr).toContain("Could not load plugin");
  });

  it("reports a write-only backend rather than starting", async () => {
    const { code, stderr } = await invoke([
      "--no-config",
      "--port",
      "0",
      "--connection",
      `a=${fixture("storage-write-only.mjs")}`,
    ]);

    expect(code).toBe(1);
    expect(stderr).toContain("does not implement fetch()");
  });
});
