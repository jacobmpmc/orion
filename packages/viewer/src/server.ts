import { readFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import type { Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { ServerOptions as TlsServerOptions } from "node:https";
import { loadConfigFile } from "./config/load.js";
import { resolveConfig } from "./config/resolve.js";
import type { ResolvedViewerConfig, ViewerConfigInput } from "./config/types.js";
import { ViewerError } from "./errors.js";
import { createHandler } from "./http/router.js";
import { buildRegistry } from "./registry.js";
import type { Registry } from "./registry.js";

export interface ViewerServer {
  readonly config: ResolvedViewerConfig;
  readonly registry: Registry;
  /** The underlying Node server, for anything this interface does not cover. */
  readonly server: Server;
  /** Valid once listening; carries the port actually bound. */
  readonly url: string;
  listen(): Promise<ViewerServer>;
  close(): Promise<void>;
}

async function readTls(config: ResolvedViewerConfig): Promise<TlsServerOptions | undefined> {
  if (config.tls === undefined) return undefined;
  const { cert, key, ca, passphrase } = config.tls;

  // Read now rather than at the first handshake, so an unreadable path names
  // itself while someone is still watching the startup output.
  async function read(path: string, field: string): Promise<Buffer> {
    try {
      return await readFile(path);
    } catch (error) {
      throw new ViewerError(
        `Could not read tls.${field} at ${path}.\n  ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    cert: await read(cert, "cert"),
    key: await read(key, "key"),
    ...(ca !== undefined ? { ca: await read(ca, "ca") } : {}),
    ...(passphrase !== undefined ? { passphrase } : {}),
  };
}

/** Builds the URL a person should open, from the address actually bound. */
function boundUrl(server: Server, config: ResolvedViewerConfig): string {
  const address = server.address();
  const scheme = config.tls === undefined ? "http" : "https";

  if (address === null || typeof address === "string") {
    return `${scheme}://${config.host}:${config.port}${config.basePath}`;
  }

  // A wildcard bind is not something you can paste into a browser.
  const host =
    address.address === "::" || address.address === "0.0.0.0"
      ? "localhost"
      : address.family === "IPv6"
        ? `[${address.address}]`
        : address.address;

  return `${scheme}://${host}:${address.port}${config.basePath}`;
}

/**
 * Builds the server without binding a port.
 *
 * Config is settled and every plugin is loaded and validated here, so a
 * misconfigured viewer fails before it can accept a single request.
 */
export async function createServer(input: ViewerConfigInput = {}): Promise<ViewerServer> {
  const { config: moduleArgs, ...rest } = input;
  const file = await loadConfigFile(moduleArgs);

  const config = resolveConfig({
    moduleArgs: rest,
    ...(file !== undefined ? { file: file.config, source: file.source } : {}),
  });

  const registry = await buildRegistry(config);
  const handler = await createHandler({ config, registry });

  const tls = await readTls(config);
  const server =
    tls === undefined
      ? createHttpServer((request, response) => void handler(request, response))
      : createHttpsServer(tls, (request, response) => void handler(request, response));

  const viewer: ViewerServer = {
    config,
    registry,
    server,
    get url() {
      return boundUrl(server, config);
    },

    listen() {
      return new Promise<ViewerServer>((settle, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          server.removeListener("error", reject);
          settle(viewer);
        });
      });
    },

    close() {
      return new Promise<void>((settle, reject) => {
        // Without this a keep-alive connection holds the process -- and any
        // test suite -- open until the client gives up.
        server.closeAllConnections();
        server.close((error) => (error === undefined ? settle() : reject(error)));
      });
    },
  };

  return viewer;
}

/** `createServer` followed by `listen`. */
export async function startServer(input: ViewerConfigInput = {}): Promise<ViewerServer> {
  const viewer = await createServer(input);
  return viewer.listen();
}
