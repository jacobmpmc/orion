import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitMetadata, GitRemote } from "@orion/core";
import { redactRemoteUrl } from "./redact.js";

/**
 * Reading the checked-out repository by asking `git`.
 *
 * Shelling out rather than parsing `.git` directly: worktrees, packed refs,
 * detached HEAD, submodules and alternates are all cases git already handles
 * correctly and a hand-rolled reader gets subtly wrong. The cost is a few short
 * processes, once per `orion generate`.
 *
 * Nothing here is allowed to fail a run. A machine with no git, a directory
 * that is not a repository, a repository with no commits, a git that hangs --
 * each of those means the field is absent, never that the report is lost.
 */

const run = promisify(execFile);

/** Runs one git command and resolves its stdout. Injected so tests stay pure. */
export type GitRunner = (args: readonly string[]) => Promise<string>;

/** A repository nobody should have to wait on; CI checkouts can be large. */
const TIMEOUT_MS = 2000;
const MAX_BUFFER = 1_000_000;

/** Guards against a pathological repo bloating every report it generates. */
const MAX_REMOTES = 10;
const MAX_TEXT = 512;

export function gitRunner(cwd: string): GitRunner {
  return async (args) => {
    const { stdout } = await run("git", [...args], {
      cwd,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      env: {
        ...process.env,
        // Read-only work should not take the index lock: a CI checkout may be
        // read-only, and a parallel job holding the lock would fail us for
        // nothing.
        GIT_OPTIONAL_LOCKS: "0",
        // Without this a repository with a credential helper can block on a
        // prompt, and a pipeline hangs until it is killed.
        GIT_TERMINAL_PROMPT: "0",
        GIT_PAGER: "cat",
        LC_ALL: "C",
      },
    });
    return stdout;
  };
}

function truncate(value: string): string {
  return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) : value;
}

function clean(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : truncate(trimmed);
}

/** Resolves `undefined` instead of rejecting: one absent fact, not a failure. */
async function attempt(runner: GitRunner, args: readonly string[]): Promise<string | undefined> {
  try {
    return await runner(args);
  } catch {
    return undefined;
  }
}

function parseRemotes(stdout: string): readonly GitRemote[] | undefined {
  // `git remote -v` prints two lines per remote, `<name>\t<url> (fetch|push)`.
  // The fetch and push URLs differ occasionally; the first line wins, which is
  // fetch, and that is the one that identifies where the code came from.
  const remotes: GitRemote[] = [];
  const seen = new Set<string>();

  for (const line of stdout.split("\n")) {
    const match = /^(\S+)\s+(\S+)/.exec(line.trim());
    if (match === null) continue;
    const [, name, url] = match;
    if (name === undefined || url === undefined || seen.has(name)) continue;
    seen.add(name);
    remotes.push({ name: truncate(name), url: truncate(redactRemoteUrl(url)) });
    if (remotes.length === MAX_REMOTES) break;
  }

  return remotes.length > 0 ? remotes : undefined;
}

/**
 * Everything git can tell us about the current checkout.
 *
 * `undefined` when this is not a usable repository -- which the first command
 * establishes on its own, so there is no separate `rev-parse` probe: if
 * `git log` cannot name a commit then git is missing, the directory is not a
 * repository, or nothing has been committed yet, and all three mean the same
 * thing here.
 */
export async function collectGit(
  cwd: string,
  runner: GitRunner = gitRunner(cwd),
): Promise<GitMetadata | undefined> {
  // One process for four fields. %an rather than %ae: the author's name is
  // context, their email is personal data that would end up in shared storage.
  const head = await attempt(runner, ["log", "-1", "--format=%H%n%an%n%cI%n%s"]);
  if (head === undefined) return undefined;

  const [commit, author, committedAt, ...subject] = head.split("\n");
  if (commit === undefined || clean(commit) === undefined) return undefined;

  const [branch, tag, status, remotes] = await Promise.all([
    attempt(runner, ["rev-parse", "--abbrev-ref", "HEAD"]),
    attempt(runner, ["tag", "--points-at", "HEAD"]),
    // -uno: untracked files did not go into whatever was reported on, and
    // skipping them is much faster on a large tree.
    attempt(runner, ["status", "--porcelain", "--untracked-files=no"]),
    attempt(runner, ["remote", "-v"]),
  ]);

  const metadata: Record<string, unknown> = { commit: clean(commit) };

  // A detached HEAD -- the normal state of a GitHub Actions checkout -- reports
  // the literal string "HEAD", which is not a branch name.
  const branchName = branch === undefined ? undefined : clean(branch);
  if (branchName !== undefined && branchName !== "HEAD") metadata["branch"] = branchName;

  const tagName = tag === undefined ? undefined : clean(tag.split("\n")[0] ?? "");
  if (tagName !== undefined) metadata["tag"] = tagName;

  const subjectLine = clean(subject.join("\n"));
  if (subjectLine !== undefined) metadata["subject"] = subjectLine;
  if (author !== undefined && clean(author) !== undefined) metadata["author"] = clean(author);
  if (committedAt !== undefined && clean(committedAt) !== undefined) {
    metadata["committedAt"] = clean(committedAt);
  }

  // Only claimed when status actually ran: "not dirty" and "could not tell"
  // must not look the same.
  if (status !== undefined) metadata["dirty"] = status.trim() !== "";

  const parsed = remotes === undefined ? undefined : parseRemotes(remotes);
  if (parsed !== undefined) metadata["remotes"] = parsed;

  return metadata as GitMetadata;
}
