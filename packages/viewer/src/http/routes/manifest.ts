import type { ServerResponse } from "node:http";
import type { ResolvedViewerConfig } from "../../config/types.js";
import type { Registry } from "../../registry.js";
import { json, NO_STORE } from "../respond.js";

export interface ManifestConnection {
  readonly name: string;
  readonly label: string;
}

export interface ManifestViewer {
  readonly id: string;
  readonly name: string;
  readonly reports: readonly string[];
  /** Where the client fetches this plugin's browser bundle from. */
  readonly bundle: string;
}

export interface Manifest {
  readonly basePath: string;
  readonly connections: readonly ManifestConnection[];
  readonly viewers: readonly ManifestViewer[];
}

/**
 * Everything the client needs to know at boot.
 *
 * Plugin options are deliberately absent: they routinely hold bucket names,
 * tokens and internal hostnames, and the client has no use for them.
 */
export function buildManifest(config: ResolvedViewerConfig, registry: Registry): Manifest {
  return {
    basePath: config.basePath,
    connections: [...registry.connections.values()].map(({ name, label }) => ({ name, label })),
    viewers: registry.viewers.map((viewer) => ({
      id: viewer.id,
      name: viewer.name,
      reports: viewer.reports,
      bundle: `${config.basePath}plugins/${viewer.id}/bundle.js`,
    })),
  };
}

export function handleManifest(
  response: ServerResponse,
  config: ResolvedViewerConfig,
  registry: Registry,
): void {
  json(response, 200, buildManifest(config, registry), NO_STORE);
}
