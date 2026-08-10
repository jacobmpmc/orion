<script setup lang="ts">
import { base } from "./api.js";
import { useManifest } from "./composables/useManifest.js";
import { useRoute } from "./composables/useRouter.js";
import HomeView from "./views/HomeView.vue";
import NotFoundView from "./views/NotFoundView.vue";
import ReportView from "./views/ReportView.vue";

const route = useRoute();

// Started here so the manifest is usually in flight before any view asks.
void useManifest().load();
</script>

<template>
  <header>
    <a :href="base"><h1>Orion</h1></a>
  </header>
  <main>
    <ReportView
      v-if="route.name === 'report'"
      :key="`${route.connection}/${route.id}`"
      :connection="route.connection"
      :id="route.id"
    />
    <NotFoundView v-else-if="route.name === 'notFound'" />
    <HomeView v-else />
  </main>
</template>

<style>
/*
 * These custom properties are a documented contract, not private styling: a
 * viewer plugin's bundle mounts into this page and inherits them, which is what
 * keeps two plugins from disagreeing about what "failed" looks like. Renaming
 * one breaks every plugin that ever shipped. See docs/viewer.md.
 *
 * --ok / --warn / --danger are deliberately semantic rather than named for any
 * one report kind: passed/todo/failed for a test report, created/changed/deleted
 * for an infrastructure diff.
 */
:root {
  --bg: #fbfbfd;
  --fg: #1c1c22;
  --muted: #6a6a78;
  --line: #d8d8e0;
  --accent: #3b5bdb;
  --ok: #1a7f37;
  --warn: #9a6700;
  --danger: #cf222e;
  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16161a;
    --fg: #ececf1;
    --muted: #9a9aa8;
    --line: #33333d;
    --accent: #91a7ff;
    --ok: #3fb950;
    --warn: #d29922;
    --danger: #f85149;
  }
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
}

header {
  border-bottom: 1px solid var(--line);
  padding: 0.5rem 1.5rem;
}

header a {
  color: inherit;
  text-decoration: none;
}

h1 {
  font-size: 1.1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0.5rem 0;
}

main {
  max-width: 60rem;
  margin: 0 auto;
  padding: 1.5rem;
  display: grid;
  gap: 2.5rem;
}

.notice {
  border-left: 3px solid var(--accent);
  padding: 0.5rem 0.75rem;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

input,
button {
  font: inherit;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--bg);
  color: inherit;
}

button {
  cursor: pointer;
}
</style>
