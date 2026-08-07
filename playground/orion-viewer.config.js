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

  // No viewer plugin exists yet, so a fetched report reaches the "no viewer
  // plugin renders '<kind>' reports" empty state rather than a rendering. Add
  // one here when there is one: { package: "@orion/plugin-viewer-..." }.
  viewers: [],
});
