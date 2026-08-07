import type { OptionValue } from "@orion/core";

/** Raw option values for a plugin, keyed by `OptionSpec.name`. */
export type PluginOptionValues = Readonly<Record<string, OptionValue>>;

/**
 * One named storage backend the viewer can read from.
 *
 * Named rather than singular because a single hosted viewer is meant to be
 * shared between projects, and a link says which backend it came from.
 */
export interface StorageConnectionConfig {
  /** Appears in the URL as `/r/<name>/<id>`. Letters, digits, `.`, `_`, `-`. */
  readonly name: string;
  /** Module specifier of the storage plugin, resolved from the working directory first. */
  readonly package: string;
  /** Shown in the client's connection list. Defaults to `name`. */
  readonly label?: string;
  readonly options?: PluginOptionValues;
}

export interface ViewerPluginConfig {
  readonly package: string;
  readonly options?: PluginOptionValues;
}

/** Paths to the certificate material. Read once at startup. */
export interface TlsConfig {
  readonly cert: string;
  readonly key: string;
  readonly ca?: string;
  readonly passphrase?: string;
}

/** Everything the viewer can be configured with. Every field is optional. */
export interface ViewerConfig {
  /** Interface to bind. Defaults to loopback; a container should pass `0.0.0.0`. */
  readonly host?: string;
  /** `0` binds an ephemeral port, which is what the tests use. */
  readonly port?: number;
  /** Mount prefix when the app sits under a path on a reverse proxy. */
  readonly basePath?: string;
  /** When present the server speaks HTTPS instead of HTTP. */
  readonly tls?: TlsConfig;
  readonly connections?: readonly StorageConnectionConfig[];
  readonly viewers?: readonly ViewerPluginConfig[];
  /** Where the built client lives. Defaults to `dist/client` beside this module. */
  readonly clientDir?: string;
}

/** What a caller passes to `createServer` -- a config, plus how to find a file. */
export interface ViewerConfigInput extends ViewerConfig {
  /** Path to a config module, or `false` to skip discovery entirely. */
  readonly config?: string | false;
}

/** Every field settled and normalised. What the server actually runs on. */
export interface ResolvedViewerConfig {
  readonly host: string;
  readonly port: number;
  /** Always starts and ends with `/`. */
  readonly basePath: string;
  readonly tls?: TlsConfig;
  readonly connections: readonly StorageConnectionConfig[];
  readonly viewers: readonly ViewerPluginConfig[];
  readonly clientDir: string;
  /** The config file this was built from, when there was one. */
  readonly source?: string;
}
