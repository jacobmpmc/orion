<script setup lang="ts">
import { ref, watch } from "vue";
import type { Report } from "@orion/core";
import { ApiError, getReport } from "../api.js";
import ReportHost from "../ReportHost.vue";
import { loadManifest, manifest } from "../state.js";

const props = defineProps<{ connection: string; id: string }>();

const report = ref<Report | undefined>(undefined);
const error = ref<string | undefined>(undefined);
const loading = ref(true);

async function load(): Promise<void> {
  loading.value = true;
  error.value = undefined;
  report.value = undefined;

  // The manifest decides which plugin renders the result, so it has to be there
  // before the report is handed to ReportHost.
  await loadManifest();

  try {
    report.value = await getReport(props.connection, props.id);
  } catch (cause) {
    error.value =
      cause instanceof ApiError ? cause.message : `Could not reach the viewer: ${String(cause)}`;
  } finally {
    loading.value = false;
  }
}

watch(() => [props.connection, props.id], () => void load(), { immediate: true });

/** Listed in the empty state so it is obvious what the viewer *can* render. */
const knownKinds = (): string =>
  [...new Set((manifest.value?.viewers ?? []).flatMap((viewer) => viewer.reports))].join(", ");
</script>

<template>
  <section>
    <h2>{{ id }}</h2>
    <p class="hint">from {{ connection }}</p>

    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="notice">{{ error }}</p>
    <template v-else-if="report">
      <p v-if="knownKinds() === ''" class="notice">
        No viewer plugins are configured, so there is nothing to render this report with.
      </p>
      <ReportHost :report="report" :source="{ connection, id }" />
    </template>
  </section>
</template>

<style scoped>
.hint {
  color: var(--muted);
  font-size: 0.9rem;
  margin-top: -0.5rem;
}
</style>
