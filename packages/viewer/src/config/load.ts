import { access } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ViewerError } from "../errors.js";
import { CONFIG_FILE_NAMES } from "./defaults.js";
import type { ViewerConfig } from "./types.js";
import { validateConfig } from "./validate.js";

export interface LoadedConfig {
  readonly config: ViewerConfig;
  /** The file it came from, as given, for error messages. */
  readonly source: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds a config file in the working directory.
 *
 * Deliberately no walk up the tree: the viewer is normally started in a
 * container or a service directory, where silently inheriting a config from
 * somewhere above would be very hard to explain.
 */
async function discover(cwd: string): Promise<string | undefined> {
  for (const name of CONFIG_FILE_NAMES) {
    const candidate = resolve(cwd, name);
    if (await exists(candidate)) return candidate;
  }
  return undefined;
}

async function importConfig(path: string): Promise<unknown> {
  let module: Record<string, unknown>;
  try {
    module = (await import(pathToFileURL(path).href)) as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // Node only strips types from 22.18 onwards, and the failure it produces is
    // an opaque syntax error, so a .ts config gets the explanation attached.
    const hint = path.endsWith(".ts")
      ? "\n  A TypeScript config file needs Node 22.18 or newer. Compile it, or rename it to .js."
      : "";
    throw new ViewerError(`Could not load the configuration file ${path}.\n  ${detail}${hint}`);
  }

  // Same discipline as picking a plugin out of its module: accept the
  // conventional export, do not guess.
  return module["default"] ?? module["config"];
}

/**
 * Loads the config file, if there is one.
 *
 * `explicit` is the `--config` flag or the `config` input: a path must exist,
 * `false` skips discovery entirely, and `undefined` means look for the usual
 * names in `cwd`.
 */
export async function loadConfigFile(
  explicit: string | false | undefined,
  cwd: string = process.cwd(),
): Promise<LoadedConfig | undefined> {
  if (explicit === false) return undefined;

  let path: string | undefined;
  if (explicit !== undefined) {
    path = isAbsolute(explicit) ? explicit : resolve(cwd, explicit);
    if (!(await exists(path))) {
      throw new ViewerError(`No configuration file at ${explicit}.`);
    }
  } else {
    path = await discover(cwd);
    if (path === undefined) return undefined;
  }

  const raw = await importConfig(path);
  if (raw === undefined) {
    throw new ViewerError(
      `Invalid configuration in ${path}:\n  the module has no default export.`,
    );
  }

  return { config: validateConfig(raw, path), source: path };
}
