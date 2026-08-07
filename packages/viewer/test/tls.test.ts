import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:https";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer } from "../src/server.js";
import type { ViewerServer } from "../src/server.js";

const execFile = promisify(execFileCallback);

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

let dir: string;
let viewer: ViewerServer | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "orion-tls-"));
});

afterEach(async () => {
  await viewer?.close();
  viewer = undefined;
  await rm(dir, { recursive: true, force: true });
});

describe("serving over HTTPS", () => {
  it("rejects a certificate path it cannot read", async () => {
    await expect(
      startServer({
        config: false,
        host: "127.0.0.1",
        port: 0,
        tls: { cert: join(dir, "nope.pem"), key: join(dir, "nope.key") },
        connections: [{ name: "local", package: fixture("storage-read.mjs") }],
      }),
    ).rejects.toThrow(/Could not read tls\.cert/);
  });

  it("names the key when only the key is unreadable", async () => {
    await writeFile(join(dir, "cert.pem"), "not really a certificate", "utf8");

    await expect(
      startServer({
        config: false,
        host: "127.0.0.1",
        port: 0,
        tls: { cert: join(dir, "cert.pem"), key: join(dir, "nope.key") },
        connections: [{ name: "local", package: fixture("storage-read.mjs") }],
      }),
    ).rejects.toThrow(/Could not read tls\.key/);
  });

  it("reports an https:// url once listening", async () => {
    viewer = await startServer({
      config: false,
      host: "127.0.0.1",
      port: 0,
      tls: await selfSigned(),
      connections: [{ name: "local", package: fixture("storage-read.mjs") }],
    });

    expect(viewer.url).toMatch(/^https:\/\/127\.0\.0\.1:\d+\/$/);
  });

  it("answers a request over TLS", async () => {
    viewer = await startServer({
      config: false,
      host: "127.0.0.1",
      port: 0,
      tls: await selfSigned(),
      connections: [{ name: "local", package: fixture("storage-read.mjs") }],
    });

    const response = await getOverTls(`${viewer.url}healthz`);

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "ok" });
  });
});

/**
 * A plain GET that tolerates a self-signed certificate. The global `fetch` has
 * no way to relax verification, and the point here is only that the server
 * speaks TLS at all.
 */
function getOverTls(url: string): Promise<{ status: number; body: string }> {
  return new Promise((settle, reject) => {
    const call = request(url, { rejectUnauthorized: false }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        body += chunk;
      });
      response.on("end", () => settle({ status: response.statusCode ?? 0, body }));
    });
    call.on("error", reject);
    call.end();
  });
}

/**
 * A throwaway self-signed certificate, written straight into `dir`.
 *
 * Generated with openssl rather than committed, so the repository carries no
 * key material and nothing can expire out from under the suite. Node has no
 * built-in way to issue a certificate.
 */
async function selfSigned(): Promise<{ cert: string; key: string }> {
  const cert = join(dir, "cert.pem");
  const key = join(dir, "key.pem");

  await execFile("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", key, "-out", cert,
    "-days", "1", "-subj", "/CN=localhost",
  ]);

  return { cert, key };
}
