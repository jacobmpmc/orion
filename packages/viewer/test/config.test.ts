import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectOptions } from "../src/config/options.js";
import { loadConfigFile } from "../src/config/load.js";
import { resolveConfig } from "../src/config/resolve.js";
import { validateConfig } from "../src/config/validate.js";
import { ViewerError } from "../src/errors.js";

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

/** Collects a thrown ViewerError's message, failing the test if none was thrown. */
async function messageOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ViewerError) return error.message;
    throw error;
  }
  throw new Error("expected the configuration to be rejected");
}

describe("resolveConfig", () => {
  it("falls back to the defaults", () => {
    const config = resolveConfig();

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(7317);
    expect(config.basePath).toBe("/");
    expect(config.connections).toEqual([]);
    expect(config.viewers).toEqual([]);
  });

  it("prefers module arguments over every other layer", () => {
    const config = resolveConfig({
      moduleArgs: { port: 1 },
      cliArgs: { port: 2 },
      file: { port: 3 },
    });

    expect(config.port).toBe(1);
  });

  it("prefers cli arguments over the file", () => {
    const config = resolveConfig({ cliArgs: { port: 2 }, file: { port: 3 } });

    expect(config.port).toBe(2);
  });

  it("falls through to the file when nothing above it set the field", () => {
    const config = resolveConfig({ moduleArgs: { host: "0.0.0.0" }, file: { port: 3 } });

    expect(config).toMatchObject({ host: "0.0.0.0", port: 3 });
  });

  it("replaces connections rather than merging them", () => {
    const config = resolveConfig({
      cliArgs: { connections: [{ name: "cli", package: "a" }] },
      file: { connections: [{ name: "file", package: "b" }] },
    });

    expect(config.connections.map((c) => c.name)).toEqual(["cli"]);
  });

  it("normalises a base path to leading and trailing slashes", () => {
    expect(resolveConfig({ cliArgs: { basePath: "/orion" } }).basePath).toBe("/orion/");
    expect(resolveConfig({ cliArgs: { basePath: "orion/" } }).basePath).toBe("/orion/");
  });

  it("records the config file it was built from", () => {
    expect(resolveConfig({ source: "/etc/orion.js" }).source).toBe("/etc/orion.js");
  });
});

describe("validateConfig", () => {
  it("accepts a well-formed config", () => {
    const config = validateConfig(
      { port: 8080, connections: [{ name: "prod", package: "pkg", options: { path: "/r" } }] },
      "test",
    );

    expect(config.port).toBe(8080);
    expect(config.connections?.[0]).toMatchObject({ name: "prod", package: "pkg" });
  });

  it("defaults a connection's options to an empty object", () => {
    const config = validateConfig({ connections: [{ name: "a", package: "p" }] }, "test");

    expect(config.connections?.[0]?.options).toEqual({});
  });

  it("reports every problem at once", () => {
    let message = "";
    try {
      validateConfig(
        {
          port: "8080",
          connections: [
            { name: "prod/eu", package: "a" },
            { package: "b" },
            { name: "prod", package: "c" },
            { name: "prod", package: "d" },
          ],
          tls: { cert: "cert.pem" },
        },
        "./orion-viewer.config.js",
      );
    } catch (error) {
      message = (error as ViewerError).message;
    }

    expect(message).toContain("Invalid configuration in ./orion-viewer.config.js:");
    expect(message).toContain("port must be an integer between 0 and 65535");
    expect(message).toContain("connections[0].name 'prod/eu'");
    expect(message).toContain("connections[1].name is missing");
    expect(message).toContain("connections[3].name 'prod' is already used by connections[2]");
    expect(message).toContain("tls.key is required");
  });

  it("rejects a base path that is not a path", () => {
    expect(() => validateConfig({ basePath: "orion" }, "test")).toThrow(
      /basePath must be a path starting with '\/'/,
    );
  });

  it("rejects an option value that is not a scalar or list", () => {
    expect(() =>
      validateConfig({ connections: [{ name: "a", package: "p", options: { x: {} } }] }, "test"),
    ).toThrow(/connections\[0\]\.options\.x must be/);
  });

  it("rejects a module that is not an object", () => {
    expect(() => validateConfig("nope", "test")).toThrow(
      /must export a configuration object/,
    );
  });
});

describe("loadConfigFile", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "orion-config-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("resolves undefined when there is no config file", async () => {
    await expect(loadConfigFile(undefined, cwd)).resolves.toBe(undefined);
  });

  it("discovers a config file in the working directory", async () => {
    await writeFile(join(cwd, "orion-viewer.config.mjs"), "export default { port: 9090 };", "utf8");

    const loaded = await loadConfigFile(undefined, cwd);

    expect(loaded?.config.port).toBe(9090);
  });

  it("does not look above the working directory", async () => {
    await writeFile(join(cwd, "orion-viewer.config.mjs"), "export default { port: 9090 };", "utf8");
    const nested = join(cwd, "nested");
    await mkdtemp(nested);

    await expect(loadConfigFile(undefined, nested)).resolves.toBe(undefined);
  });

  it("loads an explicitly named file", async () => {
    const loaded = await loadConfigFile(fixture("config/good.mjs"));

    expect(loaded?.config.port).toBe(8100);
    expect(loaded?.source).toContain("good.mjs");
  });

  it("skips discovery entirely when given false", async () => {
    await writeFile(join(cwd, "orion-viewer.config.mjs"), "export default { port: 9090 };", "utf8");

    await expect(loadConfigFile(false, cwd)).resolves.toBe(undefined);
  });

  it("rejects a named file that is not there", async () => {
    const message = await messageOf(() => loadConfigFile("./nope.config.js", cwd));

    expect(message).toMatch(/No configuration file at \.\/nope\.config\.js/);
  });

  it("rejects a module with no default export", async () => {
    const message = await messageOf(() => loadConfigFile(fixture("config/no-default.mjs")));

    expect(message).toMatch(/has no default export/);
  });

  it("rejects a default export that is not an object", async () => {
    const message = await messageOf(() => loadConfigFile(fixture("config/not-an-object.mjs")));

    expect(message).toMatch(/must export a configuration object/);
  });

  it("reports every problem in an invalid file", async () => {
    const message = await messageOf(() => loadConfigFile(fixture("config/bad.mjs")));

    expect(message).toContain("port must be an integer");
    expect(message).toContain("connections[0].name 'prod/eu'");
    expect(message).toContain("tls.key is required");
  });
});

describe("collectOptions", () => {
  it("applies a declared default when the value is absent", () => {
    const collected = collectOptions(
      [{ name: "depth", type: "number", description: "", default: 3 }],
      {},
    );

    expect(collected.values).toEqual({ depth: 3 });
    expect(collected.issues).toEqual([]);
  });

  it("defaults an absent boolean to false", () => {
    const collected = collectOptions([{ name: "raw", type: "boolean", description: "" }], {});

    expect(collected.values).toEqual({ raw: false });
  });

  it("reports a missing required option", () => {
    const collected = collectOptions(
      [{ name: "path", type: "string", description: "", required: true }],
      {},
    );

    expect(collected.issues).toEqual([{ option: "path", message: "is required." }]);
  });

  it("accepts a number written as a string", () => {
    const collected = collectOptions([{ name: "port", type: "number", description: "" }], {
      port: "8080",
    });

    expect(collected.values).toEqual({ port: 8080 });
  });

  it("reports a value of the wrong type", () => {
    const collected = collectOptions([{ name: "path", type: "string", description: "" }], {
      path: 7,
    });

    expect(collected.issues[0]?.message).toMatch(/must be a string/);
  });

  it("wraps a lone value for a repeatable option", () => {
    const collected = collectOptions(
      [{ name: "tag", type: "string", description: "", multiple: true }],
      { tag: "a" },
    );

    expect(collected.values).toEqual({ tag: ["a"] });
  });

  it("rejects a list for an option that is not repeatable", () => {
    const collected = collectOptions([{ name: "tag", type: "string", description: "" }], {
      tag: ["a", "b"],
    });

    expect(collected.issues[0]?.message).toMatch(/is not repeatable/);
  });

  it("rejects an option the plugin never declared", () => {
    const collected = collectOptions([{ name: "path", type: "string", description: "" }], {
      pathh: "/r",
    });

    expect(collected.issues[0]?.message).toMatch(/does not have an option 'pathh'.*'path'/);
  });

  it("says so when the plugin takes no options at all", () => {
    const collected = collectOptions([], { path: "/r" });

    expect(collected.issues[0]?.message).toMatch(/does not accept any options/);
  });
});
