import type { CiMetadata } from "@orion/core";

/**
 * Recognising the CI job a generation ran in, from its environment.
 *
 * Pure, and takes the environment as an argument rather than reading
 * `process.env`, so every provider can be tested without touching the real one.
 *
 * Values are copied from an explicit allowlist and never by pattern. Matching
 * something like `/^CI_/` would be shorter and would also copy GitLab's
 * `CI_JOB_TOKEN` and `CI_REGISTRY_PASSWORD` into a file people share.
 */

export type Environment = Readonly<Record<string, string | undefined>>;

function text(env: Environment, name: string): string | undefined {
  const value = env[name];
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

function number(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** Drops absent fields so the stored JSON has no `"job": undefined` noise. */
function compact(fields: Record<string, unknown>): CiMetadata {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) result[key] = value;
  }
  return result as CiMetadata;
}

function githubActions(env: Environment): CiMetadata {
  const repository = text(env, "GITHUB_REPOSITORY");
  const runId = text(env, "GITHUB_RUN_ID");
  const attempt = text(env, "GITHUB_RUN_ATTEMPT");
  // GitHub Enterprise serves from the customer's own host, so the run URL has
  // to be built from the server the job was told about, not from github.com.
  const server = text(env, "GITHUB_SERVER_URL") ?? "https://github.com";

  let runUrl: string | undefined;
  if (repository !== undefined && runId !== undefined) {
    runUrl = `${server}/${repository}/actions/runs/${runId}`;
    if (attempt !== undefined && attempt !== "1") runUrl += `/attempts/${attempt}`;
  }

  // On a pull_request run the ref is `refs/pull/<n>/merge`; GITHUB_REF_NAME is
  // the same number as `<n>/merge`. Reading the number from there avoids
  // opening GITHUB_EVENT_PATH, which means an fs read and a multi-hundred-KB
  // JSON parse to learn one integer. A push has no PR, and correctly gets none.
  const pullRequest =
    number(/^refs\/pull\/(\d+)\//.exec(text(env, "GITHUB_REF") ?? "")?.[1]) ??
    number(/^(\d+)\//.exec(text(env, "GITHUB_REF_NAME") ?? "")?.[1]);

  return compact({
    provider: "github-actions",
    repository,
    workflow: text(env, "GITHUB_WORKFLOW"),
    job: text(env, "GITHUB_JOB"),
    runId,
    runAttempt: attempt,
    runUrl,
    pullRequest,
    pullRequestUrl:
      pullRequest !== undefined && repository !== undefined
        ? `${server}/${repository}/pull/${pullRequest}`
        : undefined,
    refName: text(env, "GITHUB_REF_NAME"),
    eventName: text(env, "GITHUB_EVENT_NAME"),
    actor: text(env, "GITHUB_ACTOR"),
  });
}

function gitlabCi(env: Environment): CiMetadata {
  // The IID is the number shown in the UI and quoted by humans; CI_MERGE_
  // REQUEST_ID is a global database id nobody recognises.
  const pullRequest = number(text(env, "CI_MERGE_REQUEST_IID"));
  const project = text(env, "CI_PROJECT_URL");

  return compact({
    provider: "gitlab-ci",
    repository: text(env, "CI_PROJECT_PATH"),
    workflow: text(env, "CI_PIPELINE_NAME"),
    job: text(env, "CI_JOB_NAME"),
    runId: text(env, "CI_PIPELINE_ID"),
    runUrl: text(env, "CI_PIPELINE_URL"),
    pullRequest,
    pullRequestUrl:
      pullRequest !== undefined && project !== undefined
        ? `${project}/-/merge_requests/${pullRequest}`
        : undefined,
    refName: text(env, "CI_COMMIT_REF_NAME"),
    eventName: text(env, "CI_PIPELINE_SOURCE"),
    actor: text(env, "GITLAB_USER_LOGIN"),
  });
}

/**
 * Whatever can be said about a runner orion does not know by name.
 *
 * Kept thin deliberately -- only variables that mean the same thing everywhere
 * they appear. Teaching orion a new provider is a function and one line in the
 * table below.
 */
function generic(env: Environment): CiMetadata {
  return compact({
    provider: "generic",
    job: text(env, "JOB_NAME"),
    runId: text(env, "BUILD_NUMBER"),
    runUrl: text(env, "BUILD_URL") ?? text(env, "CIRCLE_BUILD_URL"),
    // Jenkins multibranch sets CHANGE_ID; Circle gives the PR's URL, whose last
    // segment is the number.
    pullRequest:
      number(text(env, "CHANGE_ID")) ??
      number(/\/(\d+)\/?$/.exec(text(env, "CIRCLE_PULL_REQUEST") ?? "")?.[1]),
    pullRequestUrl: text(env, "CIRCLE_PULL_REQUEST"),
  });
}

function isCi(env: Environment): boolean {
  const value = env["CI"];
  if (value === undefined) return false;
  const normalised = value.trim().toLowerCase();
  return normalised !== "" && normalised !== "false" && normalised !== "0";
}

/**
 * The CI job this process is running in, or `undefined` when it is not in one.
 *
 * Order matters: GitHub Actions and GitLab both also set `CI`, so the generic
 * probe has to come last.
 */
export function detectCi(env: Environment): CiMetadata | undefined {
  if (env["GITHUB_ACTIONS"] === "true") return githubActions(env);
  if (env["GITLAB_CI"] === "true") return gitlabCi(env);
  if (isCi(env)) return generic(env);
  return undefined;
}
