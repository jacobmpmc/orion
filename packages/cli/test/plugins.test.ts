import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Plugin } from "@orion/core";
import { CliError } from "../src/args.js";
import { loadReporter, loadStorage, parsePluginOptions } from "../src/plugins.js";

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

describe("loadReporter", () => {
  it("loads a plugin from a default export", async () => {
    const reporter = await loadReporter(fixture("reporter.mjs"));

    expect(reporter.name).toBe("fixture-reporter");
    expect(reporter.kind).toBe("reporter");
    expect(typeof reporter.generate).toBe("function");
  });

  it("loads a plugin from a role-named export", async () => {
    const reporter = await loadReporter(fixture("named-export.mjs"));

    expect(reporter.name).toBe("named-export-reporter");
  });

  it("rejects a package that is not installed", async () => {
    await expect(loadReporter("@orion/definitely-not-installed")).rejects.toThrow(CliError);
    await expect(loadReporter("@orion/definitely-not-installed")).rejects.toThrow(
      /Could not load plugin/,
    );
  });

  it("rejects a plugin of the wrong role", async () => {
    await expect(loadReporter(fixture("storage.mjs"))).rejects.toThrow(
      /is a 'storage' plugin, but a 'reporter' plugin is required/,
    );
  });

  it("rejects a plugin that does not implement generate()", async () => {
    await expect(loadReporter(fixture("missing-method.mjs"))).rejects.toThrow(
      /does not implement generate\(\)/,
    );
  });

  it("rejects an export that is not a plugin object", async () => {
    await expect(loadReporter(fixture("not-a-plugin.mjs"))).rejects.toThrow(
      /does not export a plugin object/,
    );
  });

  it("rejects a plugin that does not implement parseOptions()", async () => {
    await expect(loadReporter(fixture("missing-parse-options.mjs"))).rejects.toThrow(
      /does not implement parseOptions\(\)/,
    );
  });
});

describe("loadStorage", () => {
  it("loads a storage plugin", async () => {
    const storage = await loadStorage(fixture("storage.mjs"));

    expect(storage.kind).toBe("storage");
    expect(typeof storage.store).toBe("function");
  });

  it("rejects a reporter passed as storage", async () => {
    await expect(loadStorage(fixture("reporter.mjs"))).rejects.toThrow(
      /is a 'reporter' plugin, but a 'storage' plugin is required/,
    );
  });
});

describe("parsePluginOptions", () => {
  function plugin(parseOptions: Plugin["parseOptions"]): Plugin {
    return { kind: "reporter", name: "fake", parseOptions };
  }

  it("passes a successful result through", () => {
    const result = parsePluginOptions(
      plugin(() => ({ ok: true, options: { root: "/tmp" } })),
      { path: "/tmp" },
    );

    expect(result).toEqual({ ok: true, options: { root: "/tmp" } });
  });

  it("passes issues through", () => {
    const result = parsePluginOptions(
      plugin(() => ({ ok: false, issues: [{ option: "path", message: "is required." }] })),
      {},
    );

    expect(result).toEqual({ ok: false, issues: [{ option: "path", message: "is required." }] });
  });

  it("hands the plugin the values it was given", () => {
    const seen: unknown[] = [];

    parsePluginOptions(
      plugin((values) => {
        seen.push(values);
        return { ok: true, options: null };
      }),
      { path: "/tmp", name: "a.json" },
    );

    expect(seen).toEqual([{ path: "/tmp", name: "a.json" }]);
  });

  it("rejects a result that is neither ok nor issues", () => {
    expect(() =>
      parsePluginOptions(plugin(() => ({ options: {} }) as never), {}),
    ).toThrow(/returned an invalid result from parseOptions/);
  });

  it("rejects a failure whose issues are not issue objects", () => {
    expect(() =>
      parsePluginOptions(plugin(() => ({ ok: false, issues: ["nope"] }) as never), {}),
    ).toThrow(/returned an invalid result from parseOptions/);
  });

  it("rejects a non-object result", () => {
    expect(() => parsePluginOptions(plugin(() => undefined as never), {})).toThrow(CliError);
  });
});
