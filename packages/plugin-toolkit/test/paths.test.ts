import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { isContained, posixPath, relativeTo } from "../src/index.js";

describe("posixPath", () => {
  it("rewrites the platform separator", () => {
    expect(posixPath(["a", "b", "c.json"].join(sep))).toBe("a/b/c.json");
  });

  it("leaves a path that is already posix alone", () => {
    expect(posixPath("a/b/c.json")).toBe("a/b/c.json");
  });
});

describe("relativeTo", () => {
  const root = resolve("/repo");

  it("relativises a path inside the root, with forward slashes", () => {
    expect(relativeTo(root, resolve(root, "src/a.test.ts"))).toBe("src/a.test.ts");
  });

  it("resolves a relative path against the root first", () => {
    expect(relativeTo(root, "src/a.test.ts")).toBe("src/a.test.ts");
  });

  it("keeps a path outside the root absolute rather than walking up", () => {
    const outside = resolve("/elsewhere/b.test.ts");
    expect(relativeTo(root, outside)).toBe(posixPath(outside));
  });

  it("returns the root itself as an absolute path", () => {
    expect(relativeTo(root, root)).toBe(posixPath(root));
  });
});

describe("isContained", () => {
  const root = resolve("/reports");

  it("accepts a plain name", () => {
    expect(isContained(root, "report.json")).toBe(true);
  });

  it("accepts a nested name", () => {
    expect(isContained(root, "runs/42/diff.json")).toBe(true);
  });

  it("rejects a name that escapes with ..", () => {
    expect(isContained(root, "../oops.json")).toBe(false);
  });

  it("rejects an absolute name, which resolve() would silently honour", () => {
    expect(isContained(root, resolve("/etc/passwd"))).toBe(false);
  });

  it("rejects the root itself", () => {
    expect(isContained(root, ".")).toBe(false);
  });
});
