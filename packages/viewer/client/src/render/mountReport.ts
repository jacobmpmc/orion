import { isReport } from "@orion/core";
import type {
  Report,
  ViewerMount,
  ViewerRenderTarget,
  ViewerReportRef,
  ViewerUnmount,
} from "@orion/core";
import { getReport } from "../api.js";
import { useManifest } from "../composables/useManifest.js";
import { placeholder } from "./placeholder.js";

/**
 * The host's report dispatch, with no Vue in it.
 *
 * It lives apart from `useReportViewer` because a viewer plugin can ask for
 * another report to be rendered inside its own element, so this has to be
 * callable from a plugin's mount -- outside any component, and recursively.
 */

/** One import per bundle URL, so switching between reports does not refetch. */
const bundles = new Map<string, Promise<{ mount?: ViewerMount<HTMLElement> }>>();

/**
 * How deep a report may be nested inside another.
 *
 * A composite that embeds itself, or two stored reports that reference each
 * other, would otherwise recurse until the tab dies. The limit is generous:
 * nothing legible goes deeper.
 */
export const MAX_NESTING_DEPTH = 4;

const noop: ViewerUnmount = () => {};

export interface MountOptions {
  /** 0 at the top of the page, +1 per nested render. */
  readonly depth: number;
  /** Where the report came from, when it came from storage. */
  readonly source?: ViewerReportRef;
}

export interface MountResult {
  readonly unmount: ViewerUnmount;
  /**
   * Set when nothing was mounted. Whoever asked decides how to show it: the
   * page draws it as a notice, a nested render draws it as a placeholder.
   */
  readonly error?: string;
}

/** The message for a kind no registered plugin claims. Shared so the page and a
 * nested placeholder never word it differently. */
export function noViewerMessage(kind: string): string {
  return `No viewer plugin renders '${kind}' reports.`;
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Whether some registered plugin claims a kind. Answers false until the
 * manifest has arrived, which is the honest answer at that point. */
export function canRender(kind: string): boolean {
  const { manifest } = useManifest();
  return manifest.value?.viewers.some((viewer) => viewer.reports.includes(kind)) ?? false;
}

async function resolve(target: ViewerRenderTarget): Promise<Report> {
  if (isReport(target)) return target;

  const { connection, id } = target;
  const fetched = await getReport(connection, id);
  if (!isReport(fetched)) {
    throw new Error(`'${connection}' returned something that is not an Orion report.`);
  }
  return fetched;
}

/**
 * Hands an element to the viewer plugin registered for a report's kind.
 *
 * Never throws and never draws anything itself: every failure comes back as
 * `error` with a do-nothing unmount, so the caller owns what the reader sees.
 */
export async function mountReport(
  element: HTMLElement,
  target: ViewerRenderTarget,
  options: MountOptions,
): Promise<MountResult> {
  if (options.depth > MAX_NESTING_DEPTH) {
    return { unmount: noop, error: "Reports are nested too deeply to render." };
  }

  const { manifest, error: manifestError, load } = useManifest();
  await load();

  let report: Report;
  let source = options.source;
  try {
    report = await resolve(target);
    if (!isReport(target)) source = target;
  } catch (cause) {
    return { unmount: noop, error: `That report could not be fetched: ${reason(cause)}` };
  }

  const plugin = manifest.value?.viewers.find((viewer) => viewer.reports.includes(report.kind));
  if (plugin === undefined) {
    return {
      unmount: noop,
      error:
        manifestError.value !== undefined
          ? `The list of viewer plugins could not be loaded: ${manifestError.value}`
          : noViewerMessage(report.kind),
    };
  }

  const url = new URL(plugin.bundle, window.location.origin).href;
  let module: { mount?: ViewerMount<HTMLElement> };
  try {
    // @vite-ignore, or Vite tries to resolve a runtime URL at build time.
    bundles.set(url, bundles.get(url) ?? import(/* @vite-ignore */ url));
    module = await (bundles.get(url) as Promise<{ mount?: ViewerMount<HTMLElement> }>);
  } catch (cause) {
    bundles.delete(url);
    return {
      unmount: noop,
      error: `Could not load the '${plugin.name}' viewer plugin: ${reason(cause)}`,
    };
  }

  if (typeof module.mount !== "function") {
    return {
      unmount: noop,
      error: `The '${plugin.name}' viewer plugin's bundle does not export mount().`,
    };
  }

  try {
    const unmount = await module.mount(element, {
      report,
      ...(source !== undefined ? { source } : {}),
      render: nestedRender(options.depth + 1),
      canRender,
    });
    return { unmount };
  } catch (cause) {
    return {
      unmount: noop,
      error: `The '${plugin.name}' viewer plugin failed to render this report: ${reason(cause)}`,
    };
  }
}

/**
 * The `render` a plugin is handed.
 *
 * The one place the "host draws the fallback" rule lives: whatever went wrong,
 * the plugin gets back an element with something readable in it and an unmount
 * that clears it, so it never has to branch on failure.
 */
function nestedRender(depth: number) {
  return async (element: HTMLElement, target: ViewerRenderTarget): Promise<ViewerUnmount> => {
    element.replaceChildren();
    const result = await mountReport(element, target, { depth });
    if (result.error === undefined) return result.unmount;

    const node = placeholder(result.error);
    element.append(node);
    return () => node.remove();
  };
}
