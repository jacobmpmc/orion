import { computed, onScopeDispose, shallowRef, toValue, watch } from "vue";
import type { ComputedRef, MaybeRefOrGetter } from "vue";
import type { Report, ViewerUnmount } from "@orion/core";
import { mountReport, noViewerMessage } from "../render/mountReport.js";
import { useManifest } from "./useManifest.js";

export interface ReportSource {
  readonly connection: string;
  readonly id: string;
}

export interface UseReportViewer {
  /** Set when no plugin claims the kind, or the plugin failed to load or render. */
  readonly error: ComputedRef<string | undefined>;
}

/**
 * Hands an element over to the viewer plugin registered for a report's kind,
 * and takes it back when the report changes or the scope is disposed. Nothing
 * inside the element is Vue's to touch once the plugin has mounted, which is
 * why the plugin's teardown is the only thing that clears it.
 *
 * The mounting itself lives in `render/mountReport.ts`, which a plugin can also
 * reach through its mount context; this composable is the reactive half.
 */
export function useReportViewer(
  host: MaybeRefOrGetter<HTMLElement | null | undefined>,
  report: MaybeRefOrGetter<Report>,
  source: MaybeRefOrGetter<ReportSource | undefined> = undefined,
): UseReportViewer {
  const error = shallowRef<string | undefined>(undefined);
  const { settled, error: manifestError, viewerFor } = useManifest();
  const entry = viewerFor(() => toValue(report).kind);

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

    const element = toValue(host);
    if (element === null || element === undefined) return;
    element.replaceChildren();

    if (entry.value === undefined) {
      // Silent while the manifest is still on its way; this reruns when it
      // settles, since both `entry` and `settled` are watched.
      if (manifestError.value !== undefined) {
        error.value = `The list of viewer plugins could not be loaded: ${manifestError.value}`;
      } else if (settled.value) {
        error.value = noViewerMessage(toValue(report).kind);
      }
      return;
    }

    const from = toValue(source);
    const result = await mountReport(element, toValue(report), {
      depth: 0,
      ...(from !== undefined ? { source: from } : {}),
    });

    unmount = result.unmount;
    // A failure at the top of the page is a notice above the empty mount area,
    // not a placeholder inside it -- that is the host's own chrome talking.
    error.value = result.error;
  }

  // `post` so the host element exists in the DOM by the time a plugin gets it.
  watch([() => toValue(host), () => toValue(report), entry, settled], () => void render(), {
    immediate: true,
    flush: "post",
  });

  onScopeDispose(teardown);

  return { error: computed(() => error.value) };
}
