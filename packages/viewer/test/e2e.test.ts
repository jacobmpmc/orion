import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Report } from "@orion/core";
import storage from "@orion/plugin-storage-filesystem";
import { startServer } from "../src/server.js";
import type { ViewerServer } from "../src/server.js";

/**
 * The round trip the two halves of Orion are built around: a CI job stores a
 * report through a storage plugin, and a developer later fetches it back
 * through the viewer over HTTP. Both sides use the real filesystem plugin --
 * nothing here is a fixture standing in for it.
 */
const report: Report = {
  kind: "pulumi-diff",
  version: 1,
  generatedAt: "2026-08-07T09:30:00.000Z",
  data: { changes: [{ resource: "bucket", op: "update" }] },
};

let root: string;
let viewer: ViewerServer | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orion-e2e-"));
});

afterEach(async () => {
  await viewer?.close();
  viewer = undefined;
  await rm(root, { recursive: true, force: true });
});

/** The generation half: what `orion generate` does once the reporter has run. */
async function store(name?: string): Promise<string> {
  const parsed = storage.parseOptions({ path: root, ...(name !== undefined ? { name } : {}) });
  if (!parsed.ok) throw new Error(`unexpected issues: ${JSON.stringify(parsed.issues)}`);

  const result = await storage.store({ report, options: parsed.options });
  return result.id;
}

/** The viewing half: a viewer configured against that same directory. */
async function serve(): Promise<string> {
  viewer = await startServer({
    config: false,
    host: "127.0.0.1",
    port: 0,
    clientDir: fileURLToPath(new URL("./fixtures/client", import.meta.url)),
    connections: [
      {
        name: "local",
        label: "Local disk",
        package: "@orion/plugin-storage-filesystem",
        options: { path: root },
      },
    ],
  });
  return viewer.url;
}

describe("a report's round trip through storage", () => {
  it("serves back exactly what was stored", async () => {
    const id = await store();
    const base = await serve();

    const response = await fetch(`${base}api/reports/local/${id}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(report);
  });

  it("serves a report whose id contains slashes", async () => {
    const id = await store("runs/42/diff.json");
    const base = await serve();

    expect(id).toBe("runs/42/diff.json");
    const response = await fetch(`${base}api/reports/local/${id}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(report);
  });

  it("lists the connection in the manifest under its label", async () => {
    const base = await serve();
    const manifest = (await (await fetch(`${base}api/manifest`)).json()) as {
      connections: { name: string; label: string }[];
    };

    expect(manifest.connections).toEqual([{ name: "local", label: "Local disk" }]);
  });

  it("404s an id that was never stored", async () => {
    const base = await serve();
    const response = await fetch(`${base}api/reports/local/never-written.json`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "report_not_found" } });
  });

  it("404s an id that tries to escape the storage root", async () => {
    await store();
    const base = await serve();

    const response = await fetch(`${base}api/reports/local/..%2F..%2Fsecrets.json`);

    expect(response.status).toBe(404);
  });

  it("answers /healthz while serving", async () => {
    const base = await serve();

    await expect((await fetch(`${base}healthz`)).json()).resolves.toEqual({ status: "ok" });
  });
});

describe("the deep link a CI job prints", () => {
  it("addresses the same report the API serves", async () => {
    const id = await store("runs/42/diff.json");
    const base = await serve();

    // The link a job would print, and the API call the client makes from it.
    const link = `${base}r/local/${id}`;
    const { pathname } = new URL(link);
    const [, , connection, ...idSegments] = pathname.split("/");

    expect(connection).toBe("local");
    const response = await fetch(`${base}api/reports/${connection}/${idSegments.join("/")}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(report);
  });

  it("survives being opened cold, without a client-side navigation", async () => {
    const id = await store("runs/42/diff.json");
    const base = await serve();

    const response = await fetch(`${base}r/local/${id}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });
});
