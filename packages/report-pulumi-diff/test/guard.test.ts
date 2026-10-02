import { describe, expect, it } from "vitest";
import {
  isPulumiDiff,
  isSecretValue,
  isUnknownValue,
  isTruncatedValue,
  PULUMI_DIFF_KIND,
  PULUMI_DIFF_VERSION,
  RESOURCE_OPS,
  SECRET,
  UNKNOWN,
} from "../src/index.js";
import type { DiffTotals, PulumiDiffData, ResourceOp } from "../src/index.js";

const counts: Record<ResourceOp, number> = {
  create: 1,
  update: 1,
  replace: 1,
  delete: 0,
  remove: 0,
  import: 0,
  refresh: 0,
  read: 0,
  same: 2,
};

const totals: DiffTotals = { resources: 5, changed: 3, counts };

const data: PulumiDiffData = {
  tool: "pulumi",
  project: "infra",
  stack: "prod",
  success: true,
  durationMs: 4200,
  totals,
  resources: [
    {
      urn: "urn:pulumi:prod::infra::aws:s3/bucket:Bucket::assets",
      type: "aws:s3/bucket:Bucket",
      name: "assets",
      op: "update",
      provider: "urn:pulumi:prod::infra::pulumi:providers:aws::default",
      diffReasons: ["tags"],
      changes: [
        { path: 'tags["env"]', kind: "update", replaces: false, before: "dev", after: "prod" },
        { path: "acl", kind: "add", replaces: true, after: "private" },
        { path: "website", kind: "delete", replaces: false, before: { indexDocument: "i.html" } },
      ],
    },
    {
      urn: "urn:pulumi:prod::infra::aws:iam/role:Role::worker",
      type: "aws:iam/role:Role",
      name: "worker",
      op: "replace",
      changes: [{ path: "name", kind: "update", replaces: true, before: "a", after: "b" }],
    },
    {
      urn: "urn:pulumi:prod::infra::random:index/randomPassword:RandomPassword::db",
      type: "random:index/randomPassword:RandomPassword",
      name: "db",
      op: "create",
      changes: [{ path: "result", kind: "add", replaces: false, after: SECRET }],
    },
  ],
  diagnostics: [
    { severity: "warning", message: "provider is deprecated" },
    {
      severity: "info",
      message: "read 40 resources",
      urn: "urn:pulumi:prod::infra::aws:s3/bucket:Bucket::assets",
    },
  ],
  sources: ["preview.json"],
};

/** The data with one field replaced, as an unknown to hand to the guard. */
function withData(patch: Record<string, unknown>): unknown {
  return { ...data, ...patch };
}

/** The data with its first resource's field replaced. */
function withResource(patch: Record<string, unknown>): unknown {
  return { ...data, resources: [{ ...data.resources[0], ...patch }] };
}

/** The data with its first resource's first change replaced. */
function withChange(patch: Record<string, unknown>): unknown {
  const resource = data.resources[0]!;
  return {
    ...data,
    resources: [{ ...resource, changes: [{ ...resource.changes?.[0], ...patch }] }],
  };
}

/** The data with its first diagnostic's field replaced. */
function withDiagnostic(patch: Record<string, unknown>): unknown {
  return { ...data, diagnostics: [{ ...data.diagnostics[0], ...patch }] };
}

describe("constants", () => {
  it("names the kind and version the schema documents", () => {
    expect(PULUMI_DIFF_KIND).toBe("pulumi-diff");
    expect(PULUMI_DIFF_VERSION).toBe(1);
  });

  it("lists every op exactly once", () => {
    expect(new Set(RESOURCE_OPS).size).toBe(RESOURCE_OPS.length);
  });
});

describe("isPulumiDiff", () => {
  it("accepts well-formed data", () => {
    expect(isPulumiDiff(data)).toBe(true);
  });

  it("accepts data with every optional field absent", () => {
    expect(
      isPulumiDiff({
        tool: "pulumi",
        success: true,
        totals: { resources: 0, changed: 0, counts },
        resources: [],
        diagnostics: [],
        sources: [],
      }),
    ).toBe(true);
  });

  it("accepts unknown extra fields, which a newer producer may add", () => {
    expect(isPulumiDiff(withData({ policyViolations: [] }))).toBe(true);
  });

  it.each([null, undefined, "data", 42, []])("rejects %p", (value) => {
    expect(isPulumiDiff(value)).toBe(false);
  });

  it.each(["tool", "success", "totals", "resources", "diagnostics", "sources"])(
    "rejects data missing %s",
    (key) => {
      const partial: Record<string, unknown> = { ...data };
      delete partial[key];
      expect(isPulumiDiff(partial)).toBe(false);
    },
  );

  it("rejects a non-boolean success", () => {
    expect(isPulumiDiff(withData({ success: "true" }))).toBe(false);
  });

  it("rejects a non-string stack", () => {
    expect(isPulumiDiff(withData({ stack: 3 }))).toBe(false);
  });

  it("rejects totals missing an op count", () => {
    const partial: Record<string, unknown> = { ...counts };
    delete partial["same"];
    expect(isPulumiDiff(withData({ totals: { resources: 1, changed: 1, counts: partial } }))).toBe(
      false,
    );
  });

  it("rejects totals with a non-numeric count", () => {
    expect(
      isPulumiDiff(withData({ totals: { ...totals, counts: { ...counts, create: "1" } } })),
    ).toBe(false);
  });

  it("rejects sources that are not all strings", () => {
    expect(isPulumiDiff(withData({ sources: ["a", 2] }))).toBe(false);
  });

  it("rejects a resource with an unknown op", () => {
    expect(isPulumiDiff(withResource({ op: "create-replacement" }))).toBe(false);
  });

  it.each(["urn", "type", "name", "op"])("rejects a resource missing %s", (key) => {
    const partial: Record<string, unknown> = { ...data.resources[0] };
    delete partial[key];
    expect(isPulumiDiff({ ...data, resources: [partial] })).toBe(false);
  });

  it("accepts a resource with no changes at all", () => {
    expect(isPulumiDiff(withResource({ changes: undefined, diffReasons: undefined }))).toBe(true);
  });

  it("rejects diffReasons that are not a string list", () => {
    expect(isPulumiDiff(withResource({ diffReasons: "tags" }))).toBe(false);
  });

  it("rejects a change with an unknown kind", () => {
    expect(isPulumiDiff(withChange({ kind: "update-replace" }))).toBe(false);
  });

  it("rejects a change without replaces", () => {
    expect(isPulumiDiff(withChange({ replaces: undefined }))).toBe(false);
  });

  it("accepts a change whose values are nested JSON", () => {
    expect(isPulumiDiff(withChange({ after: { rules: [{ port: 80, open: true }] } }))).toBe(true);
  });

  it("rejects a change whose value is not JSON", () => {
    expect(isPulumiDiff(withChange({ after: { when: () => 1 } }))).toBe(false);
    expect(isPulumiDiff(withChange({ before: [1, undefined] }))).toBe(false);
  });

  it("rejects a diagnostic with an unknown severity", () => {
    expect(isPulumiDiff(withDiagnostic({ severity: "debug" }))).toBe(false);
  });

  it("rejects a diagnostic without a message", () => {
    expect(isPulumiDiff(withDiagnostic({ message: undefined }))).toBe(false);
  });
});

describe("isSecretValue", () => {
  it("recognises the sentinel", () => {
    expect(isSecretValue(SECRET)).toBe(true);
  });

  it("survives a round trip through JSON, which is how a viewer sees it", () => {
    expect(isSecretValue(JSON.parse(JSON.stringify(SECRET)))).toBe(true);
  });

  it.each([null, undefined, "secret", 0, {}, { orionSecret: false }])("rejects %p", (value) => {
    expect(isSecretValue(value)).toBe(false);
  });
});

describe("isUnknownValue", () => {
  it("recognises the sentinel", () => {
    expect(isUnknownValue(UNKNOWN)).toBe(true);
  });

  it("survives a round trip through JSON, which is how a viewer sees it", () => {
    expect(isUnknownValue(JSON.parse(JSON.stringify(UNKNOWN)))).toBe(true);
  });

  it.each([null, undefined, "unknown", 0, {}, { orionUnknown: false }, SECRET])("rejects %p", (value) => {
    expect(isUnknownValue(value)).toBe(false);
  });
});

describe("isTruncatedValue", () => {
  it("recognises the sentinel", () => {
    expect(isTruncatedValue({ orionTruncated: true, text: "abc", omitted: 40 })).toBe(true);
  });

  it.each([
    null,
    "abc",
    { orionTruncated: true, text: "abc" },
    { orionTruncated: true, omitted: 1 },
    { text: "abc", omitted: 1 },
  ])("rejects %p", (value) => {
    expect(isTruncatedValue(value)).toBe(false);
  });
});
