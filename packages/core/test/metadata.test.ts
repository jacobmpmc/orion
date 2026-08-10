import { describe, expect, it } from "vitest";
import {
  ciMetadata,
  customMetadata,
  gitMetadata,
  isReport,
  metadataCollectedAt,
  metadataNamespace,
  metadataOf,
  withMetadata,
} from "../src/index.js";
import type { Report } from "../src/index.js";

const base: Report = {
  kind: "test-results",
  version: 1,
  generatedAt: "2026-08-07T09:30:00.000Z",
  data: { total: 3 },
};

/** A report carrying whatever metadata a test wants, however malformed. */
function reportWith(metadata: unknown): unknown {
  return { ...base, metadata };
}

describe("metadataOf", () => {
  it("returns the block when there is one", () => {
    expect(metadataOf(reportWith({ collectedAt: "now" }))).toEqual({ collectedAt: "now" });
  });

  it("returns undefined for a report with no metadata", () => {
    expect(metadataOf(base)).toBeUndefined();
  });

  it("returns undefined for values that are not reports", () => {
    expect(metadataOf(undefined)).toBeUndefined();
    expect(metadataOf(null)).toBeUndefined();
    expect(metadataOf("report")).toBeUndefined();
  });

  it("rejects a metadata value that is not an object", () => {
    expect(metadataOf(reportWith(5))).toBeUndefined();
    expect(metadataOf(reportWith(null))).toBeUndefined();
  });

  // An array passes a plain typeof check, and would then read as an object with
  // no keys -- reporting "collected, nothing found" for outright garbage.
  it("rejects arrays", () => {
    expect(metadataOf(reportWith([]))).toBeUndefined();
    expect(metadataOf(reportWith([{ collectedAt: "now" }]))).toBeUndefined();
    expect(metadataOf([])).toBeUndefined();
  });
});

describe("metadataCollectedAt", () => {
  it("reads the timestamp", () => {
    expect(metadataCollectedAt(reportWith({ collectedAt: "2026-08-07T09:30:00.000Z" }))).toBe(
      "2026-08-07T09:30:00.000Z",
    );
  });

  it("is undefined when metadata was never collected", () => {
    expect(metadataCollectedAt(base)).toBeUndefined();
  });

  it("is undefined for a blank or mistyped timestamp", () => {
    expect(metadataCollectedAt(reportWith({ collectedAt: "   " }))).toBeUndefined();
    expect(metadataCollectedAt(reportWith({ collectedAt: 1_754_558_000 }))).toBeUndefined();
  });
});

describe("gitMetadata", () => {
  const git = {
    commit: "a".repeat(40),
    branch: "main",
    tag: "v1.2.0",
    subject: "Add the store command",
    author: "Ada",
    committedAt: "2026-08-07T09:00:00.000Z",
    dirty: false,
    remotes: [{ name: "origin", url: "https://github.com/acme/orion.git" }],
  };

  it("reads every field", () => {
    expect(gitMetadata(reportWith({ collectedAt: "now", git }))).toEqual(git);
  });

  it("is undefined when the namespace is missing or not an object", () => {
    expect(gitMetadata(reportWith({ collectedAt: "now" }))).toBeUndefined();
    expect(gitMetadata(reportWith({ collectedAt: "now", git: "main" }))).toBeUndefined();
    expect(gitMetadata(base)).toBeUndefined();
  });

  it("drops fields of the wrong type rather than failing", () => {
    const read = gitMetadata(
      reportWith({ collectedAt: "now", git: { ...git, branch: 7, dirty: "yes", tag: "" } }),
    );

    expect(read?.commit).toBe(git.commit);
    expect(read).not.toHaveProperty("branch");
    expect(read).not.toHaveProperty("dirty");
    expect(read).not.toHaveProperty("tag");
  });

  it("keeps the good remotes beside a bad one", () => {
    const remotes = [
      { name: "origin", url: "https://github.com/acme/orion.git" },
      { name: "broken" },
      "upstream",
      { name: "mirror", url: "git@example.com:acme/orion.git" },
    ];

    expect(gitMetadata(reportWith({ collectedAt: "now", git: { remotes } }))?.remotes).toEqual([
      { name: "origin", url: "https://github.com/acme/orion.git" },
      { name: "mirror", url: "git@example.com:acme/orion.git" },
    ]);
  });

  it("omits remotes that are not a list, or a list with nothing usable", () => {
    expect(gitMetadata(reportWith({ collectedAt: "now", git: { remotes: {} } }))).toEqual({});
    expect(gitMetadata(reportWith({ collectedAt: "now", git: { remotes: [1, 2] } }))).toEqual({});
  });

  it("keeps dirty when it is explicitly false", () => {
    expect(gitMetadata(reportWith({ collectedAt: "now", git: { dirty: false } }))).toEqual({
      dirty: false,
    });
  });
});

describe("ciMetadata", () => {
  it("reads every field", () => {
    const ci = {
      provider: "github-actions",
      repository: "acme/orion",
      workflow: "ci",
      job: "test",
      runId: "12345",
      runAttempt: "2",
      runUrl: "https://github.com/acme/orion/actions/runs/12345",
      pullRequest: 42,
      pullRequestUrl: "https://github.com/acme/orion/pull/42",
      refName: "42/merge",
      eventName: "pull_request",
      actor: "ada",
    };

    expect(ciMetadata(reportWith({ collectedAt: "now", ci }))).toEqual(ci);
  });

  it("accepts a pull request number written as a string", () => {
    expect(ciMetadata(reportWith({ collectedAt: "now", ci: { pullRequest: "42" } }))).toEqual({
      pullRequest: 42,
    });
  });

  it("rejects pull request numbers that are not positive integers", () => {
    for (const pullRequest of ["abc", "", 0, -1, 1.5, Number.NaN, true]) {
      expect(ciMetadata(reportWith({ collectedAt: "now", ci: { pullRequest } }))).toEqual({});
    }
  });

  it("is undefined when the namespace is missing", () => {
    expect(ciMetadata(reportWith({ collectedAt: "now" }))).toBeUndefined();
  });
});

describe("customMetadata", () => {
  it("returns entries sorted by key", () => {
    const custom = { zone: "eu", app: "web", "deploy-env": "staging" };

    expect(customMetadata(reportWith({ collectedAt: "now", custom }))).toEqual([
      { key: "app", value: "web" },
      { key: "deploy-env", value: "staging" },
      { key: "zone", value: "eu" },
    ]);
  });

  it("drops values that are not strings", () => {
    const custom = { ok: "yes", count: 3, nested: { a: 1 } };

    expect(customMetadata(reportWith({ collectedAt: "now", custom }))).toEqual([
      { key: "ok", value: "yes" },
    ]);
  });

  it("returns an empty list rather than undefined", () => {
    expect(customMetadata(base)).toEqual([]);
    expect(customMetadata(reportWith({ collectedAt: "now" }))).toEqual([]);
    expect(customMetadata(reportWith({ collectedAt: "now", custom: "a=b" }))).toEqual([]);
  });

  // JSON.parse puts __proto__ on the object as an ordinary own key, so it comes
  // back as an entry like any other -- what matters is that reading it neither
  // throws nor picks up anything from the prototype chain.
  it("survives a __proto__ key", () => {
    const custom = JSON.parse('{"__proto__": "surprise", "app": "web"}') as unknown;
    const entries = customMetadata(reportWith({ collectedAt: "now", custom }));

    expect(entries).toContainEqual({ key: "app", value: "web" });
    expect(entries.every((entry) => typeof entry.value === "string")).toBe(true);
  });
});

describe("metadataNamespace", () => {
  it("returns a namespace this version does not model", () => {
    const metadata = { collectedAt: "now", pulumi: { stack: "prod" } };

    expect(metadataNamespace(reportWith(metadata), "pulumi")).toEqual({ stack: "prod" });
  });

  it("is undefined for an absent namespace or a non-object one", () => {
    expect(metadataNamespace(reportWith({ collectedAt: "now" }), "pulumi")).toBeUndefined();
    expect(metadataNamespace(reportWith({ collectedAt: "now", pulumi: 1 }), "pulumi")).toBeUndefined();
  });
});

describe("withMetadata", () => {
  const collected = { collectedAt: "2026-08-07T09:31:00.000Z", git: { branch: "main" } };

  it("returns a report carrying the metadata", () => {
    const result = withMetadata(base, collected);

    expect(result.metadata).toEqual(collected);
    expect(isReport(result)).toBe(true);
    expect(result.kind).toBe(base.kind);
    expect(result.data).toBe(base.data);
  });

  it("does not touch the report it was given", () => {
    const frozen = Object.freeze({ ...base });

    expect(() => withMetadata(frozen, collected)).not.toThrow();
    expect(frozen).not.toHaveProperty("metadata");
  });

  it("keeps envelope keys it does not know about", () => {
    const extra = { ...base, sourceUrl: "https://example.com/run/1" } as Report;

    expect(withMetadata(extra, collected)).toHaveProperty(
      "sourceUrl",
      "https://example.com/run/1",
    );
  });

  it("overrides the namespaces it collected and keeps the rest", () => {
    const existing = {
      ...base,
      metadata: { collectedAt: "earlier", custom: { a: "old" }, pulumi: { stack: "prod" } },
    };

    expect(withMetadata(existing, { collectedAt: "now", custom: { b: "new" } }).metadata).toEqual({
      collectedAt: "now",
      custom: { b: "new" },
      pulumi: { stack: "prod" },
    });
  });
});
