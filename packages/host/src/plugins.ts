import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isOptionsResult } from "@orion/core";
import type { OptionsResult, Plugin, PluginKind } from "@orion/core";

/** Builds the host's own user-facing error from a message. */
export type Fail = (message: string) => Error;

export interface LoadOptions {
  readonly kind: PluginKind;
  /**
   * Methods this host needs from the plugin, beyond `parseOptions`.
   *
   * The capability is the host's requirement rather than the role's: a storage
   * plugin is loaded with `["store"]` by `orion generate` and with `["fetch"]`
   * by the viewer, and a backend that only does one of those is still valid.
   */
  readonly methods: readonly string[];
  readonly fail: Fail;
  /**
   * The calling host's own module URL, normally `import.meta.url`.
   *
   * Without it the fallback would resolve relative to this package, which
   * depends on nothing but `@orion/core` -- so a plugin installed alongside the
   * host would not be found. Each host passes its own location.
   */
  readonly from?: string;
}

/**
 * Imports a plugin package, resolving it from the working directory first so
 * that a project-local plugin is picked up ahead of anything installed
 * alongside the host itself.
 */
async function importPackage(
  specifier: string,
  fail: Fail,
  from: string | undefined,
): Promise<Record<string, unknown>> {
  const requireFromCwd = createRequire(join(process.cwd(), "package.json"));

  let target = specifier;
  try {
    target = pathToFileURL(requireFromCwd.resolve(specifier)).href;
  } catch {
    // Fall through to host-relative resolution.
    if (from !== undefined) {
      try {
        target = pathToFileURL(createRequire(from).resolve(specifier)).href;
      } catch {
        // Leave the bare specifier; the import below produces the message.
      }
    }
  }

  try {
    return (await import(target)) as Record<string, unknown>;
  } catch (error) {
    throw fail(
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
  { kind, methods, fail }: LoadOptions,
): void {
  if (!isRecord(candidate)) {
    throw fail(
      `Plugin '${specifier}' does not export a plugin object (expected a default export).`,
    );
  }
  if (candidate["kind"] !== kind) {
    throw fail(
      `Plugin '${specifier}' is a '${String(candidate["kind"])}' plugin, but a '${kind}' plugin is required here.`,
    );
  }
  // Both phases are required: options are built by parseOptions() before the
  // role method is ever called.
  for (const required of [...methods, "parseOptions"]) {
    if (typeof candidate[required] !== "function") {
      throw fail(`Plugin '${specifier}' does not implement ${required}().`);
    }
  }
}

/**
 * Loads and validates a plugin package.
 *
 * Every host does this identically -- the CLI when it runs `generate`, the
 * viewer when it starts up -- but each reports failures with its own error
 * type, so the constructor is passed in rather than owned here.
 */
export async function loadPlugin(specifier: string, options: LoadOptions): Promise<Plugin> {
  const module = await importPackage(specifier, options.fail, options.from);
  const candidate = selectExport(module, options.kind);
  assertPlugin(candidate, specifier, options);
  return candidate as Plugin;
}

/**
 * Runs a plugin's parse phase and checks what comes back. The result crosses
 * the same trust boundary as the module itself, so a plugin returning junk
 * gets named rather than causing a `TypeError` further down.
 */
export function parsePluginOptions(
  plugin: Plugin,
  values: Parameters<Plugin["parseOptions"]>[0],
  fail: Fail,
): OptionsResult<unknown> {
  const result: unknown = plugin.parseOptions(values);

  if (!isOptionsResult(result)) {
    throw fail(
      `Plugin '${plugin.name}' returned an invalid result from parseOptions(); expected { ok: true, options } or { ok: false, issues }.`,
    );
  }

  return result;
}
