import { fileURLToPath } from "node:url";

/**
 * Loopback rather than `0.0.0.0`, so running the binary on a workstation does
 * not put reports on the LAN. The Dockerfile passes `--host 0.0.0.0`, where
 * binding loopback would instead make the container unreachable.
 */
export const DEFAULT_HOST = "127.0.0.1";

export const DEFAULT_PORT = 7317;

export const DEFAULT_BASE_PATH = "/";

/** Tried in order, in the working directory only. */
export const CONFIG_FILE_NAMES: readonly string[] = [
  "orion-viewer.config.ts",
  "orion-viewer.config.js",
  "orion-viewer.config.mjs",
];

/**
 * `dist/client`, resolved relative to this module rather than the working
 * directory so the binary works from anywhere.
 */
export function defaultClientDir(): string {
  return fileURLToPath(new URL("../client/", import.meta.url));
}
