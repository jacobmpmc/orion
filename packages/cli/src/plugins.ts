import { loadPlugin, parsePluginOptions as parseWith } from "@orion/host";
import type { OptionsResult, Plugin, ReporterPlugin, WritableStoragePlugin } from "@orion/core";
import { CliError } from "./args.js";

/** Turns a loader message into the error the commands already know how to print. */
const fail = (message: string): Error => new CliError(message);

export async function loadReporter(specifier: string): Promise<ReporterPlugin> {
  const plugin = await loadPlugin(specifier, {
    kind: "reporter",
    methods: ["generate"],
    fail,
    from: import.meta.url,
  });
  return plugin as ReporterPlugin;
}

/**
 * `generate` only ever writes, so a backend that cannot `store` is rejected
 * here rather than at the call site -- and the narrowed return type is what
 * keeps `storage.store(...)` type-checking now that the method is optional.
 */
export async function loadStorage(specifier: string): Promise<WritableStoragePlugin> {
  const plugin = await loadPlugin(specifier, {
    kind: "storage",
    methods: ["store"],
    fail,
    from: import.meta.url,
  });
  return plugin as WritableStoragePlugin;
}

export function parsePluginOptions(
  plugin: Plugin,
  values: Parameters<Plugin["parseOptions"]>[0],
): OptionsResult<unknown> {
  return parseWith(plugin, values, fail);
}
