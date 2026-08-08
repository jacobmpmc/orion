<script setup lang="ts">
import { useTemplateRef } from "vue";
import type { Report } from "@orion/core";
import { base } from "./api.js";
import { useReportViewer } from "./composables/useReportViewer.js";
import type { ReportSource } from "./composables/useReportViewer.js";

const props = defineProps<{
  report: Report;
  source?: ReportSource;
}>();

const host = useTemplateRef<HTMLElement>("host");

const { error } = useReportViewer(
  host,
  () => props.report,
  () => props.source,
);
</script>

<template>
  <p v-if="error" class="notice">
    {{ error }}
    <span v-if="base">Bundles are served from {{ base }}plugins/.</span>
  </p>
  <!-- The plugin owns everything inside; this component never touches it. -->
  <div ref="host" class="mount" />
</template>

<style scoped>
.mount {
  min-height: 4rem;
}
</style>
