import { describe, expect, it } from "vitest";
import { isSecretValue, isTruncatedValue, SECRET } from "@orion/report-pulumi-diff";
import type { PropertyChange, ResourceChange } from "@orion/report-pulumi-diff";
import {
  foldKind,
  foldOp,
  foldSteps,
  mapDigest,
  parseUrn,
  pathSegments,
  providerUrn,
  sanitize,
  totalsFor,
  valueAt,
} from "../src/index.js";
import type { MapOptions, PreviewDigest } from "../src/index.js";

const options: MapOptions = {
  root: "/repo",
  values: true,
  maxValueLength: 2000,
  same: false,
};

/** A secret exactly as pulumi serialises one. */
const secret = {
  "4dabf18193072939515e22adb298388d": "1b47061264138c4ac30d75fd1eb44270",
  plaintext: '"hunter2"',
};

function changeAt(resource: ResourceChange | undefined, path: string): PropertyChange | undefined {
  return resource?.changes?.find((change) => change.path === path);
}

describe("parseUrn", () => {
  it("splits a URN into its parts", () => {
    expect(parseUrn("urn:pulumi:prod::infra::aws:s3/bucket:Bucket::assets")).toEqual({
      stack: "prod",
      project: "infra",
      type: "aws:s3/bucket:Bucket",
      name: "assets",
    });
  });

  it("takes only the last link of a type chain", () => {
    expect(parseUrn("urn:pulumi:dev::app::aws:ec2/vpc:Vpc$aws:ec2/subnet:Subnet::legacy").type).toBe(
      "aws:ec2/subnet:Subnet",
    );
  });

  it("keeps a name containing a separator whole", () => {
    expect(parseUrn("urn:pulumi:dev::app::custom:index:Thing::a::b").name).toBe("a::b");
  });

  it("hands back a malformed URN as the name rather than failing", () => {
    expect(parseUrn("not-a-urn")).toEqual({ stack: "", project: "", type: "", name: "not-a-urn" });
  });
});

describe("providerUrn", () => {
  it("trims the provider id, which changes every run", () => {
    expect(providerUrn("urn:pulumi:prod::infra::pulumi:providers:aws::default::abc-123")).toBe(
      "urn:pulumi:prod::infra::pulumi:providers:aws::default",
    );
  });

  it("has nothing to say about an absent reference", () => {
    expect(providerUrn(undefined)).toBeUndefined();
    expect(providerUrn("")).toBeUndefined();
  });
});

describe("foldOp", () => {
  it.each([
    ["create", "create"],
    ["update", "update"],
    ["delete", "delete"],
    ["same", "same"],
    ["refresh", "refresh"],
    ["create-replacement", "replace"],
    ["replace", "replace"],
    ["delete-replaced", "replace"],
    ["read-replacement", "read"],
    ["import-replacement", "import"],
    ["discard-replaced", "remove"],
    ["remove-pending-replace", "remove"],
  ] as const)("folds %s to %s", (op, expected) => {
    expect(foldOp(op)).toBe(expected);
  });

  it("keeps an unfamiliar op visible as a change rather than throwing", () => {
    expect(foldOp("teleport")).toBe("update");
  });
});

describe("foldKind", () => {
  it.each([
    ["ADD", "add", false],
    ["UPDATE", "update", false],
    ["DELETE", "delete", false],
    ["ADD_REPLACE", "add", true],
    ["UPDATE_REPLACE", "update", true],
    ["DELETE_REPLACE", "delete", true],
    ["update-replace", "update", true],
  ] as const)("folds %s", (kind, expected, replaces) => {
    expect(foldKind(kind)).toEqual({ kind: expected, replaces });
  });

  it("reads an absent kind as update, which is the enum value pulumi omits", () => {
    expect(foldKind(undefined)).toEqual({ kind: "update", replaces: false });
  });
});

describe("pathSegments", () => {
  it.each([
    ["acl", ["acl"]],
    ["tags.env", ["tags", "env"]],
    ['tags["env"]', ["tags", "env"]],
    ["ingress[0].fromPort", ["ingress", "0", "fromPort"]],
    ['a["b.c"].d', ["a", "b.c", "d"]],
  ] as const)("splits %s", (path, expected) => {
    expect(pathSegments(path)).toEqual(expected);
  });

  it("keeps the tail of an unbalanced path rather than dropping it", () => {
    expect(pathSegments("tags[env")).toEqual(["tags", "env"]);
  });
});

describe("valueAt", () => {
  const state = {
    inputs: { tags: { env: "prod" }, ingress: [{ fromPort: 80 }, { fromPort: 443 }] },
    outputs: { arn: "arn:aws:s3:::assets", tags: { env: "stale" } },
  };

  it("reads a nested input", () => {
    expect(valueAt(state, 'tags["env"]')).toBe("prod");
  });

  it("reads through an array index", () => {
    expect(valueAt(state, "ingress[1].fromPort")).toBe(443);
  });

  it("falls back to outputs for a property the provider computed", () => {
    expect(valueAt(state, "arn")).toBe("arn:aws:s3:::assets");
  });

  it("prefers inputs, which are what the reviewer wrote", () => {
    expect(valueAt(state, "tags.env")).toBe("prod");
  });

  it("has nothing to say about an absent path", () => {
    expect(valueAt(state, "website.indexDocument")).toBeUndefined();
  });

  it("has nothing to say about an absent state", () => {
    expect(valueAt(undefined, "acl")).toBeUndefined();
  });

  it("stops at a secret rather than reaching its plaintext", () => {
    expect(valueAt({ inputs: { password: secret } }, "password.plaintext")).toBeUndefined();
  });
});

describe("sanitize", () => {
  it("passes JSON through", () => {
    expect(sanitize({ a: [1, "two", true, null] }, options)).toEqual({ a: [1, "two", true, null] });
  });

  it("redacts a secret", () => {
    expect(sanitize(secret, options)).toEqual(SECRET);
  });

  it("redacts a secret nested inside a value", () => {
    const clean = sanitize({ config: { password: secret } }, options) as {
      config: { password: unknown };
    };
    expect(isSecretValue(clean.config.password)).toBe(true);
  });

  it("redacts a secret output value", () => {
    const output = {
      "4dabf18193072939515e22adb298388d": "d0e6a833031e9bbcd3f4e8bde6ca49a4",
      value: "hunter2",
      secret: true,
    };
    expect(sanitize(output, options)).toEqual(SECRET);
  });

  it("leaves a plain output value alone", () => {
    const output = {
      "4dabf18193072939515e22adb298388d": "d0e6a833031e9bbcd3f4e8bde6ca49a4",
      value: "public",
    };
    expect(isSecretValue(sanitize(output, options))).toBe(false);
  });

  it("truncates an over-long string and says how much it dropped", () => {
    const clean = sanitize("abcdefghij", { ...options, maxValueLength: 4 });
    expect(clean).toEqual({ orionTruncated: true, text: "abcd", omitted: 6 });
    expect(isTruncatedValue(clean)).toBe(true);
  });

  it("leaves a string at the limit whole", () => {
    expect(sanitize("abcd", { ...options, maxValueLength: 4 })).toBe("abcd");
  });

  it("drops what JSON cannot hold", () => {
    expect(sanitize({ when: new Date(), how: () => 1, why: undefined }, options)).toEqual({
      when: {},
    });
  });

  it("keeps a dropped array entry in place, so indices still point at it", () => {
    expect(sanitize([1, () => 1, 3], options)).toEqual([1, null, 3]);
  });

  it("stops rather than following a cycle", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(() => sanitize(cyclic, options)).not.toThrow();
  });
});

describe("foldSteps", () => {
  const digest: PreviewDigest = {
    steps: [
      {
        op: "create-replacement",
        urn: "urn:pulumi:prod::infra::aws:ec2/instance:Instance::worker",
        provider: "urn:pulumi:prod::infra::pulumi:providers:aws::default::abc-123",
      },
      {
        op: "replace",
        urn: "urn:pulumi:prod::infra::aws:ec2/instance:Instance::worker",
        diffReasons: ["ami"],
        oldState: { inputs: { ami: "ami-old" } },
        newState: { inputs: { ami: "ami-new" } },
        detailedDiff: { ami: { kind: "UPDATE_REPLACE" } },
      },
      {
        op: "delete-replaced",
        urn: "urn:pulumi:prod::infra::aws:ec2/instance:Instance::worker",
      },
    ],
  };

  it("folds a replacement chain into one resource", () => {
    const resources = foldSteps(digest, options);
    expect(resources).toHaveLength(1);
    expect(resources[0]?.op).toBe("replace");
  });

  it("keeps the detailed diff from whichever step carried it", () => {
    const change = changeAt(foldSteps(digest, options)[0], "ami");
    expect(change).toEqual({ path: "ami", kind: "update", replaces: true, before: "ami-old", after: "ami-new" });
  });

  it("keeps the provider from whichever step carried it", () => {
    expect(foldSteps(digest, options)[0]?.provider).toBe(
      "urn:pulumi:prod::infra::pulumi:providers:aws::default",
    );
  });

  it("does not let a refresh outrank a real change", () => {
    const resources = foldSteps(
      {
        steps: [
          { op: "refresh", urn: "urn:pulumi:prod::infra::aws:s3/bucket:Bucket::assets" },
          { op: "update", urn: "urn:pulumi:prod::infra::aws:s3/bucket:Bucket::assets" },
        ],
      },
      options,
    );
    expect(resources[0]?.op).toBe("update");
  });

  it("tells no detailed diff apart from an empty one", () => {
    const [none, empty] = foldSteps(
      {
        steps: [
          { op: "create", urn: "urn:pulumi:prod::infra::a:b:C::one" },
          { op: "update", urn: "urn:pulumi:prod::infra::a:b:C::two", detailedDiff: {} },
        ],
      },
      options,
    );
    expect(none?.changes).toBeUndefined();
    expect(empty?.changes).toEqual([]);
  });

  it("omits an add's before and a delete's after", () => {
    const resource = foldSteps(
      {
        steps: [
          {
            op: "update",
            urn: "urn:pulumi:prod::infra::a:b:C::one",
            oldState: { inputs: { gone: "was here" } },
            newState: { inputs: { fresh: "arrived" } },
            detailedDiff: { fresh: { kind: "ADD" }, gone: { kind: "DELETE" } },
          },
        ],
      },
      options,
    )[0];

    expect(changeAt(resource, "fresh")).toEqual({
      path: "fresh",
      kind: "add",
      replaces: false,
      after: "arrived",
    });
    expect(changeAt(resource, "gone")).toEqual({
      path: "gone",
      kind: "delete",
      replaces: false,
      before: "was here",
    });
  });

  it("carries paths without values when asked not to", () => {
    const resource = foldSteps(digest, { ...options, values: false })[0];
    expect(changeAt(resource, "ami")).toEqual({ path: "ami", kind: "update", replaces: true });
  });
});

describe("totalsFor", () => {
  it("counts every op, including the ones nothing did", () => {
    const totals = totalsFor([
      { urn: "a", type: "t", name: "a", op: "create" },
      { urn: "b", type: "t", name: "b", op: "same" },
      { urn: "c", type: "t", name: "c", op: "same" },
      { urn: "d", type: "t", name: "d", op: "replace" },
    ]);

    expect(totals).toEqual({
      resources: 4,
      changed: 2,
      counts: {
        create: 1,
        update: 0,
        replace: 1,
        delete: 0,
        remove: 0,
        import: 0,
        refresh: 0,
        read: 0,
        same: 2,
      },
    });
  });
});

describe("mapDigest", () => {
  const digest: PreviewDigest = {
    steps: [
      { op: "same", urn: "urn:pulumi:prod::infra::pulumi:pulumi:Stack::infra-prod" },
      { op: "create", urn: "urn:pulumi:prod::infra::aws:s3/bucket:Bucket::assets" },
    ],
    diagnostics: [
      { message: "  provider is deprecated  ", severity: "warning" },
      { message: "", severity: "info" },
    ],
    duration: 12,
  };

  const run = { source: "/repo/reports/preview.json", digest };

  it("names the stack and project from the URNs", () => {
    const data = mapDigest(run, options);
    expect(data.stack).toBe("prod");
    expect(data.project).toBe("infra");
  });

  it("lets an explicit stack win, since a digest can be replayed elsewhere", () => {
    expect(mapDigest(run, { ...options, stack: "staging" }).stack).toBe("staging");
  });

  it("reports the duration in milliseconds", () => {
    expect(mapDigest(run, options).durationMs).toBe(12000);
  });

  it("counts unchanged resources it does not list", () => {
    const data = mapDigest(run, options);
    expect(data.resources).toHaveLength(1);
    expect(data.totals.resources).toBe(2);
    expect(data.totals.counts.same).toBe(1);
  });

  it("lists unchanged resources when asked", () => {
    expect(mapDigest(run, { ...options, same: true }).resources).toHaveLength(2);
  });

  it("drops a blank diagnostic and trims the rest", () => {
    expect(mapDigest(run, options).diagnostics).toEqual([
      { severity: "warning", message: "provider is deprecated" },
    ]);
  });

  it("fails only on an error diagnostic", () => {
    expect(mapDigest(run, options).success).toBe(true);
    expect(
      mapDigest({ ...run, digest: { ...digest, diagnostics: [{ message: "boom", severity: "error" }] } }, options)
        .success,
    ).toBe(false);
  });

  it("reports the source relative to the root", () => {
    expect(mapDigest(run, options).sources).toEqual(["reports/preview.json"]);
  });
});
