import { defineConfig } from "vite";

/**
 * Builds the browser half into one self-contained ES module at
 * `dist/browser/index.js`, which is what `src/index.ts` points the viewer at.
 *
 * The viewer serves exactly one path per plugin -- `/plugins/<id>/bundle.js` --
 * and nothing beside it, so a second emitted chunk, a `style.css` or a
 * `.js.map` would 404 rather than load. Hence one file, no sourcemap, and CSS
 * carried as a string in `browser/styles.ts` rather than imported.
 */
export default defineConfig({
  build: {
    outDir: "dist/browser",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    // A single-entry library build emits one chunk and nothing is declared
    // external, so @orion/report-composite is inlined -- which is the point.
    lib: {
      entry: "browser/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
  },
});
