import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Report } from "@orion/core";
import type { ViewerConfigInput } from "../src/config/types.js";
import { startServer } from "../src/server.js";
import type { ViewerServer } from "../src/server.js";

interface StorageCall {
  readonly role: string;
  readonly id: string;
  readonly options: unknown;
}

declare global {
  var __orionCalls: StorageCall[] | undefined;
}

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

let viewer: ViewerServer | undefined;

beforeEach(() => {
  globalThis.__orionCalls = [];
});

afterEach(async () => {
  await viewer?.close();
  viewer = undefined;
});

/**
 * Starts on an ephemeral port so parallel runs never collide, and with
 * `config: false` so a stray config file in the working directory cannot leak
 * into a test.
 */
async function start(overrides: ViewerConfigInput = {}): Promise<string> {
  viewer = await startServer({
    config: false,
    host: "127.0.0.1",
    port: 0,
    clientDir: fixture("client"),
    connections: [{ name: "local", label: "Local disk", package: fixture("storage-read.mjs") }],
    viewers: [{ package: fixture("viewer.mjs") }],
    ...overrides,
  });
  return viewer.url;
}

function calls(): readonly StorageCall[] {
  return globalThis.__orionCalls ?? [];
}

describe("GET /api/manifest", () => {
  it("lists the configured connections and viewers", async () => {
    const base = await start();
    const response = await fetch(`${base}api/manifest`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      basePath: "/",
      connections: [{ name: "local", label: "Local disk" }],
      viewers: [
        {
          id: "fixture-viewer",
          name: "fixture-viewer",
          reports: ["fixture"],
          bundle: "/plugins/fixture-viewer/bundle.js",
        },
      ],
    });
  });

  it("never exposes plugin options", async () => {
    const base = await start({
      connections: [
        { name: "local", package: fixture("storage-read.mjs"), options: { label: "s3cret" } },
      ],
    });

    const body = await (await fetch(`${base}api/manifest`)).text();

    expect(body).not.toContain("s3cret");
  });

  it("is not cached", async () => {
    const base = await start();

    expect((await fetch(`${base}api/manifest`)).headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /api/reports", () => {
  it("returns the report the backend handed back", async () => {
    const base = await start();
    const response = await fetch(`${base}api/reports/local/report.json`);

    expect(response.status).toBe(200);
    const report = (await response.json()) as Report;
    expect(report.kind).toBe("fixture");
  });

  it("passes a slashed id to the backend verbatim", async () => {
    const base = await start();
    await fetch(`${base}api/reports/local/runs/42/diff.json`);

    expect(calls()[0]?.id).toBe("runs/42/diff.json");
  });

  it("decodes a percent-encoded segment", async () => {
    const base = await start();
    await fetch(`${base}api/reports/local/a%20b.json`);

    expect(calls()[0]?.id).toBe("a b.json");
  });

  it("passes the connection's parsed options to the backend", async () => {
    const base = await start({
      connections: [
        { name: "local", package: fixture("storage-read.mjs"), options: { label: "x" } },
      ],
    });
    await fetch(`${base}api/reports/local/report.json`);

    expect(calls()[0]?.options).toEqual({ label: "x" });
  });

  it("404s an unknown connection", async () => {
    const base = await start();
    const response = await fetch(`${base}api/reports/bogus/report.json`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unknown_connection" },
    });
  });

  it("404s when the backend has no such report", async () => {
    const base = await start();
    const response = await fetch(`${base}api/reports/local/missing.json`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "report_not_found" } });
  });

  it("400s a request that names no report", async () => {
    const base = await start();
    const response = await fetch(`${base}api/reports/local`);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "missing_id" } });
  });

  it("500s when the backend returns something that is not a report", async () => {
    const base = await start();
    const response = await fetch(`${base}api/reports/local/not-a-report.json`);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_report" } });
  });

  describe("when the backend throws", () => {
    it("502s", async () => {
      const base = await start();
      const response = await fetch(`${base}api/reports/local/boom.json`);

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "storage_error" } });
    });

    it("does not leak the backend's own message", async () => {
      const base = await start();
      const body = await (await fetch(`${base}api/reports/local/boom.json`)).text();

      expect(body).not.toContain("orion-secret-prod");
      expect(body).toContain("could not be reached");
    });
  });
});

describe("GET /plugins/:id/bundle.js", () => {
  it("serves the plugin's browser bundle", async () => {
    const base = await start();
    const response = await fetch(`${base}plugins/fixture-viewer/bundle.js`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    await expect(response.text()).resolves.toContain("export function mount");
  });

  it("marks the bundle immutable", async () => {
    const base = await start();
    const response = await fetch(`${base}plugins/fixture-viewer/bundle.js`);

    expect(response.headers.get("cache-control")).toContain("immutable");
  });

  it("404s an unknown plugin id", async () => {
    const base = await start();

    expect((await fetch(`${base}plugins/nope/bundle.js`)).status).toBe(404);
  });

  it("404s a path under a known plugin that is not the bundle", async () => {
    const base = await start();

    expect((await fetch(`${base}plugins/fixture-viewer/secrets.js`)).status).toBe(404);
  });
});

describe("the rest of the surface", () => {
  it("answers /healthz", async () => {
    const base = await start();
    const response = await fetch(`${base}healthz`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("405s anything that is not a GET", async () => {
    const base = await start();
    const response = await fetch(`${base}api/manifest`, { method: "POST" });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("404s an endpoint under /api that does not exist", async () => {
    const base = await start();

    expect((await fetch(`${base}api/nope`)).status).toBe(404);
  });

  it("reports the port it actually bound", async () => {
    const base = await start();

    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(base).not.toContain(":0/");
  });
});
