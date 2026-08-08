import { computed, shallowRef } from "vue";
import type { ComputedRef } from "vue";
import { isReport } from "@orion/core";
import type { Report } from "@orion/core";

export interface UseDroppedReport {
  /**
   * A report the user dropped in, which lives only in this tab. It is never
   * sent to the server -- that is what lets the viewer stay stateless and lets
   * someone inspect a report the server has no connection to.
   */
  readonly report: ComputedRef<Report | undefined>;
  readonly error: ComputedRef<string | undefined>;
  /** True while a file is held over the drop target, for styling it. */
  readonly dragging: ComputedRef<boolean>;
  /** Bind with `v-on="handlers"`; each one already prevents the default. */
  readonly handlers: {
    readonly dragover: (event: DragEvent) => void;
    readonly dragleave: (event: DragEvent) => void;
    readonly drop: (event: DragEvent) => void;
  };
  /** For a file picked through `<input type="file">` rather than dropped. */
  readonly accept: (file: File | undefined) => Promise<void>;
}

/**
 * Reads a report file in the browser. State is per-caller rather than shared:
 * a dropped report belongs to the view the user dropped it on.
 */
export function useDroppedReport(): UseDroppedReport {
  const report = shallowRef<Report | undefined>(undefined);
  const error = shallowRef<string | undefined>(undefined);
  const dragging = shallowRef(false);

  async function accept(file: File | undefined): Promise<void> {
    error.value = undefined;
    report.value = undefined;
    if (file === undefined) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      error.value = `${file.name} is not valid JSON.`;
      return;
    }

    if (!isReport(parsed)) {
      error.value = `${file.name} is JSON, but not an Orion report.`;
      return;
    }

    report.value = parsed;
  }

  const handlers = {
    dragover: (event: DragEvent): void => {
      event.preventDefault();
      dragging.value = true;
    },
    dragleave: (event: DragEvent): void => {
      event.preventDefault();
      dragging.value = false;
    },
    drop: (event: DragEvent): void => {
      event.preventDefault();
      dragging.value = false;
      void accept(event.dataTransfer?.files[0]);
    },
  };

  return {
    report: computed(() => report.value),
    error: computed(() => error.value),
    dragging: computed(() => dragging.value),
    handlers,
    accept,
  };
}
