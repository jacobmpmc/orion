<script setup lang="ts">
import ReportHost from "../ReportHost.vue";
import { useManifest } from "../composables/useManifest.js";
import { useReport } from "../composables/useReport.js";

const props = defineProps<{ connection: string; id: string }>();

const { report, error, loading } = useReport(
  () => props.connection,
  () => props.id,
);

/** Empty when no plugin can render anything, which is worth saying out loud. */
const { kinds } = useManifest();
</script>

<template>
  <section>
    <h2>{{ id }}</h2>
    <p class="hint">from {{ connection }}</p>

    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="notice">{{ error }}</p>
    <template v-else-if="report">
      <p v-if="kinds.length === 0" class="notice">
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
