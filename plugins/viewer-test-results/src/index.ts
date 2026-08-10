import { ok } from "@orion/core";
import type { ViewerPlugin } from "@orion/core";
import { TEST_RESULTS_KIND } from "@orion/report-test-results";

/**
 * The Node half of the plugin, and the only part the server ever imports. It
 * declares what this renders and where the browser bundle is; the server reads
 * that file's bytes and never evaluates them.
 */
const plugin: ViewerPlugin = {
  kind: "viewer",
  name: "test-results",
  reports: [TEST_RESULTS_KIND],
  // Resolved against dist/index.js at runtime, not against this source file --
  // which is why it is "./browser/…" and not "../browser/…". A wrong answer
  // here surfaces only when the viewer starts, so test/plugin.test.ts pins it.
  bundle: new URL("./browser/index.js", import.meta.url).href,
  // Nothing to configure: the registry validates viewer plugin options and then
  // discards them, and there is nothing the browser could read anyway.
  parseOptions: () => ok({}),
};

export default plugin;
