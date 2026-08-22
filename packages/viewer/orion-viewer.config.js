// @ts-check
import { defineConfig } from "@orion/viewer/config";

/**
 * `defineConfig` is an identity function; it is here so the editor types this
 * object and a typo is caught where it is written. A plain default export works
 * just as well, and is what you want somewhere `@orion/viewer` is not a
 * dependency.
 */
export default defineConfig({
  // Loopback is the default. A container would need 0.0.0.0 to be reachable.
  host: "127.0.0.1",
  port: 7317,

  connections: [],

  // A report of a kind no plugin here claims (the demo reporter's, say) still
  // reaches the "no viewer plugin renders '<kind>' reports" empty state, which
  // is worth seeing at least once.
  //
  // Every browser bundle must have been built: `pnpm build` from the root does
  // both halves, but `tsc --build` alone leaves the viewer refusing to start.
  viewers: [
    // Renders `test-results` reports -- what `pnpm run test-report` produces.
    { package: "@orion/plugin-viewer-test-results" },
    // Renders `composite` reports -- what `pnpm run composite` produces -- by
    // asking the host to draw each part with whichever plugin claims it. Drop
    // the line above and the composite still renders, with a placeholder where
    // each test-results part would have been.
    { package: "@orion/plugin-viewer-composite" },
    // Renders `pulumi-diff` reports -- what `pnpm run pulumi-report` produces
    // from a captured `pulumi preview --json`.
    { package: "@orion/plugin-viewer-pulumi-diff" },
  ],
});
