import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Plugin } from "@orion/core";
import { loadPlugin, parsePluginOptions } from "../src/index.js";

class TestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestError";
  }
}

const fail = (message: string): Error => new TestError(message);

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

describe("loadPlugin", () => {
  it("loads a plugin from a default export", async () => {
    const plugin = await loadPlugin(fixture("storage-read.mjs"), {
      kind: "storage",
      methods: ["fetch"],
      fail,
    });

    expect(plugin.name).toBe("read-only-storage");
    expect(plugin.kind).toBe("storage");
  });

  it("loads a plugin from a role-named export", async () => {
    const plugin = await loadPlugin(fixture("viewer.mjs"), {
      kind: "viewer",
      methods: [],
      fail,
    });

    expect(plugin.name).toBe("fixture-viewer");
  });

  it("accepts a plugin with no role method when the host needs none", async () => {
    const plugin = await loadPlugin(fixture("viewer.mjs"), {
      kind: "viewer",
      methods: [],
      fail,
    });

    expect(plugin.kind).toBe("viewer");
  });

  it("raises the host's own error type", async () => {
    await expect(
      loadPlugin("@orion/definitely-not-installed", { kind: "storage", methods: [], fail }),
    ).rejects.toThrow(TestError);
  });

  it("resolves a specifier relative to the host that asked for it", async () => {
    // "./fixtures/storage-read.mjs" is meaningless from the working directory
    // and from this package's own dist; `from` is what makes it resolvable.
    const plugin = await loadPlugin("./fixtures/storage-read.mjs", {
      kind: "storage",
      methods: ["fetch"],
      fail,
      from: import.meta.url,
    });

    expect(plugin.name).toBe("read-only-storage");
  });

  it("rejects a package that is not installed", async () => {
    await expect(
      loadPlugin("@orion/definitely-not-installed", { kind: "storage", methods: [], fail }),
    ).rejects.toThrow(/Could not load plugin/);
  });

  it("rejects a plugin of the wrong role", async () => {
    await expect(
      loadPlugin(fixture("storage-read.mjs"), { kind: "viewer", methods: [], fail }),
    ).rejects.toThrow(/is a 'storage' plugin, but a 'viewer' plugin is required/);
  });

  it("ignores a role-named export belonging to another role", async () => {
    // viewer.mjs exports `viewer`, not `default`, so nothing is found at all.
    await expect(
      loadPlugin(fixture("viewer.mjs"), { kind: "storage", methods: [], fail }),
    ).rejects.toThrow(/does not export a plugin object/);
  });

  it("rejects an export that is not a plugin object", async () => {
    await expect(
      loadPlugin(fixture("not-a-plugin.mjs"), { kind: "storage", methods: [], fail }),
    ).rejects.toThrow(/does not export a plugin object/);
  });

  it("rejects a plugin that does not implement parseOptions()", async () => {
    await expect(
      loadPlugin(fixture("missing-parse-options.mjs"), {
        kind: "storage",
        methods: ["store"],
        fail,
      }),
    ).rejects.toThrow(/does not implement parseOptions\(\)/);
  });

  describe("capability checks", () => {
    it("rejects a write-only backend when the host needs to read", async () => {
      await expect(
        loadPlugin(fixture("storage-write.mjs"), { kind: "storage", methods: ["fetch"], fail }),
      ).rejects.toThrow(/does not implement fetch\(\)/);
    });

    it("rejects a read-only backend when the host needs to write", async () => {
      await expect(
        loadPlugin(fixture("storage-read.mjs"), { kind: "storage", methods: ["store"], fail }),
      ).rejects.toThrow(/does not implement store\(\)/);
    });

    it("accepts the same backend for the capability it does have", async () => {
      const plugin = await loadPlugin(fixture("storage-write.mjs"), {
        kind: "storage",
        methods: ["store"],
        fail,
      });

      expect(plugin.name).toBe("write-only-storage");
    });
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
      fail,
    );

    expect(result).toEqual({ ok: true, options: { root: "/tmp" } });
  });

  it("passes issues through", () => {
    const result = parsePluginOptions(
      plugin(() => ({ ok: false, issues: [{ option: "path", message: "is required." }] })),
      {},
      fail,
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
      fail,
    );

    expect(seen).toEqual([{ path: "/tmp", name: "a.json" }]);
  });

  it("rejects a result that is neither ok nor issues", () => {
    expect(() => parsePluginOptions(plugin(() => ({ options: {} }) as never), {}, fail)).toThrow(
      /returned an invalid result from parseOptions/,
    );
  });

  it("raises the host's own error type", () => {
    expect(() => parsePluginOptions(plugin(() => undefined as never), {}, fail)).toThrow(TestError);
  });
});
