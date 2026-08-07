import { resolve as resolvePath } from "node:path";
import {
  DEFAULT_BASE_PATH,
  DEFAULT_HOST,
  DEFAULT_PORT,
  defaultClientDir,
} from "./defaults.js";
import type { ResolvedViewerConfig, ViewerConfig } from "./types.js";

export interface ConfigLayers {
  /** Passed to `createServer` by an embedding process. Wins everything. */
  readonly moduleArgs?: ViewerConfig;
  /** Parsed from argv by the `orion-viewer` binary. */
  readonly cliArgs?: ViewerConfig;
  /** The config file's contents. */
  readonly file?: ViewerConfig;
  readonly source?: string;
}

function pick<K extends keyof ViewerConfig>(
  layers: readonly (ViewerConfig | undefined)[],
  key: K,
): ViewerConfig[K] | undefined {
  for (const layer of layers) {
    const value = layer?.[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

/** `/orion` and `/orion/` both mean the same mount point; normalise to the latter. */
function normaliseBasePath(basePath: string): string {
  const withLeading = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

/**
 * Settles the layers into one config.
 *
 * Module arguments outrank argv because a process embedding the server chose
 * them explicitly and has no say over the argv it happens to be running under;
 * argv outranks the file because it is the more specific invocation.
 *
 * `connections` and `viewers` are replaced wholesale rather than merged. A
 * half-merged list would silently resurrect a connection the caller thought it
 * had removed, which is the wrong way to be surprised about where reports come
 * from.
 */
export function resolveConfig(layers: ConfigLayers = {}): ResolvedViewerConfig {
  const order = [layers.moduleArgs, layers.cliArgs, layers.file];

  const tls = pick(order, "tls");
  const clientDir = pick(order, "clientDir");

  return {
    host: pick(order, "host") ?? DEFAULT_HOST,
    port: pick(order, "port") ?? DEFAULT_PORT,
    basePath: normaliseBasePath(pick(order, "basePath") ?? DEFAULT_BASE_PATH),
    ...(tls !== undefined ? { tls } : {}),
    connections: pick(order, "connections") ?? [],
    viewers: pick(order, "viewers") ?? [],
    clientDir: clientDir === undefined ? defaultClientDir() : resolvePath(clientDir),
    ...(layers.source !== undefined ? { source: layers.source } : {}),
  };
}
