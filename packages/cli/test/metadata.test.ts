import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  collectGit,
  collectMetadata,
  detectCi,
  gitRunner,
  parseCustomEntries,
  redactRemoteUrl,
  type GitRunner,
} from "../src/metadata/index.js";

describe("parseCustomEntries", () => {
  it("reads a plain pair", () => {
    expect(parseCustomEntries(["deploy-env=staging"])).toEqual({
      entries: { "deploy-env": "staging" },
      issues: [],
    });
  });

  it("splits on the first = only", () => {
    expect(parseCustomEntries(["args=--depth=3"]).entries).toEqual({ args: "--depth=3" });
  });

  it("accepts an empty value", () => {
    expect(parseCustomEntries(["note="]).entries).toEqual({ note: "" });
  });

  it("trims whitespace around the key but not the value", () => {
    expect(parseCustomEntries([" note = spaced "]).entries).toEqual({ note: " spaced " });
  });

  it("rejects an entry with no =", () => {
    const result = parseCustomEntries(["oops"]);

    expect(result.entries).toEqual({});
    expect(result.issues[0]).toContain("key=value");
  });

  it("rejects keys that are not usable as labels", () => {
    for (const raw of ["not a key=x", "=x", "-lead=x", "with/slash=x"]) {
      expect(parseCustomEntries([raw]).issues).toHaveLength(1);
    }
  });

  it("lets the last of a repeated key win", () => {
    expect(parseCustomEntries(["a=1", "a=2"]).entries).toEqual({ a: "2" });
  });

  it("rejects a value longer than the cap", () => {
    const result = parseCustomEntries([`blob=${"x".repeat(1025)}`]);

    expect(result.entries).toEqual({});
    expect(result.issues[0]).toContain("longer than");
  });

  it("rejects more entries than the cap", () => {
    const raw = Array.from({ length: 33 }, (_, index) => `key${index}=v`);

    expect(parseCustomEntries(raw).issues[0]).toContain("at most 32");
  });

  it("collects every issue rather than stopping at the first", () => {
    expect(parseCustomEntries(["oops", "also bad=1"]).issues).toHaveLength(2);
  });
});

describe("detectCi", () => {
  it("is undefined outside CI", () => {
    expect(detectCi({})).toBeUndefined();
    expect(detectCi({ CI: "false" })).toBeUndefined();
    expect(detectCi({ CI: "0" })).toBeUndefined();
    expect(detectCi({ CI: "" })).toBeUndefined();
  });

  describe("github actions", () => {
    const env = {
      CI: "true",
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "acme/orion",
      GITHUB_WORKFLOW: "ci",
      GITHUB_JOB: "test",
      GITHUB_RUN_ID: "12345",
      GITHUB_RUN_ATTEMPT: "1",
      GITHUB_REF: "refs/heads/main",
      GITHUB_REF_NAME: "main",
      GITHUB_EVENT_NAME: "push",
      GITHUB_ACTOR: "ada",
    };

    it("reads a push run", () => {
      expect(detectCi(env)).toEqual({
        provider: "github-actions",
        repository: "acme/orion",
        workflow: "ci",
        job: "test",
        runId: "12345",
        runAttempt: "1",
        runUrl: "https://github.com/acme/orion/actions/runs/12345",
        refName: "main",
        eventName: "push",
        actor: "ada",
      });
    });

    it("has no pull request on a push", () => {
      expect(detectCi(env)).not.toHaveProperty("pullRequest");
    });

    it("takes the pull request number from the ref", () => {
      const pull = detectCi({
        ...env,
        GITHUB_REF: "refs/pull/42/merge",
        GITHUB_REF_NAME: "42/merge",
        GITHUB_EVENT_NAME: "pull_request",
      });

      expect(pull?.pullRequest).toBe(42);
      expect(pull?.pullRequestUrl).toBe("https://github.com/acme/orion/pull/42");
    });

    it("builds run URLs against an enterprise server", () => {
      const enterprise = detectCi({ ...env, GITHUB_SERVER_URL: "https://git.acme.test" });

      expect(enterprise?.runUrl).toBe("https://git.acme.test/acme/orion/actions/runs/12345");
    });

    it("points at the right attempt on a re-run", () => {
      expect(detectCi({ ...env, GITHUB_RUN_ATTEMPT: "3" })?.runUrl).toBe(
        "https://github.com/acme/orion/actions/runs/12345/attempts/3",
      );
    });

    it("omits the run URL when there is no run id to build one from", () => {
      const { GITHUB_RUN_ID: _omitted, ...rest } = env;

      expect(detectCi(rest)).not.toHaveProperty("runUrl");
    });
  });

  describe("gitlab ci", () => {
    const env = {
      CI: "true",
      GITLAB_CI: "true",
      CI_PROJECT_PATH: "acme/orion",
      CI_PROJECT_URL: "https://gitlab.test/acme/orion",
      CI_PIPELINE_NAME: "build",
      CI_JOB_NAME: "test",
      CI_PIPELINE_ID: "998",
      CI_PIPELINE_URL: "https://gitlab.test/acme/orion/-/pipelines/998",
      CI_COMMIT_REF_NAME: "main",
      CI_PIPELINE_SOURCE: "merge_request_event",
      GITLAB_USER_LOGIN: "ada",
    };

    it("reads a pipeline", () => {
      expect(detectCi(env)).toMatchObject({
        provider: "gitlab-ci",
        repository: "acme/orion",
        runId: "998",
        runUrl: "https://gitlab.test/acme/orion/-/pipelines/998",
        actor: "ada",
      });
    });

    // The IID is the number shown in the UI; CI_MERGE_REQUEST_ID is a global id
    // that means nothing to a reader.
    it("uses the merge request IID, not the global id", () => {
      const merge = detectCi({ ...env, CI_MERGE_REQUEST_IID: "7", CI_MERGE_REQUEST_ID: "90210" });

      expect(merge?.pullRequest).toBe(7);
      expect(merge?.pullRequestUrl).toBe("https://gitlab.test/acme/orion/-/merge_requests/7");
    });
  });

  describe("generic", () => {
    it("reports the provider when only CI is set", () => {
      expect(detectCi({ CI: "true" })).toEqual({ provider: "generic" });
    });

    it("reads a jenkins build", () => {
      const jenkins = detectCi({
        CI: "true",
        JOB_NAME: "orion/main",
        BUILD_NUMBER: "77",
        BUILD_URL: "https://jenkins.test/job/orion/77/",
        CHANGE_ID: "12",
      });

      expect(jenkins).toEqual({
        provider: "generic",
        job: "orion/main",
        runId: "77",
        runUrl: "https://jenkins.test/job/orion/77/",
        pullRequest: 12,
      });
    });

    it("reads circle's pull request URL", () => {
      const circle = detectCi({
        CI: "true",
        CIRCLE_BUILD_URL: "https://circleci.test/build/5",
        CIRCLE_PULL_REQUEST: "https://github.com/acme/orion/pull/42",
      });

      expect(circle?.pullRequest).toBe(42);
    });
  });

  // The allowlist is the only thing keeping a job token out of a shared file,
  // so a pattern-based copy must never creep back in.
  it("copies nothing that was not asked for", () => {
    const ci = detectCi({
      CI: "true",
      GITLAB_CI: "true",
      CI_PROJECT_PATH: "acme/orion",
      CI_JOB_TOKEN: "super-secret",
      CI_REGISTRY_PASSWORD: "also-secret",
    });

    expect(JSON.stringify(ci)).not.toContain("secret");
  });
});

describe("redactRemoteUrl", () => {
  it("strips a user and password", () => {
    expect(redactRemoteUrl("https://ada:hunter2@github.com/acme/orion.git")).toBe(
      "https://***@github.com/acme/orion.git",
    );
  });

  it("strips a token carried as the user", () => {
    expect(redactRemoteUrl("https://gitlab-ci-token:abc123@gitlab.test/acme/orion.git")).toBe(
      "https://***@gitlab.test/acme/orion.git",
    );
  });

  it("leaves a clean https remote alone", () => {
    expect(redactRemoteUrl("https://github.com/acme/orion.git")).toBe(
      "https://github.com/acme/orion.git",
    );
  });

  // `git@` is a username, not a credential, and this form has no password field.
  it("leaves scp-style remotes alone", () => {
    expect(redactRemoteUrl("git@github.com:acme/orion.git")).toBe("git@github.com:acme/orion.git");
  });

  it("handles ssh:// URLs with a user", () => {
    expect(redactRemoteUrl("ssh://git@github.com/acme/orion.git")).toBe(
      "ssh://***@github.com/acme/orion.git",
    );
  });

  it("returns something unparseable unchanged", () => {
    expect(redactRemoteUrl("../relative/mirror")).toBe("../relative/mirror");
    expect(redactRemoteUrl("")).toBe("");
  });
});

describe("collectGit", () => {
  const LOG = ["a".repeat(40), "Ada Lovelace", "2026-08-07T09:00:00.000Z", "Add the store command"].join(
    "\n",
  );

  /** A git that answers from a table, so no process is spawned. */
  function fakeGit(answers: Readonly<Record<string, string>>): GitRunner {
    return async (args) => {
      const answer = answers[args[0] ?? ""];
      if (answer === undefined) throw new Error(`git ${args.join(" ")} failed`);
      return answer;
    };
  }

  it("reads the head commit and the rest of the checkout", async () => {
    const git = await collectGit(".", fakeGit({
      log: `${LOG}\n`,
      "rev-parse": "main\n",
      tag: "v1.2.0\n",
      status: "",
      remote: "origin\thttps://github.com/acme/orion.git (fetch)\norigin\thttps://github.com/acme/orion.git (push)\n",
    }));

    expect(git).toEqual({
      commit: "a".repeat(40),
      author: "Ada Lovelace",
      committedAt: "2026-08-07T09:00:00.000Z",
      subject: "Add the store command",
      branch: "main",
      tag: "v1.2.0",
      dirty: false,
      remotes: [{ name: "origin", url: "https://github.com/acme/orion.git" }],
    });
  });

  it("is undefined when git cannot name a commit", async () => {
    expect(await collectGit(".", fakeGit({}))).toBeUndefined();
  });

  it("is undefined when git is not installed at all", async () => {
    const missing: GitRunner = async () => {
      throw Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
    };

    expect(await collectGit(".", missing)).toBeUndefined();
  });

  it("keeps the commit when the other commands fail", async () => {
    const git = await collectGit(".", fakeGit({ log: LOG }));

    expect(git?.commit).toBe("a".repeat(40));
    expect(git).not.toHaveProperty("branch");
    expect(git).not.toHaveProperty("dirty");
  });

  // A detached HEAD is the normal state of a CI checkout; the literal string
  // "HEAD" is not a branch name and must not be recorded as one.
  it("omits the branch on a detached HEAD", async () => {
    const git = await collectGit(".", fakeGit({ log: LOG, "rev-parse": "HEAD\n" }));

    expect(git).not.toHaveProperty("branch");
  });

  it("marks a tree with modified tracked files dirty", async () => {
    const git = await collectGit(".", fakeGit({ log: LOG, status: " M packages/cli/src/args.ts\n" }));

    expect(git?.dirty).toBe(true);
  });

  it("redacts credentials in remotes and keeps one entry per remote", async () => {
    const remote = [
      "origin\thttps://gitlab-ci-token:secret@gitlab.test/acme/orion.git (fetch)",
      "origin\thttps://gitlab-ci-token:secret@gitlab.test/acme/orion.git (push)",
      "mirror\tgit@github.com:acme/orion.git (fetch)",
    ].join("\n");

    expect((await collectGit(".", fakeGit({ log: LOG, remote })))?.remotes).toEqual([
      { name: "origin", url: "https://***@gitlab.test/acme/orion.git" },
      { name: "mirror", url: "git@github.com:acme/orion.git" },
    ]);
  });

  it("caps the number of remotes it records", async () => {
    const remote = Array.from(
      { length: 20 },
      (_, index) => `r${index}\thttps://example.test/${index}.git (fetch)`,
    ).join("\n");

    expect((await collectGit(".", fakeGit({ log: LOG, remote })))?.remotes).toHaveLength(10);
  });

  it("keeps a multi-line commit subject on one field", async () => {
    const git = await collectGit(".", fakeGit({ log: `${LOG}\nnot really a subject line` }));

    expect(git?.subject).toBe("Add the store command\nnot really a subject line");
  });
});

describe("collectGit against this checkout", () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));

  it("reads a real repository", async () => {
    const git = await collectGit(root, gitRunner(root));

    // Skipped implicitly when git is unavailable: the collector's whole
    // contract is that it returns undefined instead of failing the run.
    if (git === undefined) return;
    expect(git.commit).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("collectMetadata", () => {
  const noGit: GitRunner = async () => {
    throw new Error("no git here");
  };

  it("always records when it ran", async () => {
    const metadata = await collectMetadata({ cwd: ".", env: {}, run: noGit });

    expect(Number.isNaN(Date.parse(metadata.collectedAt))).toBe(false);
  });

  // "Collected and found nothing" has to be distinguishable from "never
  // collected", which is the whole reason collectedAt is unconditional.
  it("omits namespaces that found nothing", async () => {
    const metadata = await collectMetadata({ cwd: ".", env: {}, run: noGit });

    expect(metadata).not.toHaveProperty("git");
    expect(metadata).not.toHaveProperty("ci");
    expect(metadata).not.toHaveProperty("custom");
  });

  it("includes the CI namespace when the environment says so", async () => {
    const metadata = await collectMetadata({
      cwd: ".",
      env: { CI: "true", GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "acme/orion" },
      run: noGit,
    });

    expect(metadata.ci).toMatchObject({ provider: "github-actions", repository: "acme/orion" });
  });

  it("includes custom entries but not an empty set of them", async () => {
    const withCustom = await collectMetadata({ cwd: ".", env: {}, custom: { a: "1" }, run: noGit });
    const without = await collectMetadata({ cwd: ".", env: {}, custom: {}, run: noGit });

    expect(withCustom.custom).toEqual({ a: "1" });
    expect(without).not.toHaveProperty("custom");
  });

  it("never rejects, whatever the git runner does", async () => {
    const hostile: GitRunner = () => {
      throw new Error("thrown synchronously");
    };

    await expect(collectMetadata({ cwd: ".", env: {}, run: hostile })).resolves.toBeDefined();
  });
});
