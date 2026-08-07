import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

/**
 * Where `vite dev` forwards API calls. In development the Vue app is served by
 * Vite for hot reloading while a separately running `orion-viewer` answers
 * everything that needs plugins, so the two have to be stitched together.
 */
const server = process.env["ORION_VIEWER_ORIGIN"] ?? "http://127.0.0.1:7317";

// The client is built separately from the server: `tsc --build` produces
// dist/, `vite build` produces dist/client/. The server serves the latter as
// static files and never imports anything from it.
export default defineConfig({
  root: "client",
  // Assets are always emitted at an absolute /assets/ path; a non-"/" basePath
  // is applied at serve time by rewriting index.html, so one build works
  // wherever it is mounted.
  base: "/",
  plugins: [vue()],
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    // Everything the client cannot serve itself. `/plugins` matters as much as
    // `/api`: a viewer plugin's browser bundle is fetched at runtime from the
    // server, not resolved by Vite.
    proxy: {
      "/api": { target: server, changeOrigin: true },
      "/plugins": { target: server, changeOrigin: true },
      "/healthz": { target: server, changeOrigin: true },
    },
  },
});
