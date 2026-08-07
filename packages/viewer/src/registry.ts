import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlugin, parsePluginOptions } from "@orion/host";
import type { OptionIssue, Plugin, ReadableStoragePlugin, ViewerPlugin } from "@orion/core";
import { collectOptions } from "./config/options.js";
import type { PluginOptionValues, ResolvedViewerConfig } from "./config/types.js";
import { ViewerError } from "./errors.js";

const fail = (message: string): Error => new ViewerError(message);

/** One configured storage backend, ready to read from. */
export interface StorageConnection {
  readonly name: string;
  readonly label: string;
  readonly plugin: ReadableStoragePlugin;
  /** Whatever the plugin's own parse phase built. */
  readonly options: unknown;
}

/** One configured viewer plugin, ready to have its bundle served. */
export interface ViewerEntry {
  /** Stable slug used in the bundle URL. */
  readonly id: string;
  readonly name: string;
  readonly reports: readonly string[];
  /** Absolute path of the browser bundle on disk. */
  readonly bundleFile: string;
}

export interface Registry {
  readonly connections: ReadonlyMap<string, StorageConnection>;
  readonly viewers: readonly ViewerEntry[];
}

function slug(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned === "" ? "viewer" : cleaned;
}

/**
 * `bundle` and `reports` are data rather than methods, so the shared loader's
 * checks cannot reach them.
 */
function assertViewerShape(plugin: Plugin, specifier: string): asserts plugin is ViewerPlugin {
  const candidate = plugin as Partial<ViewerPlugin>;

  if (typeof candidate.bundle !== "string" || candidate.bundle === "") {
    throw new ViewerError(
      `Viewer plugin '${specifier}' does not declare a browser bundle. Set 'bundle' to the built module, e.g. new URL("./browser/index.js", import.meta.url).href.`,
    );
  }
  if (
    !Array.isArray(candidate.reports) ||
    candidate.reports.length === 0 ||
    !candidate.reports.every((kind) => typeof kind === "string")
  ) {
    throw new ViewerError(
      `Viewer plugin '${specifier}' does not declare which reports it renders. Set 'reports' to a non-empty array of report kinds.`,
    );
  }
}

/** Accepts either a `file:` URL or a plain path, since both are natural to write. */
function bundlePath(bundle: string): string {
  if (bundle.startsWith("file:")) return fileURLToPath(bundle);
  return isAbsolute(bundle) ? bundle : resolve(bundle);
}

/** Renders one plugin's issues under a heading that says which plugin they came from. */
function renderIssues(
  where: string,
  pluginName: string,
  issues: readonly OptionIssue[],
): string[] {
  return issues.map((issue) =>
    issue.option === undefined
      ? `  ${where} (${pluginName}): ${issue.message}`
      : `  ${where} option '${issue.option}' ${issue.message}`,
  );
}

/**
 * Runs a plugin's parse phase over config-supplied values, gathering issues
 * rather than throwing so every plugin's problems surface together.
 */
function buildOptions(
  where: string,
  plugin: Plugin,
  supplied: PluginOptionValues,
): { options: unknown; issues: readonly string[] } {
  const collected = collectOptions(plugin.options ?? [], supplied);
  if (collected.issues.length > 0) {
    return { options: undefined, issues: renderIssues(where, plugin.name, collected.issues) };
  }

  const result = parsePluginOptions(plugin, collected.values, fail);
  if (!result.ok) {
    return { options: undefined, issues: renderIssues(where, plugin.name, result.issues) };
  }
  return { options: result.options, issues: [] };
}

/**
 * Loads every configured plugin and settles its options.
 *
 * Everything here happens before the server listens, which is the same
 * discipline `orion generate` follows: a misconfigured plugin fails the startup
 * rather than the first request that happens to touch it, and every problem is
 * reported at once.
 */
export async function buildRegistry(config: ResolvedViewerConfig): Promise<Registry> {
  const issues: string[] = [];
  const connections = new Map<string, StorageConnection>();

  for (const entry of config.connections) {
    // Loading with methods: ["fetch"] is what rejects both a reporter package
    // and a write-only backend here, rather than at the first request.
    const plugin = (await loadPlugin(entry.package, {
      kind: "storage",
      methods: ["fetch"],
      fail,
      from: import.meta.url,
    })) as ReadableStoragePlugin;

    const built = buildOptions(`connection '${entry.name}'`, plugin, entry.options ?? {});
    issues.push(...built.issues);

    connections.set(entry.name, {
      name: entry.name,
      label: entry.label ?? entry.name,
      plugin,
      options: built.options,
    });
  }

  const viewers: ViewerEntry[] = [];
  const usedIds = new Map<string, number>();

  for (const entry of config.viewers) {
    const plugin = await loadPlugin(entry.package, {
      kind: "viewer",
      methods: [],
      fail,
      from: import.meta.url,
    });
    assertViewerShape(plugin, entry.package);

    const file = bundlePath(plugin.bundle);
    try {
      const stats = await stat(file);
      if (!stats.isFile()) throw new Error("not a file");
    } catch {
      throw new ViewerError(
        `Viewer plugin '${entry.package}' declares a browser bundle at ${file}, but there is no file there. Has the plugin been built?`,
      );
    }

    const built = buildOptions(`viewer plugin '${plugin.name}'`, plugin, entry.options ?? {});
    issues.push(...built.issues);

    // Two plugins may share a name; the URL segment has to stay unique.
    const base = slug(plugin.name);
    const seen = usedIds.get(base) ?? 0;
    usedIds.set(base, seen + 1);

    viewers.push({
      id: seen === 0 ? base : `${base}-${seen + 1}`,
      name: plugin.name,
      reports: plugin.reports,
      bundleFile: file,
    });
  }

  if (issues.length > 0) {
    throw new ViewerError(["Invalid plugin options:", ...issues].join("\n"));
  }

  return { connections, viewers };
}
