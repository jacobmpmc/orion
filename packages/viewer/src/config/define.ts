import type { ViewerConfig } from "./types.js";

/**
 * Identity function that gives a config file's object literal a contextual
 * type, so an editor completes the fields and a typo is caught where it is
 * written rather than when the server starts.
 *
 * Exported from the `@orion/viewer/config` subpath so importing it from a
 * config file does not pull the server in.
 */
export function defineConfig(config: ViewerConfig): ViewerConfig {
  return config;
}

export type {
  PluginOptionValues,
  StorageConnectionConfig,
  TlsConfig,
  ViewerConfig,
  ViewerPluginConfig,
} from "./types.js";
