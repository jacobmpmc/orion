import { ok } from "@orion/core";
import type { ViewerPlugin } from "@orion/core";
import { COMPOSITE_KIND } from "@orion/report-composite";

/**
 * The Node half of the plugin, and the only part the server ever imports. It
 * declares what this renders and where the browser bundle is; the server reads
 * that file's bytes and never evaluates them.
 *
 * Nothing here says anything about the kinds a composite contains: the browser
 * half asks the host to render each child, and the host dispatches to whichever
 * plugin claims it. Which means this plugin renders a composite of kinds that
 * did not exist when it was written.
 */
const plugin: ViewerPlugin = {
  kind: "viewer",
  name: "composite",
  reports: [COMPOSITE_KIND],
  // Resolved against dist/index.js at runtime, not against this source file --
  // which is why it is "./browser/…" and not "../browser/…". A wrong answer
  // here surfaces only when the viewer starts, so test/plugin.test.ts pins it.
  bundle: new URL("./browser/index.js", import.meta.url).href,
  // Nothing to configure: the registry validates viewer plugin options and then
  // discards them, and there is nothing the browser could read anyway.
  parseOptions: () => ok({}),
};

export default plugin;
