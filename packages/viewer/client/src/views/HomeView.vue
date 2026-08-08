<script setup lang="ts">
import { ref } from "vue";
import ReportHost from "../ReportHost.vue";
import { useDroppedReport } from "../composables/useDroppedReport.js";
import { useManifest } from "../composables/useManifest.js";
import { useRouter } from "../composables/useRouter.js";

const { manifest, error: manifestError, connections } = useManifest();
const { navigate, reportHref } = useRouter();
const {
  report: droppedReport,
  error: dropError,
  dragging,
  handlers,
  accept,
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
    <div class="drop" :class="{ dragging }" v-on="handlers">
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
