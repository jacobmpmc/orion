import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { isTestResults } from "@orion/report-test-results";
import type { TestCase, TestFile, TestResultsData } from "@orion/report-test-results";
import { mergeRuns, type Run } from "../src/index.js";
import { isVitestResults, type VitestResults } from "../src/index.js";

// "/repo" resolves to a real absolute path on either platform (C:\repo on
// Windows), which is what lets one fixture assert relativisation everywhere.
const ROOT = resolve("/repo");

async function fixture(name: string): Promise<VitestResults> {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isVitestResults(parsed)) throw new Error(`${name} is not vitest results`);
  return parsed;
}

function run(results: VitestResults, source = resolve(ROOT, "results.json")): Run {
  return { source, results };
}

function fileAt(data: TestResultsData, path: string): TestFile {
  const found = data.files.find((file) => file.path === path);
  if (found === undefined) throw new Error(`no file ${path} in ${data.files.map((f) => f.path).join(", ")}`);
  return found;
}

function caseNamed(file: TestFile, name: string): TestCase {
  const found = file.cases.find((one) => one.name === name);
  if (found === undefined) throw new Error(`no case '${name}'`);
  return found;
}

let mixed: VitestResults;

beforeAll(async () => {
  mixed = await fixture("mixed.json");
});

describe("mergeRuns", () => {
  it("produces data the shared guard accepts", () => {
    expect(isTestResults(mergeRuns([run(mixed)], { root: ROOT, absolutePaths: false }))).toBe(true);
  });

  it("relativises paths against the root, with forward slashes", () => {
    const data = mergeRuns([run(mixed)], { root: ROOT, absolutePaths: false });

    expect(data.files.map((file) => file.path)).toContain("src/math.test.ts");
  });

  it("leaves a path outside the root absolute", () => {
    const data = mergeRuns([run(mixed)], { root: ROOT, absolutePaths: false });

    expect(data.files.map((file) => file.path)).toContain(
      resolve("/elsewhere/broken.test.ts").split("\\").join("/"),
    );
  });

  it("keeps paths as they came when absolute-paths is set", () => {
    const data = mergeRuns([run(mixed)], { root: ROOT, absolutePaths: true });

    expect(data.files.map((file) => file.path)).toContain("/repo/src/math.test.ts");
  });

  describe("status folding", () => {
    let file: TestFile;

    beforeAll(() => {
      file = fileAt(mergeRuns([run(mixed)], { root: ROOT, absolutePaths: false }), "src/math.test.ts");
    });

    it("keeps passed, failed and todo", () => {
      expect(caseNamed(file, "adds").status).toBe("passed");
      expect(caseNamed(file, "divides").status).toBe("failed");
      expect(caseNamed(file, "later").status).toBe("todo");
    });

    it("folds pending and disabled into skipped", () => {
      expect(caseNamed(file, "not yet").status).toBe("skipped");
      expect(caseNamed(file, "switched off").status).toBe("skipped");
    });

    it("folds an unrecognised future status into skipped rather than failing", () => {
      expect(caseNamed(file, "from the future").status).toBe("skipped");
    });
  });

  describe("cases", () => {
    let file: TestFile;

    beforeAll(() => {
      file = fileAt(mergeRuns([run(mixed)], { root: ROOT, absolutePaths: false }), "src/math.test.ts");
    });

    it("carries the suite path and full name", () => {
      const divides = caseNamed(file, "divides");
      expect(divides.suite).toEqual(["math", "division"]);
      expect(divides.fullName).toBe("math division divides");
    });

    it("omits durationMs entirely when the test never ran", () => {
      expect(caseNamed(file, "later")).not.toHaveProperty("durationMs");
      expect(caseNamed(file, "adds").durationMs).toBe(4.5);
    });

    it("carries failure messages and location for a failure", () => {
      const divides = caseNamed(file, "divides");
      expect(divides.failures?.[0]).toMatch(/expected 2 to be 3/);
      expect(divides.location).toEqual({ line: 14, column: 20 });
    });

    it("omits failures for anything that did not fail", () => {
      expect(caseNamed(file, "adds")).not.toHaveProperty("failures");
    });
  });

  describe("files", () => {
    let data: TestResultsData;

    beforeAll(() => {
      data = mergeRuns([run(mixed)], { root: ROOT, absolutePaths: false });
    });

    it("derives a duration from the file's own start and end", () => {
      expect(fileAt(data, "src/strings.test.ts").durationMs).toBe(300);
    });

    it("carries a collection error as the file message", () => {
      const broken = data.files.find((file) => file.cases.length === 0);
      expect(broken?.status).toBe("failed");
      expect(broken?.message).toMatch(/Cannot find module/);
    });

    it("omits the message for a file that had none", () => {
      expect(fileAt(data, "src/strings.test.ts")).not.toHaveProperty("message");
    });
  });

  describe("totals", () => {
    it("recomputes from the cases rather than trusting the input's counts", () => {
      const data = mergeRuns([run(mixed)], { root: ROOT, absolutePaths: false });

      expect(data.totals).toEqual({
        tests: 7,
        passed: 2,
        failed: 1,
        skipped: 3,
        todo: 1,
        files: 3,
        filesFailed: 2,
      });
    });

    it("reports failure when a case failed", () => {
      expect(mergeRuns([run(mixed)], { root: ROOT, absolutePaths: false }).success).toBe(false);
    });
  });

  describe("merging shards", () => {
    it("concatenates files and sums totals", async () => {
      const data = mergeRuns(
        [
          run(await fixture("shard-a.json"), resolve(ROOT, "a.json")),
          run(await fixture("shard-b.json"), resolve(ROOT, "b.json")),
        ],
        { root: ROOT, absolutePaths: false },
      );

      expect(data.files.map((file) => file.path)).toEqual(["src/one.test.ts", "src/two.test.ts"]);
      expect(data.totals.tests).toBe(3);
      expect(data.totals.failed).toBe(1);
      expect(data.success).toBe(false);
    });

    it("takes the earliest start and the latest end across shards", async () => {
      const data = mergeRuns(
        [
          run(await fixture("shard-a.json"), resolve(ROOT, "a.json")),
          run(await fixture("shard-b.json"), resolve(ROOT, "b.json")),
        ],
        { root: ROOT, absolutePaths: false },
      );

      // shard-b started first (…001000) and shard-b ended last (…009000).
      expect(data.startedAt).toBe(new Date(1786000001000).toISOString());
      expect(data.durationMs).toBe(8000);
    });

    it("names every input in sources", async () => {
      const data = mergeRuns(
        [
          run(await fixture("shard-a.json"), resolve(ROOT, "a.json")),
          run(await fixture("shard-b.json"), resolve(ROOT, "b.json")),
        ],
        { root: ROOT, absolutePaths: false },
      );

      expect(data.sources).toEqual(["a.json", "b.json"]);
    });

    it("stays successful only when every shard was", async () => {
      const data = mergeRuns([run(await fixture("shard-a.json"))], {
        root: ROOT,
        absolutePaths: false,
      });

      expect(data.success).toBe(true);
    });
  });

  it("maps a real captured vitest run", async () => {
    const real = await fixture("real-run.json");
    const data = mergeRuns([run(real)], { root: resolve("."), absolutePaths: false });

    expect(isTestResults(data)).toBe(true);
    expect(data.tool).toBe("vitest");
    expect(data.success).toBe(true);
    expect(data.totals.tests).toBeGreaterThan(0);
    expect(data.totals.tests).toBe(data.totals.passed);
  });
});
