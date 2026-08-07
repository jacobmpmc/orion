import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, findCommand } from "../src/commands/index.js";

async function capture(run: () => Promise<number>): Promise<{ code: number; stdout: string; stderr: string }> {
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

  const code = await run();
  return { code, stdout, stderr };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registry", () => {
  it("exposes generate and help", () => {
    expect(commands.map((command) => command.name).sort()).toEqual(["generate", "help"]);
  });

  it("finds a command by name", () => {
    expect(findCommand("generate")?.name).toBe("generate");
  });

  it("returns undefined for an unknown name", () => {
    expect(findCommand("nope")).toBeUndefined();
  });

  it("gives every command a summary and usage line", () => {
    for (const command of commands) {
      expect(command.summary).not.toBe("");
      expect(command.usage).toContain("orion");
    }
  });
});

describe("help", () => {
  const help = findCommand("help");

  it("lists every registered command", async () => {
    const result = await capture(() => help!.run([]));

    expect(result.code).toBe(0);
    for (const command of commands) {
      expect(result.stdout).toContain(command.name);
    }
  });

  it("shows usage for a named command", async () => {
    const result = await capture(() => help!.run(["generate"]));

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("orion generate --reporter");
  });

  it("includes the details block when a command has one", async () => {
    const result = await capture(() => help!.run(["generate"]));

    expect(result.stdout).toContain("--reporter-<name>");
  });

  it("fails for an unknown command", async () => {
    const result = await capture(() => help!.run(["nope"]));

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unknown command 'nope'");
  });
});
