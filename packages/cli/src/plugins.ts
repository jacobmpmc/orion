import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isOptionsResult } from "@orion/core";
import type { OptionsResult, Plugin, PluginKind, ReporterPlugin, StoragePlugin } from "@orion/core";
import { CliError } from "./args.js";

/**
 * Imports a plugin package, resolving it from the working directory first so
 * that a project-local plugin is picked up ahead of anything installed
 * alongside the CLI itself.
 */
async function importPackage(specifier: string): Promise<Record<string, unknown>> {
  const requireFromCwd = createRequire(join(process.cwd(), "package.json"));

  let target = specifier;
  try {
    target = pathToFileURL(requireFromCwd.resolve(specifier)).href;
  } catch {
    // Fall through to CLI-relative resolution.
  }

  try {
    return (await import(target)) as Record<string, unknown>;
  } catch (error) {
    throw new CliError(
      `Could not load plugin '${specifier}'. Is it installed?\n  ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Picks the plugin out of a module's exports, accepting a default export or a
 * named export matching the role.
 */
function selectExport(module: Record<string, unknown>, kind: PluginKind): unknown {
  return module["default"] ?? module[kind] ?? module["plugin"];
}

function assertPlugin(
  candidate: unknown,
  specifier: string,
  kind: PluginKind,
  method: string,
): void {
  if (!isRecord(candidate)) {
    throw new CliError(
      `Plugin '${specifier}' does not export a plugin object (expected a default export).`,
    );
  }
  if (candidate["kind"] !== kind) {
    throw new CliError(
      `Plugin '${specifier}' is a '${String(candidate["kind"])}' plugin, but a '${kind}' plugin is required here.`,
    );
  }
  // Both phases are required: options are built by parseOptions() before the
  // role method is ever called.
  for (const required of [method, "parseOptions"]) {
    if (typeof candidate[required] !== "function") {
      throw new CliError(`Plugin '${specifier}' does not implement ${required}().`);
    }
  }
}

export async function loadReporter(specifier: string): Promise<ReporterPlugin> {
  const module = await importPackage(specifier);
  const candidate = selectExport(module, "reporter");
  assertPlugin(candidate, specifier, "reporter", "generate");
  return candidate as ReporterPlugin;
}

export async function loadStorage(specifier: string): Promise<StoragePlugin> {
  const module = await importPackage(specifier);
  const candidate = selectExport(module, "storage");
  assertPlugin(candidate, specifier, "storage", "store");
  return candidate as StoragePlugin;
}

/**
 * Runs a plugin's parse phase and checks what comes back. The result crosses
 * the same trust boundary as the module itself, so a plugin returning junk
 * gets named rather than causing a `TypeError` further down.
 */
export function parsePluginOptions(
  plugin: Plugin,
  values: Parameters<Plugin["parseOptions"]>[0],
): OptionsResult<unknown> {
  const result: unknown = plugin.parseOptions(values);

  if (!isOptionsResult(result)) {
    throw new CliError(
      `Plugin '${plugin.name}' returned an invalid result from parseOptions(); expected { ok: true, options } or { ok: false, issues }.`,
    );
  }

  return result;
}
