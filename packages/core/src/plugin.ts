import type { OptionSpec, OptionValues, OptionsResult } from "./options.js";

/**
 * Plugins are split by role so that CI/CD workflows only install the code they
 * need -- a pipeline that generates and uploads a report never has to pull in
 * the rendering code used by the viewer.
 */
export type PluginKind = "reporter" | "storage" | "viewer";

/**
 * Common shape every plugin package exports.
 *
 * `TOptions` is the plugin's own options type: whatever `parseOptions` builds
 * is what its role method receives. A host that only loads plugins generically
 * leaves it as `unknown`.
 */
export interface Plugin<TOptions = unknown> {
  readonly kind: PluginKind;
  /** Human-readable name, used in error messages and help output. */
  readonly name: string;
  /** Named arguments this plugin adds to `orion generate`. */
  readonly options?: readonly OptionSpec[];
  /**
   * Validates the raw values a host collected for this plugin and builds the
   * options its role method will use.
   *
   * This runs as a phase of its own, before any plugin does real work, so that
   * a misconfigured run fails having produced nothing -- and so that every
   * problem is reported together rather than one per attempt. Report bad input
   * as issues; reserve throwing for a genuine bug in the plugin.
   */
  parseOptions(values: OptionValues): OptionsResult<TOptions>;
}

/** The payload produced by a reporter and persisted by a storage plugin. */
export interface Report {
  /** Identifies the report type, e.g. `pulumi-diff`. Viewers key off this. */
  readonly kind: string;
  /** Schema version of `data`, owned by the reporter that produced it. */
  readonly version: number;
  /** ISO-8601 timestamp of when the report was generated. */
  readonly generatedAt: string;
  readonly data: unknown;
}

export interface ReporterContext<TOptions = unknown> {
  /**
   * Positional arguments, passed through verbatim. These are file names or
   * glob patterns; expansion is the reporter's responsibility since only it
   * knows which of its inputs are directories, archives or multi-file sets.
   */
  readonly patterns: readonly string[];
  /** Whatever this plugin's `parseOptions` built. */
  readonly options: TOptions;
}

export interface ReporterPlugin<TOptions = unknown> extends Plugin<TOptions> {
  readonly kind: "reporter";
  generate(context: ReporterContext<TOptions>): Promise<Report>;
}

export interface StorageContext<TOptions = unknown> {
  readonly report: Report;
  /** Whatever this plugin's `parseOptions` built. */
  readonly options: TOptions;
}

/** Where a report ended up, so the CLI can print a viewer link. */
export interface StorageResult {
  /** Identifier the viewer uses to retrieve the report from this storage. */
  readonly id: string;
  /** Direct link to the stored report, when the backend exposes one. */
  readonly url?: string;
}

export interface StoragePlugin<TOptions = unknown> extends Plugin<TOptions> {
  readonly kind: "storage";
  store(context: StorageContext<TOptions>): Promise<StorageResult>;
}
