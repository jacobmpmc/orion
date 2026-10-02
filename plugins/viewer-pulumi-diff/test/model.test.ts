import { describe, expect, it } from "vitest";
import { PULUMI_DIFF_VERSION, SECRET, UNKNOWN } from "@orion/report-pulumi-diff";
import type { PropertyChange, PulumiDiffData, ResourceChange, ResourceOp } from "@orion/report-pulumi-diff";
import {
  expansionFor,
  formatDuration,
  formatValue,
  labelFor,
  matches,
  omittedUnchanged,
  readReport,
  signFor,
  subtitle,
  summarize,
  toneFor,
  toneForChange,
} from "../browser/model.js";

const counts: Record<ResourceOp, number> = {
  create: 1,
  update: 2,
  replace: 1,
  delete: 0,
  remove: 0,
  import: 0,
  refresh: 0,
  read: 0,
  same: 40,
};

const bucket: ResourceChange = {
  urn: "urn:pulumi:prod::infra::aws:s3/bucket:Bucket::assets",
  type: "aws:s3/bucket:Bucket",
  name: "assets",
  op: "update",
  changes: [{ path: 'tags["env"]', kind: "update", replaces: false, before: "dev", after: "prod" }],
};

const data: PulumiDiffData = {
  tool: "pulumi",
  project: "infra",
  stack: "prod",
  success: true,
  durationMs: 12000,
  totals: { resources: 44, changed: 4, counts },
  resources: [bucket],
  diagnostics: [],
  sources: ["preview.json"],
};

function change(patch: Partial<PropertyChange>): PropertyChange {
  return { path: "acl", kind: "update", replaces: false, ...patch };
}

describe("readReport", () => {
  it("narrows a well-formed report", () => {
    const loaded = readReport({ version: PULUMI_DIFF_VERSION, data });
    expect(loaded?.data.stack).toBe("prod");
    expect(loaded?.newerVersion).toBe(false);
  });

  it("says when a report came from a newer reporter", () => {
    expect(readReport({ version: PULUMI_DIFF_VERSION + 1, data })?.newerVersion).toBe(true);
  });

  it("returns undefined rather than throwing on foreign data", () => {
    expect(readReport({ version: 1, data: { tool: "terraform" } })).toBeUndefined();
  });
});

describe("toneFor", () => {
  it.each([
    ["create", "ok"],
    ["update", "warn"],
    ["delete", "danger"],
    ["replace", "danger"],
    ["same", "muted"],
  ] as const)("gives %s the %s tone", (op, tone) => {
    expect(toneFor(op)).toBe(tone);
  });

  it("calls an unchanged resource what a reader would call it", () => {
    expect(labelFor("same")).toBe("unchanged");
  });
});

describe("toneForChange", () => {
  it("marks a replacement-causing property as the most serious thing on the row", () => {
    expect(toneForChange(change({ kind: "add", replaces: true }))).toBe("danger");
  });

  it.each([
    ["add", "ok"],
    ["update", "warn"],
    ["delete", "danger"],
  ] as const)("gives an ordinary %s the %s tone", (kind, tone) => {
    expect(toneForChange(change({ kind }))).toBe(tone);
  });

  it.each([
    ["add", "+"],
    ["update", "~"],
    ["delete", "−"],
  ] as const)("signs an %s with %s", (kind, sign) => {
    expect(signFor(change({ kind }))).toBe(sign);
  });
});

describe("summarize", () => {
  it("always shows create, update and delete, even at zero", () => {
    const labels = summarize(data).map((chip) => chip.label);
    expect(labels.slice(0, 3)).toEqual(["create", "update", "delete"]);
  });

  it("shows a rarer op only when something did it", () => {
    const labels = summarize(data).map((chip) => chip.label);
    expect(labels).toContain("replace");
    expect(labels).not.toContain("refresh");
  });
});

describe("matches", () => {
  it("matches on name", () => {
    expect(matches(bucket, "asse", false)).toBe(true);
  });

  it("matches on type, so a provider prefix narrows to that provider", () => {
    expect(matches(bucket, "aws:s3", false)).toBe(true);
  });

  it("matches on a changed property path", () => {
    expect(matches(bucket, "tags", false)).toBe(true);
  });

  it("keeps everything for a blank query", () => {
    expect(matches(bucket, "   ", false)).toBe(true);
  });

  it("drops what does not match", () => {
    expect(matches(bucket, "lambda", false)).toBe(false);
  });

  it("drops unchanged resources when asked", () => {
    const same: ResourceChange = { ...bucket, op: "same" };
    expect(matches(same, "", true)).toBe(false);
    expect(matches(same, "", false)).toBe(true);
  });
});

describe("expansionFor", () => {
  it("offers to expand while anything is still closed", () => {
    expect(expansionFor([true, false, true])).toEqual({ expand: true, label: "Expand all" });
  });

  it("offers to collapse once everything is open", () => {
    expect(expansionFor([true, true])).toEqual({ expand: false, label: "Collapse all" });
  });

  it("offers to expand when nothing is open", () => {
    expect(expansionFor([false, false])).toEqual({ expand: true, label: "Expand all" });
  });

  // Reachable while the filter matches nothing; the button is not shown for a
  // report with no resources at all.
  it("does not offer to expand an empty list", () => {
    expect(expansionFor([])).toEqual({ expand: false, label: "Collapse all" });
  });
});

describe("formatValue", () => {
  it("renders an absent value as a dash, not as nothing", () => {
    expect(formatValue(undefined)).toBe("—");
  });

  it("says a value is secret rather than showing its wrapper", () => {
    expect(formatValue(SECRET)).toBe("(secret)");
  });

  it("says when a value the preview could not compute will be known", () => {
    expect(formatValue(UNKNOWN)).toBe("(known after apply)");
    expect(formatValue({ arn: UNKNOWN })).toContain("(known after apply)");
  });

  it("admits what a truncated value dropped", () => {
    expect(formatValue({ orionTruncated: true, text: "abc", omitted: 40 })).toBe(
      "abc… (+40 more characters)",
    );
  });

  it("renders a secret nested inside a value", () => {
    expect(formatValue({ password: SECRET })).toContain("(secret)");
  });

  it.each([
    [null, "null"],
    [true, "true"],
    [7, "7"],
    ["private", "private"],
  ] as const)("renders %p", (value, expected) => {
    expect(formatValue(value)).toBe(expected);
  });

  it("renders a nested value as JSON", () => {
    expect(formatValue({ rules: [80, 443] })).toBe('{"rules":[80,443]}');
  });
});

describe("formatDuration", () => {
  it("renders an absent duration as a dash, not as zero", () => {
    expect(formatDuration(undefined)).toBe("—");
  });

  it.each([
    [850, "850 ms"],
    [12000, "12.00 s"],
  ] as const)("renders %p as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("subtitle", () => {
  it("names what was previewed", () => {
    expect(subtitle(data)).toBe("pulumi · project infra · stack prod · 12.00 s");
  });

  it("says when the preview itself failed", () => {
    expect(subtitle({ ...data, success: false })).toContain("preview reported an error");
  });

  it("leaves out what the report did not carry", () => {
    expect(subtitle({ ...data, project: undefined, stack: undefined, durationMs: undefined })).toBe(
      "pulumi",
    );
  });
});

describe("omittedUnchanged", () => {
  it("counts the unchanged resources the summary claims but the list lacks", () => {
    expect(omittedUnchanged(data)).toBe(40);
  });

  it("has nothing to explain when they are all listed", () => {
    const same: ResourceChange = { ...bucket, op: "same" };
    expect(
      omittedUnchanged({
        ...data,
        totals: { ...data.totals, counts: { ...counts, same: 1 } },
        resources: [same],
      }),
    ).toBe(0);
  });
});
