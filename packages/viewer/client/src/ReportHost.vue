<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { Report, ViewerMount, ViewerUnmount } from "@orion/core";
import { base } from "./api.js";
import { viewerFor } from "./state.js";

const props = defineProps<{
  report: Report;
  source?: { connection: string; id: string };
}>();

const host = ref<HTMLElement | undefined>(undefined);
const error = ref<string | undefined>(undefined);

/** One import per bundle URL, so switching between reports does not refetch. */
const bundles = new Map<string, Promise<{ mount?: ViewerMount<HTMLElement> }>>();

let unmount: ViewerUnmount | undefined;

function teardown(): void {
  if (unmount === undefined) return;
  const previous = unmount;
  unmount = undefined;
  try {
    previous();
  } catch {
    // A plugin that fails to clean up must not stop the next one mounting.
  }
}

async function render(): Promise<void> {
  teardown();
  error.value = undefined;

  const element = host.value;
  if (element === undefined) return;
  element.replaceChildren();

  const entry = viewerFor(props.report.kind);
  if (entry === undefined) {
    error.value = `No viewer plugin renders '${props.report.kind}' reports.`;
    return;
  }

  const url = new URL(entry.bundle, window.location.origin).href;
  let module: { mount?: ViewerMount<HTMLElement> };
  try {
    // @vite-ignore, or Vite tries to resolve a runtime URL at build time.
    bundles.set(url, bundles.get(url) ?? import(/* @vite-ignore */ url));
    module = await (bundles.get(url) as Promise<{ mount?: ViewerMount<HTMLElement> }>);
  } catch (cause) {
    bundles.delete(url);
    error.value = `Could not load the '${entry.name}' viewer plugin: ${
      cause instanceof Error ? cause.message : String(cause)
    }`;
    return;
  }

  if (typeof module.mount !== "function") {
    error.value = `The '${entry.name}' viewer plugin's bundle does not export mount().`;
    return;
  }

  try {
    unmount = await module.mount(element, {
      report: props.report,
      ...(props.source !== undefined ? { source: props.source } : {}),
    });
  } catch (cause) {
    error.value = `The '${entry.name}' viewer plugin failed to render this report: ${
      cause instanceof Error ? cause.message : String(cause)
    }`;
  }
}

watch(() => [props.report, host.value], () => void render(), { immediate: true, flush: "post" });
onBeforeUnmount(teardown);
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
