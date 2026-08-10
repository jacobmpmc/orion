import { describe, expect, it } from "vitest";
import { TEST_RESULTS_KIND } from "@orion/report-test-results";
import plugin from "../src/index.js";

describe("test-results viewer plugin", () => {
  it("declares itself as a viewer", () => {
    expect(plugin.kind).toBe("viewer");
    expect(plugin.name).toBe("test-results");
  });

  it("renders the test-results kind", () => {
    expect(plugin.reports).toEqual([TEST_RESULTS_KIND]);
  });

  it("has nothing to configure", () => {
    const result = plugin.parseOptions({});
    expect(result.ok).toBe(true);
    expect(plugin.options).toBeUndefined();
  });

  // What is pinned is the "./": the URL resolves against the plugin module
  // itself, so at runtime it lands beside dist/index.js. A "../browser/..."
  // would compile, ship, and fail only when a viewer starts up.
  //
  // Existence is deliberately not asserted -- dist/browser is a separate build
  // a clean checkout has not run yet, and the viewer stats the file at startup.
  it("points at a browser bundle beside its own module", () => {
    const pluginModule = new URL("../src/index.ts", import.meta.url);

    expect(plugin.bundle).toBe(new URL("./browser/index.js", pluginModule).href);
  });
});
