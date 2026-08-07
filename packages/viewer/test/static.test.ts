import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { ViewerConfigInput } from "../src/config/types.js";
import { startServer } from "../src/server.js";
import type { ViewerServer } from "../src/server.js";

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

let viewer: ViewerServer | undefined;

afterEach(async () => {
  await viewer?.close();
  viewer = undefined;
});

async function start(overrides: ViewerConfigInput = {}): Promise<string> {
  viewer = await startServer({
    config: false,
    host: "127.0.0.1",
    port: 0,
    clientDir: fixture("client"),
    connections: [{ name: "local", package: fixture("storage-read.mjs") }],
    ...overrides,
  });
  return viewer.url;
}

describe("serving the built client", () => {
  it("serves the shell at the root", async () => {
    const base = await start();
    const response = await fetch(base);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    await expect(response.text()).resolves.toContain('<div id="app">');
  });

  it("serves an asset with its own content type", async () => {
    const base = await start();
    const css = await fetch(`${base}assets/app.css`);
    const js = await fetch(`${base}assets/app.js`);

    expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(js.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  });

  it("marks hashed assets immutable but never the shell", async () => {
    const base = await start();

    expect((await fetch(`${base}assets/app.js`)).headers.get("cache-control")).toContain(
      "immutable",
    );
    expect((await fetch(base)).headers.get("cache-control")).toBe("no-store");
  });
});

describe("the SPA fallback", () => {
  it("serves the shell for a report deep link", async () => {
    const base = await start();
    const response = await fetch(`${base}r/local/report.json`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  it("serves the shell for a deep link whose id contains slashes", async () => {
    const base = await start();

    expect((await fetch(`${base}r/local/runs/42/diff.json`)).status).toBe(200);
  });

  it("does not fall back for an API path", async () => {
    const base = await start();

    expect((await fetch(`${base}api/nope`)).status).toBe(404);
  });
});

describe("path traversal", () => {
  it("404s an encoded escape from the client directory", async () => {
    const base = await start();

    expect((await fetch(`${base}%2e%2e%2fstorage-read.mjs`)).status).toBe(404);
  });

  it("404s a deep encoded escape", async () => {
    const base = await start();
    const response = await fetch(`${base}assets/%2e%2e%2f%2e%2e%2fviewer.mjs`);

    expect(response.status).toBe(404);
  });
});

describe("a base path", () => {
  it("serves everything under the prefix", async () => {
    const base = await start({ basePath: "/orion" });

    expect(base).toMatch(/\/orion\/$/);
    expect((await fetch(`${base}healthz`)).status).toBe(200);
    expect((await fetch(`${base}api/manifest`)).status).toBe(200);
  });

  it("404s anything outside the prefix", async () => {
    const base = await start({ basePath: "/orion" });
    const origin = new URL(base).origin;

    expect((await fetch(`${origin}/healthz`)).status).toBe(404);
  });

  it("rewrites asset URLs and announces the base to the client", async () => {
    const base = await start({ basePath: "/orion" });
    const html = await (await fetch(base)).text();

    expect(html).toContain('"/orion/assets/app.js"');
    expect(html).not.toContain('"/assets/app.js"');
    expect(html).toContain('window.__ORION_BASE__="/orion/"');
  });

  it("reports the mount point in the manifest", async () => {
    const base = await start({ basePath: "/orion" });
    const manifest = (await (await fetch(`${base}api/manifest`)).json()) as { basePath: string };

    expect(manifest.basePath).toBe("/orion/");
  });
});

describe("when the client has not been built", () => {
  it("503s with the command that fixes it", async () => {
    const base = await start({ clientDir: fixture("no-such-client") });
    const response = await fetch(base);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "client_not_built", message: expect.stringContaining("build:client") },
    });
  });

  it("still serves the API", async () => {
    const base = await start({ clientDir: fixture("no-such-client") });

    expect((await fetch(`${base}api/manifest`)).status).toBe(200);
    expect((await fetch(`${base}api/reports/local/report.json`)).status).toBe(200);
  });
});
