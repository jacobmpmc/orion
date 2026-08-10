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
  /**
   * Where the report came from: the commit, the CI run, whatever the user
   * added. Attached by `orion generate` after the reporter returns, never by
   * the reporter itself -- a reporter should not have to reimplement
   * `git rev-parse`, and every report should carry the same facts regardless of
   * which one produced it.
   *
   * Optional because a report written before this existed, or generated with
   * `--no-metadata`, has none. Read it with the helpers in `metadata.ts` rather
   * than reaching in: what arrives from storage is arbitrary JSON.
   */
  readonly metadata?: ReportMetadata;
}

/**
 * Provenance for a report.
 *
 * Grouped by who produced each fact rather than flattened, so a user's
 * `--metadata branch=...` can never be mistaken for the git branch, and so a
 * later version can add a namespace without disturbing the ones already here.
 *
 * Extensibility is the open index signature plus all-optional fields, not a
 * version number: growth is additive, so there is nothing a reader would branch
 * on -- and a version would only invite `if (v >= 2)` code that breaks on 3. A
 * reader takes the fields it recognises and ignores the rest, which works in
 * both directions across versions.
 */
export interface ReportMetadata {
  /** ISO-8601 instant collection ran. */
  readonly collectedAt: string;
  readonly git?: GitMetadata;
  readonly ci?: CiMetadata;
  /** Entries the user passed as `--metadata key=value`. */
  readonly custom?: Readonly<Record<string, string>>;
  /** Namespaces this version does not model, including future ones. */
  readonly [namespace: string]: unknown;
}

/** The checked-out repository state when the report was generated. */
export interface GitMetadata {
  /** Full 40-character commit sha. */
  readonly commit?: string;
  /** Absent on a detached HEAD, which is normal in CI. */
  readonly branch?: string;
  /** A tag pointing at HEAD, when there is one. */
  readonly tag?: string;
  /** First line of the commit message. */
  readonly subject?: string;
  /** Author name. The email is deliberately not collected. */
  readonly author?: string;
  /** ISO-8601 commit date. */
  readonly committedAt?: string;
  /** Tracked files differed from HEAD, so the report may not match the commit. */
  readonly dirty?: boolean;
  readonly remotes?: readonly GitRemote[];
  readonly [key: string]: unknown;
}

/** A configured remote, with any credentials in the URL redacted. */
export interface GitRemote {
  readonly name: string;
  readonly url: string;
}

/** The CI job that ran the generation, read from its environment variables. */
export interface CiMetadata {
  /** `github-actions`, `gitlab-ci`, or `generic` when only `CI` was set. */
  readonly provider?: string;
  /** `owner/name`, in whatever form the provider uses. */
  readonly repository?: string;
  readonly workflow?: string;
  readonly job?: string;
  /** Strings, not numbers: every value here arrives as an environment variable. */
  readonly runId?: string;
  readonly runAttempt?: string;
  readonly runUrl?: string;
  /** Pull or merge request number, when the run belongs to one. */
  readonly pullRequest?: number;
  readonly pullRequestUrl?: string;
  readonly refName?: string;
  readonly eventName?: string;
  readonly actor?: string;
  readonly [key: string]: unknown;
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

export interface FetchContext<TOptions = unknown> {
  /** The `StorageResult.id` this backend previously returned, verbatim. */
  readonly id: string;
  /** Whatever this plugin's `parseOptions` built. */
  readonly options: TOptions;
}

/**
 * A storage backend.
 *
 * Both methods are optional and independent: `orion generate` only ever writes
 * and the viewer only ever reads, so a write-only backend (an artifact
 * uploader) or a read-only one (a mirror someone else fills) is a legitimate
 * plugin. A host narrows to the capability it needs when it loads the plugin,
 * which is why the type itself does not demand either.
 */
export interface StoragePlugin<TOptions = unknown> extends Plugin<TOptions> {
  readonly kind: "storage";
  store?(context: StorageContext<TOptions>): Promise<StorageResult>;
  /**
   * Retrieves a previously stored report.
   *
   * Resolving `undefined` means no report exists for that id, which is a normal
   * answer rather than a failure. Throw only when the backend itself cannot be
   * reached or answers with something unusable.
   */
  fetch?(context: FetchContext<TOptions>): Promise<Report | undefined>;
}

/** A `StoragePlugin` known to implement `store`. */
export type WritableStoragePlugin<TOptions = unknown> = StoragePlugin<TOptions> &
  Required<Pick<StoragePlugin<TOptions>, "store">>;

/** A `StoragePlugin` known to implement `fetch`. */
export type ReadableStoragePlugin<TOptions = unknown> = StoragePlugin<TOptions> &
  Required<Pick<StoragePlugin<TOptions>, "fetch">>;

/**
 * Renders one or more report kinds in the viewer app.
 *
 * Unlike the other roles this one has no method the host calls: the rendering
 * happens in a browser, in a bundle the viewer serves to the client. The plugin
 * object's job is to declare what it renders and where that bundle lives.
 */
export interface ViewerPlugin<TOptions = unknown> extends Plugin<TOptions> {
  readonly kind: "viewer";
  /** `Report.kind` values this plugin renders. The dispatch key. */
  readonly reports: readonly string[];
  /**
   * Absolute path or `file:` URL of the built browser ESM module.
   *
   * Declared as data rather than imported, because the server process must
   * never evaluate browser code -- it only reads the file's bytes and serves
   * them. Typically `new URL("./browser/index.js", import.meta.url).href`.
   */
  readonly bundle: string;
}

/** What a viewer plugin's browser bundle is handed when it mounts. */
export interface ViewerMountContext {
  readonly report: Report;
  /** Where the report came from, absent when the user dropped it in. */
  readonly source?: {
    readonly connection: string;
    readonly id: string;
  };
}

export type ViewerUnmount = () => void;

/**
 * The one export a viewer plugin's browser bundle must provide.
 *
 * `TElement` is a type parameter rather than `HTMLElement` because this package
 * compiles without the DOM lib; a plugin's own browser build instantiates it.
 * The contract is deliberately DOM-only so a plugin can use any framework
 * internally without having to match the host app's.
 */
export type ViewerMount<TElement = unknown> = (
  element: TElement,
  context: ViewerMountContext,
) => ViewerUnmount | Promise<ViewerUnmount>;
