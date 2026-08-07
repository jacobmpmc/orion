import type {
  ReadableStoragePlugin,
  Report,
  StoragePlugin,
  WritableStoragePlugin,
} from "./plugin.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Narrows a value to a `Report`.
 *
 * A report arrives from outside the process every time it is read: out of a
 * storage plugin the host does not own, off disk, or out of a file a user
 * dropped into the browser. Only the envelope is checked -- `data` is owned by
 * the reporter that produced it and is opaque until a viewer plugin reads it.
 */
export function isReport(value: unknown): value is Report {
  if (!isRecord(value)) return false;
  return (
    typeof value["kind"] === "string" &&
    typeof value["version"] === "number" &&
    typeof value["generatedAt"] === "string" &&
    "data" in value
  );
}

/** Narrows a storage plugin to one that can write. */
export function canStore<TOptions>(
  plugin: StoragePlugin<TOptions>,
): plugin is WritableStoragePlugin<TOptions> {
  return typeof plugin.store === "function";
}

/** Narrows a storage plugin to one that can read. */
export function canFetch<TOptions>(
  plugin: StoragePlugin<TOptions>,
): plugin is ReadableStoragePlugin<TOptions> {
  return typeof plugin.fetch === "function";
}
