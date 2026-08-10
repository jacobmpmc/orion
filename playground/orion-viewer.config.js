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

  connections: [
    {
      // The URL segment: a report lands at /r/local/<id>.
      name: "local",
      label: "Local disk",
      package: "@orion/plugin-storage-filesystem",
      // Relative to the working directory, so run this from playground/.
      // Same directory `pnpm generate` writes into.
      options: { path: "./reports" },
    },
  ],

  // Renders `test-results` reports -- what `pnpm run test-report` produces.
  // A report of any other kind (the demo reporter's, say) still reaches the
  // "no viewer plugin renders '<kind>' reports" empty state, which is worth
  // seeing at least once.
  //
  // Its browser bundle must have been built: `pnpm build` from the root does
  // both halves, but `tsc --build` alone leaves the viewer refusing to start.
  viewers: [{ package: "@orion/plugin-viewer-test-results" }],
});
