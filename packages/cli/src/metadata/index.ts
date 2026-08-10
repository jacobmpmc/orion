import type { ReportMetadata } from "@orion/core";
import { detectCi, type Environment } from "./ci.js";
import { collectGit, type GitRunner } from "./git.js";

export { parseCustomEntries } from "./custom.js";
export type { CustomResult } from "./custom.js";
export { detectCi } from "./ci.js";
export type { Environment } from "./ci.js";
export { collectGit, gitRunner } from "./git.js";
export type { GitRunner } from "./git.js";
export { redactRemoteUrl } from "./redact.js";

/**
 * Collecting the provenance `orion generate` attaches to a report.
 *
 * This lives in the CLI rather than in `@orion/core` because it needs
 * `node:child_process`, and core has to stay importable from a browser bundle.
 * It is not in `@orion/plugin-toolkit` either: that package is for plugins,
 * hosts deliberately do not depend on it, and nothing but this one command ever
 * calls this code.
 */
export interface CollectOptions {
  readonly cwd: string;
  /** Passed in rather than read from `process.env`, so tests need no globals. */
  readonly env: Environment;
  /** Entries from `--metadata key=value`, already parsed. */
  readonly custom?: Readonly<Record<string, string>>;
  /** Overridden by tests to avoid spawning git. */
  readonly run?: GitRunner;
}

/**
 * Always resolves, never rejects.
 *
 * Metadata is context, not the point of the run: a report that generated
 * successfully must still be stored when git is missing or the CI variables are
 * unfamiliar. Each collector already swallows its own failures, and this catch
 * is the backstop for anything they did not anticipate.
 *
 * `collectedAt` is set unconditionally, which is what lets a reader tell
 * "collection ran and found nothing" from "metadata was never collected".
 */
export async function collectMetadata(options: CollectOptions): Promise<ReportMetadata> {
  const metadata: Record<string, unknown> = { collectedAt: new Date().toISOString() };

  try {
    const git = await collectGit(options.cwd, options.run);
    if (git !== undefined) metadata["git"] = git;
  } catch {
    // A collector threw where it should have returned undefined. Absent field.
  }

  const ci = detectCi(options.env);
  if (ci !== undefined) metadata["ci"] = ci;

  if (options.custom !== undefined && Object.keys(options.custom).length > 0) {
    metadata["custom"] = options.custom;
  }

  return metadata as ReportMetadata;
}
