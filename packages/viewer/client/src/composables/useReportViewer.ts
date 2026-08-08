import { computed, onScopeDispose, shallowRef, toValue, watch } from "vue";
import type { ComputedRef, MaybeRefOrGetter } from "vue";
import type { Report, ViewerMount, ViewerUnmount } from "@orion/core";
import { useManifest } from "./useManifest.js";

/** One import per bundle URL, so switching between reports does not refetch. */
const bundles = new Map<string, Promise<{ mount?: ViewerMount<HTMLElement> }>>();

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

    const plugin = entry.value;
    if (plugin === undefined) {
      // Silent while the manifest is still on its way; this reruns when it
      // settles, since both `entry` and `settled` are watched.
      if (manifestError.value !== undefined) {
        error.value = `The list of viewer plugins could not be loaded: ${manifestError.value}`;
      } else if (settled.value) {
        error.value = `No viewer plugin renders '${toValue(report).kind}' reports.`;
      }
      return;
    }

    const url = new URL(plugin.bundle, window.location.origin).href;
    let module: { mount?: ViewerMount<HTMLElement> };
    try {
      // @vite-ignore, or Vite tries to resolve a runtime URL at build time.
      bundles.set(url, bundles.get(url) ?? import(/* @vite-ignore */ url));
      module = await (bundles.get(url) as Promise<{ mount?: ViewerMount<HTMLElement> }>);
    } catch (cause) {
      bundles.delete(url);
      error.value = `Could not load the '${plugin.name}' viewer plugin: ${
        cause instanceof Error ? cause.message : String(cause)
      }`;
      return;
    }

    if (typeof module.mount !== "function") {
      error.value = `The '${plugin.name}' viewer plugin's bundle does not export mount().`;
      return;
    }

    const from = toValue(source);
    try {
      unmount = await module.mount(element, {
        report: toValue(report),
        ...(from !== undefined ? { source: from } : {}),
      });
    } catch (cause) {
      error.value = `The '${plugin.name}' viewer plugin failed to render this report: ${
        cause instanceof Error ? cause.message : String(cause)
      }`;
    }
  }

  // `post` so the host element exists in the DOM by the time a plugin gets it.
  watch([() => toValue(host), () => toValue(report), entry, settled], () => void render(), {
    immediate: true,
    flush: "post",
  });

  onScopeDispose(teardown);

  return { error: computed(() => error.value) };
}
