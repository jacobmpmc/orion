import type { IncomingMessage, ServerResponse } from "node:http";
import type { ResolvedViewerConfig } from "../config/types.js";
import type { Registry } from "../registry.js";
import { HttpError, notFound } from "./errors.js";
import { json, sendError } from "./respond.js";
import { handleBundle } from "./routes/bundle.js";
import { handleManifest } from "./routes/manifest.js";
import { handleReport } from "./routes/report.js";
import { createStaticHandler } from "./static.js";

export type RequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>;

export interface HandlerOptions {
  readonly config: ResolvedViewerConfig;
  readonly registry: Registry;
  /** Where server-side faults go. Injected so tests can capture them. */
  readonly log?: (message: string) => void;
}

/**
 * Strips the mount prefix off a path, or returns undefined when the request is
 * outside it.
 */
function underBasePath(pathname: string, basePath: string): string | undefined {
  if (basePath === "/") return pathname;
  if (pathname === basePath.slice(0, -1)) return "/";
  if (!pathname.startsWith(basePath)) return undefined;
  return pathname.slice(basePath.length - 1);
}

export async function createHandler({
  config,
  registry,
  log = (message) => process.stderr.write(`orion-viewer: ${message}\n`),
}: HandlerOptions): Promise<RequestHandler> {
  const staticHandler = await createStaticHandler(config.clientDir, config.basePath);

  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    // Every route reads; nothing is ever posted, because a report the user drops
    // in is parsed in the browser and never uploaded.
    if (request.method !== "GET" && request.method !== "HEAD") {
      throw new HttpError(405, "method_not_allowed", "Only GET is supported.");
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    const mounted = underBasePath(url.pathname, config.basePath);
    if (mounted === undefined) throw notFound("not_found", "Not found.");

    const segments = mounted.split("/").filter((segment) => segment !== "");

    if (segments[0] === "healthz" && segments.length === 1) {
      json(response, 200, { status: "ok" });
      return;
    }

    if (segments[0] === "api") {
      if (segments[1] === "manifest" && segments.length === 2) {
        handleManifest(response, config, registry);
        return;
      }
      if (segments[1] === "reports") {
        await handleReport(response, registry, segments.slice(2), log);
        return;
      }
      throw notFound("not_found", "No such endpoint.");
    }

    if (segments[0] === "plugins") {
      await handleBundle(response, registry, segments.slice(1));
      return;
    }

    await staticHandler.serve(response, mounted);
  }

  return async (request, response) => {
    try {
      await route(request, response);
    } catch (error) {
      if (error instanceof HttpError) {
        sendError(response, error);
        return;
      }
      // A genuine bug: report it as a 500 rather than leaving the socket open,
      // but keep the detail on the console where it belongs.
      log(error instanceof Error ? (error.stack ?? error.message) : String(error));
      sendError(response, new HttpError(500, "internal_error", "Something went wrong."));
    }
  };
}
