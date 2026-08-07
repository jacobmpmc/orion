import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config/resolve.js";
import type { ViewerConfig } from "../src/config/types.js";
import { ViewerError } from "../src/errors.js";
import { buildRegistry } from "../src/registry.js";

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

function build(config: ViewerConfig): ReturnType<typeof buildRegistry> {
  return buildRegistry(resolveConfig({ moduleArgs: config }));
}

/** Collects a thrown ViewerError's message, failing the test if none was thrown. */
async function messageOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ViewerError) return error.message;
    throw error;
  }
  throw new Error("expected the registry to be rejected");
}

describe("buildRegistry", () => {
  it("registers a readable storage connection under its name", async () => {
    const registry = await build({
      connections: [{ name: "local", label: "Local disk", package: fixture("storage-read.mjs") }],
    });

    expect(registry.connections.get("local")?.label).toBe("Local disk");
    expect(registry.connections.get("local")?.plugin.name).toBe("fixture-storage");
  });

  it("defaults a connection's label to its name", async () => {
    const registry = await build({
      connections: [{ name: "local", package: fixture("storage-read.mjs") }],
    });

    expect(registry.connections.get("local")?.label).toBe("local");
  });

  it("registers a viewer plugin with a slug and its bundle path", async () => {
    const registry = await build({ viewers: [{ package: fixture("viewer.mjs") }] });

    expect(registry.viewers[0]).toMatchObject({
      id: "fixture-viewer",
      name: "fixture-viewer",
      reports: ["fixture"],
    });
    expect(registry.viewers[0]?.bundleFile).toContain("browser-bundle.mjs");
  });

  it("gives two plugins with the same name distinct ids", async () => {
    const registry = await build({
      viewers: [{ package: fixture("viewer.mjs") }, { package: fixture("viewer.mjs") }],
    });

    expect(registry.viewers.map((viewer) => viewer.id)).toEqual([
      "fixture-viewer",
      "fixture-viewer-2",
    ]);
  });

  describe("rejections", () => {
    it("rejects a write-only backend as a connection", async () => {
      const message = await messageOf(() =>
        build({ connections: [{ name: "a", package: fixture("storage-write-only.mjs") }] }),
      );

      expect(message).toMatch(/does not implement fetch\(\)/);
    });

    it("rejects a reporter plugin as a connection", async () => {
      const message = await messageOf(() =>
        build({ connections: [{ name: "a", package: fixture("reporter.mjs") }] }),
      );

      expect(message).toMatch(/is a 'reporter' plugin, but a 'storage' plugin is required/);
    });

    it("rejects a viewer plugin that declares no bundle", async () => {
      const message = await messageOf(() =>
        build({ viewers: [{ package: fixture("viewer-no-bundle.mjs") }] }),
      );

      expect(message).toMatch(/does not declare a browser bundle/);
    });

    it("rejects a viewer plugin that renders nothing", async () => {
      const message = await messageOf(() =>
        build({ viewers: [{ package: fixture("viewer-no-reports.mjs") }] }),
      );

      expect(message).toMatch(/does not declare which reports it renders/);
    });

    it("rejects a bundle that was never built, at startup", async () => {
      const message = await messageOf(() =>
        build({ viewers: [{ package: fixture("viewer-missing-bundle.mjs") }] }),
      );

      expect(message).toMatch(/there is no file there. Has the plugin been built\?/);
    });
  });

  describe("the parse phase", () => {
    it("reports a required option the config left out", async () => {
      const message = await messageOf(() =>
        build({ connections: [{ name: "prod", package: fixture("storage-required-option.mjs") }] }),
      );

      expect(message).toContain("Invalid plugin options:");
      expect(message).toContain("connection 'prod' option 'path' is required.");
    });

    it("reports an option the plugin never declared", async () => {
      const message = await messageOf(() =>
        build({
          connections: [
            {
              name: "prod",
              package: fixture("storage-required-option.mjs"),
              options: { path: "/r", nope: 1 },
            },
          ],
        }),
      );

      expect(message).toContain("does not have an option 'nope'");
    });

    it("surfaces issues the plugin's own parse phase raised", async () => {
      const message = await messageOf(() =>
        build({ connections: [{ name: "prod", package: fixture("storage-rejecting.mjs") }] }),
      );

      expect(message).toContain("connection 'prod' option 'region' must name a known region.");
    });

    it("reports problems from several connections together", async () => {
      const message = await messageOf(() =>
        build({
          connections: [
            { name: "a", package: fixture("storage-required-option.mjs") },
            { name: "b", package: fixture("storage-rejecting.mjs") },
          ],
        }),
      );

      expect(message).toContain("connection 'a' option 'path' is required.");
      expect(message).toContain("connection 'b' option 'region' must name a known region.");
    });

    it("hands the plugin the options the config supplied", async () => {
      const registry = await build({
        connections: [
          { name: "prod", package: fixture("storage-read.mjs"), options: { label: "x" } },
        ],
      });

      expect(registry.connections.get("prod")?.options).toEqual({ label: "x" });
    });
  });
});
