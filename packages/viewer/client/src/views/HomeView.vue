<script setup lang="ts">
import { ref } from "vue";
import { isReport } from "@orion/core";
import ReportHost from "../ReportHost.vue";
import { navigate, reportHref } from "../router.js";
import { droppedReport, manifest, manifestError } from "../state.js";

const ids = ref<Record<string, string>>({});
const dropError = ref<string | undefined>(undefined);
const dragging = ref(false);

function open(connection: string): void {
  const id = ids.value[connection]?.trim();
  if (id === undefined || id === "") return;
  navigate(reportHref(connection, id));
}

/**
 * Reads a dropped report in the browser. Nothing is uploaded: the server has no
 * endpoint that accepts a report, which is what keeps it stateless.
 */
async function accept(file: File | undefined): Promise<void> {
  dropError.value = undefined;
  droppedReport.value = undefined;
  if (file === undefined) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    dropError.value = `${file.name} is not valid JSON.`;
    return;
  }

  if (!isReport(parsed)) {
    dropError.value = `${file.name} is JSON, but not an Orion report.`;
    return;
  }

  droppedReport.value = parsed;
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  void accept(event.dataTransfer?.files[0]);
}

function onPick(event: Event): void {
  void accept((event.target as HTMLInputElement).files?.[0] ?? undefined);
}
</script>

<template>
  <section>
    <h2>Storage connections</h2>
    <p v-if="manifestError" class="notice">{{ manifestError }}</p>
    <p v-else-if="manifest && manifest.connections.length === 0" class="notice">
      No storage connections are configured. Add some to the viewer's configuration file.
    </p>
    <ul v-else class="connections">
      <li v-for="connection in manifest?.connections ?? []" :key="connection.name">
        <strong>{{ connection.label }}</strong>
        <form @submit.prevent="open(connection.name)">
          <input
            v-model="ids[connection.name]"
            :aria-label="`Report id in ${connection.label}`"
            placeholder="report id"
          />
          <button type="submit">Open</button>
        </form>
      </li>
    </ul>
    <!-- Ids cannot be listed: storage plugins can fetch one report, not enumerate. -->
    <p class="hint">A report's id is what <code>orion generate</code> printed when it stored it.</p>
  </section>

  <section>
    <h2>Open a report file</h2>
    <div
      class="drop"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <p>Drop a report JSON file here.</p>
      <label>
        or choose a file
        <input type="file" accept="application/json,.json" @change="onPick" />
      </label>
    </div>
    <p v-if="dropError" class="notice">{{ dropError }}</p>
    <ReportHost v-if="droppedReport" :report="droppedReport" />
  </section>
</template>

<style scoped>
.connections {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}
.connections form {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
.drop {
  border: 2px dashed var(--line);
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
}
.drop.dragging {
  border-color: var(--accent);
}
.hint {
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
