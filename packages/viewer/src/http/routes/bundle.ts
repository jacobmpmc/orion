import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import type { Registry } from "../../registry.js";
import { notFound } from "../errors.js";

/**
 * Serves a viewer plugin's browser bundle.
 *
 * The file path comes from the registry, never from the URL -- the URL only
 * supplies an id looked up in a list settled at startup -- so there is nothing
 * here for a traversal attempt to work on.
 */
export async function handleBundle(
  response: ServerResponse,
  registry: Registry,
  rest: readonly string[],
): Promise<void> {
  const [id, tail] = rest;
  const entry = registry.viewers.find((viewer) => viewer.id === id);

  if (entry === undefined || tail !== "bundle.js" || rest.length !== 2) {
    throw notFound("unknown_bundle", "No viewer plugin bundle at that address.");
  }

  const stats = await stat(entry.bundleFile);
  response.writeHead(200, {
    "content-type": "text/javascript; charset=utf-8",
    "content-length": stats.size,
    // The URL is stable for the life of the process and the file cannot change
    // under it, since a missing bundle fails startup.
    "cache-control": "public, max-age=31536000, immutable",
  });
  createReadStream(entry.bundleFile).pipe(response);
}
