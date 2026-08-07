import { ref, shallowRef } from "vue";
import type { Ref, ShallowRef } from "vue";
import type { Report } from "@orion/core";
import { getManifest } from "./api.js";
import type { Manifest } from "./api.js";

export const manifest: ShallowRef<Manifest | undefined> = shallowRef(undefined);
export const manifestError: Ref<string | undefined> = ref(undefined);

/**
 * A report the user dropped in, which lives only in this tab. It is never sent
 * to the server -- that is what lets the viewer stay stateless and lets someone
 * inspect a report the server has no connection to.
 */
export const droppedReport: ShallowRef<Report | undefined> = shallowRef(undefined);

let started: Promise<void> | undefined;

export function loadManifest(): Promise<void> {
  started ??= getManifest().then(
    (loaded) => {
      manifest.value = loaded;
    },
    (error: unknown) => {
      manifestError.value = error instanceof Error ? error.message : String(error);
    },
  );
  return started;
}

/** Finds the plugin that renders a report kind, if one is registered. */
export function viewerFor(kind: string): Manifest["viewers"][number] | undefined {
  return manifest.value?.viewers.find((viewer) => viewer.reports.includes(kind));
}
