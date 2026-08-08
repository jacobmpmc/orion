import { computed, shallowRef, toValue, watch } from "vue";
import type { ComputedRef, MaybeRefOrGetter } from "vue";
import type { Report } from "@orion/core";
import { ApiError, getReport } from "../api.js";
import { useManifest } from "./useManifest.js";

export interface UseReport {
  readonly report: ComputedRef<Report | undefined>;
  readonly error: ComputedRef<string | undefined>;
  readonly loading: ComputedRef<boolean>;
}

/**
 * Fetches one report from a storage connection, refetching whenever either
 * source changes. Both are `MaybeRefOrGetter` so a caller can pass props
 * straight through (`() => props.connection`) and keep the reactivity.
 */
export function useReport(
  connection: MaybeRefOrGetter<string>,
  id: MaybeRefOrGetter<string>,
): UseReport {
  const report = shallowRef<Report | undefined>(undefined);
  const error = shallowRef<string | undefined>(undefined);
  const loading = shallowRef(true);

  // Only the newest request may write to the refs; a slower earlier fetch
  // resolving late must not overwrite the report the user is actually looking at.
  let latest = 0;

  async function load(source: string, reportId: string): Promise<void> {
    const request = ++latest;
    loading.value = true;
    error.value = undefined;
    report.value = undefined;

    // The manifest decides which plugin renders the result, so it has to be
    // there before the report reaches a viewer.
    await useManifest().load();

    try {
      const loaded = await getReport(source, reportId);
      if (request === latest) report.value = loaded;
    } catch (cause) {
      if (request === latest) {
        error.value =
          cause instanceof ApiError ? cause.message : `Could not reach the viewer: ${String(cause)}`;
      }
    } finally {
      if (request === latest) loading.value = false;
    }
  }

  watch(
    [() => toValue(connection), () => toValue(id)],
    ([source, reportId]) => void load(source, reportId),
    { immediate: true },
  );

  return {
    report: computed(() => report.value),
    error: computed(() => error.value),
    loading: computed(() => loading.value),
  };
}
