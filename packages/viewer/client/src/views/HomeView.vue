<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import ReportHost from "../ReportHost.vue";
import { useDroppedReport } from "../composables/useDroppedReport.js";
import { useManifest } from "../composables/useManifest.js";
import { useRouter } from "../composables/useRouter.js";

const { manifest, error: manifestError, connections } = useManifest();
const { navigate, reportHref } = useRouter();
const {
  reportFile,
  error: dropError,
  dragging,
  handlers,
  accept,
  close: closeDroppedReport,
} = useDroppedReport();

const ids = ref<Record<string, string>>({});

function open(connection: string): void {
  const id = ids.value[connection]?.trim();
  if (id === undefined || id === "") return;
  navigate(reportHref(connection, id));
}

function onPick(event: Event): void {
  void accept((event.target as HTMLInputElement).files?.[0] ?? undefined);
}

onMounted(() => {
  for (const [event, handler] of Object.entries(handlers)) {
    window.addEventListener(event, handler as () => void);
  }
});
onUnmounted(() => {
  for (const [event, handler] of Object.entries(handlers)) {
    window.removeEventListener(event, handler as () => void);
  }
});
</script>

<template>
  <section>
    <h2>Storage connections</h2>
    <p v-if="manifestError" class="notice">{{ manifestError }}</p>
    <p v-else-if="manifest && connections.length === 0" class="notice">
      No storage connections are configured. Add some to the viewer's configuration file.
    </p>
    <ul v-else class="connections">
      <li v-for="connection in connections" :key="connection.name">
        <strong>{{ connection.label }}</strong>
        <form @submit.prevent="open(connection.name)">
          <input v-model="ids[connection.name]" :aria-label="`Report id in ${connection.label}`"
            placeholder="report id" />
          <button type="submit">Open</button>
        </form>
      </li>
    </ul>
    <!-- Ids cannot be listed: storage plugins can fetch one report, not enumerate. -->
    <p class="hint">A report's id is what <code>orion generate</code> printed when it stored it.</p>
  </section>

  <section>
    <h2>Open a report file</h2>
    <template v-if="!reportFile">
      <div class="drop">
        <p>Drop a report JSON file here.</p>
        <label>
          or choose a file
          <input type="file" accept="application/json,.json" @change="onPick" />
        </label>
      </div>
      <p v-if="dropError" class="notice">{{ dropError }}</p>
    </template>
    <template v-else>
      <div class="dropped-report-header">
        <p>Viewing <code>{{ reportFile.name }}</code></p>
        <button type="button" @click="closeDroppedReport">Close</button>
      </div>
      <div class="dropped-report-wrapper">
        <ReportHost :report="reportFile.report" />
      </div>
    </template>
  </section>

  <div v-if="dragging" class="drop-highlight">
    <p>Drop a report to view it.</p>
  </div>
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

.drop-highlight {
  pointer-events: none;
  position: fixed;
  inset: 0;
  background: color-mix(in oklab, var(--accent), transparent 80%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-size: 2rem;
}

.drop-highlight::after {
  content: "";
  display: block;
  position: absolute;
  inset: 2rem;
  border: 2px dashed var(--accent);
  border-radius: 2rem;
}

.hint {
  color: var(--muted);
  font-size: 0.9rem;
}

.dropped-report-header {
  display: flex;
  flex-direction: row;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
}

.dropped-report-wrapper {
  padding-top: 1rem;
}
</style>
