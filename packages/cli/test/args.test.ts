import { describe, expect, it } from "vitest";
import type { OptionSpec } from "@orion/core";
import {
  CliError,
  describeFlags,
  optionsForRole,
  parseFlags,
  pluginFlagDefs,
  type FlagDef,
} from "../src/args.js";

function spec(overrides: Partial<OptionSpec> & { name: string }): OptionSpec {
  return {
    type: "string",
    description: `the ${overrides.name} option`,
    ...overrides,
  };
}

function def(overrides: Partial<OptionSpec> & { name: string }): FlagDef {
  const resolved = spec(overrides);
  return { flag: resolved.name, target: resolved.name, spec: resolved };
}

describe("parseFlags", () => {
  it("parses a string option in both --key value and --key=value form", () => {
    const defs = [def({ name: "token" })];

    expect(parseFlags(["--token", "abc"], defs).values["token"]).toBe("abc");
    expect(parseFlags(["--token=abc"], defs).values["token"]).toBe("abc");
  });

  it("treats a boolean option as a flag and defaults it to false", () => {
    const defs = [def({ name: "verbose", type: "boolean" })];

    expect(parseFlags(["--verbose"], defs).values["verbose"]).toBe(true);
    expect(parseFlags([], defs).values["verbose"]).toBe(false);
  });

  it("coerces number options and rejects non-numeric input", () => {
    const defs = [def({ name: "depth", type: "number" })];

    expect(parseFlags(["--depth", "7"], defs).values["depth"]).toBe(7);
    expect(() => parseFlags(["--depth", "abc"], defs)).toThrow(CliError);
    expect(() => parseFlags(["--depth", "abc"], defs)).toThrow(/expects a number/);
  });

  it("collects repeatable options into an array", () => {
    const defs = [def({ name: "tag", multiple: true })];

    expect(parseFlags(["--tag", "a", "--tag", "b"], defs).values["tag"]).toEqual(["a", "b"]);
  });

  it("keeps the last value when a non-repeatable option is given twice", () => {
    const defs = [def({ name: "token" })];

    expect(parseFlags(["--token", "a", "--token", "b"], defs).values["token"]).toBe("b");
  });

  it("applies defaults when an option is absent", () => {
    const defs = [def({ name: "depth", type: "number", default: 3 })];

    expect(parseFlags([], defs).values["depth"]).toBe(3);
  });

  it("prefers an explicit value over the default", () => {
    const defs = [def({ name: "depth", type: "number", default: 3 })];

    expect(parseFlags(["--depth", "9"], defs).values["depth"]).toBe(9);
  });

  it("rejects a missing required option", () => {
    const defs = [def({ name: "token", required: true })];

    expect(() => parseFlags([], defs)).toThrow(/Missing required option --token/);
  });

  it("rejects unknown options rather than ignoring them", () => {
    const defs = [def({ name: "token" })];

    expect(() => parseFlags(["--nope", "x"], defs)).toThrow(CliError);
    expect(() => parseFlags(["--nope", "x"], defs)).toThrow(/Unknown option/);
  });

  it("collects positionals and preserves their order", () => {
    const defs = [def({ name: "token" })];
    const result = parseFlags(["a.json", "--token", "t", "b/**/*.txt"], defs);

    expect(result.positionals).toEqual(["a.json", "b/**/*.txt"]);
  });

  it("treats everything after -- as positional", () => {
    const defs = [def({ name: "token" })];
    const result = parseFlags(["--token", "t", "--", "--not-a-flag"], defs);

    expect(result.positionals).toEqual(["--not-a-flag"]);
    expect(result.values["token"]).toBe("t");
  });

  it("does not require an option that has a default", () => {
    const defs = [def({ name: "depth", type: "number", default: 1, required: false })];

    expect(() => parseFlags([], defs)).not.toThrow();
  });

  describe("when two flags share a target", () => {
    const shared: FlagDef[] = [
      { flag: "reporter-token", target: "reporter:token", spec: spec({ name: "token" }) },
      { flag: "token", target: "reporter:token", spec: spec({ name: "token" }) },
    ];

    it("accepts either the canonical form or the alias", () => {
      expect(parseFlags(["--reporter-token", "a"], shared).values["reporter:token"]).toBe("a");
      expect(parseFlags(["--token", "b"], shared).values["reporter:token"]).toBe("b");
    });

    it("rejects both being given at once", () => {
      expect(() => parseFlags(["--token", "a", "--reporter-token", "b"], shared)).toThrow(
        /conflicts with/,
      );
    });

    it("reports a missing required option only once", () => {
      const required: FlagDef[] = shared.map((entry) => ({
        ...entry,
        spec: spec({ name: "token", required: true }),
      }));

      expect(() => parseFlags([], required)).toThrow(/Missing required option/);
    });

    it("concatenates repeatable values across both forms", () => {
      const repeatable: FlagDef[] = shared.map((entry) => ({
        ...entry,
        spec: spec({ name: "tag", multiple: true }),
      }));

      const result = parseFlags(["--token", "a", "--reporter-token", "b"], repeatable);
      expect(result.values["reporter:token"]).toEqual(["a", "b"]);
    });
  });
});

describe("pluginFlagDefs", () => {
  it("always registers the canonical prefixed form", () => {
    const { defs } = pluginFlagDefs("reporter", [spec({ name: "token" })], new Set());

    expect(defs.map((d) => d.flag)).toContain("reporter-token");
  });

  it("registers a bare alias when the name is free", () => {
    const { defs } = pluginFlagDefs("reporter", [spec({ name: "token" })], new Set());

    expect(defs.map((d) => d.flag)).toEqual(["reporter-token", "token"]);
    expect(defs.every((d) => d.target === "reporter:token")).toBe(true);
  });

  it("omits the bare alias when a core flag already claims the name", () => {
    const { defs } = pluginFlagDefs("storage", [spec({ name: "help" })], new Set(["help"]));

    expect(defs.map((d) => d.flag)).toEqual(["storage-help"]);
  });

  it("omits the bare alias when another plugin claimed it first", () => {
    const first = pluginFlagDefs("reporter", [spec({ name: "token" })], new Set());
    const second = pluginFlagDefs("storage", [spec({ name: "token" })], first.claims);

    expect(first.defs.map((d) => d.flag)).toContain("token");
    expect(second.defs.map((d) => d.flag)).toEqual(["storage-token"]);
  });

  it("keeps colliding options on separate targets", () => {
    const first = pluginFlagDefs("reporter", [spec({ name: "token" })], new Set());
    const second = pluginFlagDefs("storage", [spec({ name: "token" })], first.claims);

    expect(first.defs[0]?.target).toBe("reporter:token");
    expect(second.defs[0]?.target).toBe("storage:token");
  });

  it("reports the names it claimed", () => {
    const { claims } = pluginFlagDefs("reporter", [spec({ name: "token" })], new Set());

    expect([...claims].sort()).toEqual(["reporter-token", "token"]);
  });

  it("handles a plugin that declares no options", () => {
    const { defs, claims } = pluginFlagDefs("reporter", [], new Set());

    expect(defs).toEqual([]);
    expect(claims.size).toBe(0);
  });
});

describe("optionsForRole", () => {
  const values = {
    reporter: "pkg-a",
    storage: "pkg-b",
    "reporter:token": "rep",
    "storage:token": "sto",
    "storage:bucket": "b",
  };

  it("returns only the requested role's options, with bare names", () => {
    expect(optionsForRole(values, "reporter")).toEqual({ token: "rep" });
    expect(optionsForRole(values, "storage")).toEqual({ token: "sto", bucket: "b" });
  });

  it("excludes core options that are not role-prefixed", () => {
    expect(optionsForRole(values, "reporter")).not.toHaveProperty("reporter");
  });
});

describe("describeFlags", () => {
  it("groups aliases of the same option onto one line", () => {
    const defs: FlagDef[] = [
      { flag: "reporter-token", target: "reporter:token", spec: spec({ name: "token" }) },
      { flag: "token", target: "reporter:token", spec: spec({ name: "token" }) },
    ];

    const lines = describeFlags(defs);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("--reporter-token, --token");
  });

  it("annotates required, repeatable and defaulted options", () => {
    const lines = describeFlags([
      def({ name: "a", required: true }),
      def({ name: "b", multiple: true }),
      def({ name: "c", type: "number", default: 3 }),
    ]);

    expect(lines[0]).toContain("[required]");
    expect(lines[1]).toContain("[repeatable]");
    expect(lines[2]).toContain("[default: 3]");
  });

  it("shows a value placeholder for non-boolean options only", () => {
    const lines = describeFlags([def({ name: "a" }), def({ name: "b", type: "boolean" })]);

    expect(lines[0]).toContain("--a <string>");
    expect(lines[1]).not.toContain("<");
  });
});
