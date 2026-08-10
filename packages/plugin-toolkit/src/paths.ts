import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Rewrites a path with forward slashes.
 *
 * Anything a plugin puts into a report or a storage id outlives the machine
 * that produced it: a report generated on Windows is read back by a viewer on
 * Linux, so a backslash in a stored path is a bug waiting for the trip.
 */
export function posixPath(path: string): string {
  return path.split(sep).join("/");
}

/**
 * A path relative to `root`, with forward slashes.
 *
 * Resolving before relativising is what makes the result independent of the
 * platform the path was written on. A path that falls outside the root is
 * returned absolute rather than as a chain of `..`, which reads better and is
 * what a monorepo run from a subdirectory produces.
 */
export function relativeTo(root: string, path: string): string {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel)
    ? posixPath(absolute)
    : posixPath(rel);
}

/**
 * True when `name` resolves to something inside `root` rather than beside or
 * above it.
 *
 * The check every plugin needs before joining a root with a name it did not
 * choose -- a report id that came back through a URL, a file name a user
 * passed. `..` is the obvious case; an absolute `name` is the one that gets
 * missed, since `resolve` silently discards the root.
 */
export function isContained(root: string, name: string): boolean {
  const rel = relative(root, resolve(root, name));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
