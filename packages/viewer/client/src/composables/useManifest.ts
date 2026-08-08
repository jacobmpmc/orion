import { computed, shallowRef, toValue } from "vue";
import type { ComputedRef, MaybeRefOrGetter } from "vue";
import { getManifest } from "../api.js";
import type { Manifest, ManifestConnection, ManifestViewer } from "../api.js";

/**
 * State lives at module scope on purpose. The manifest describes the one server
 * this tab is talking to, so every caller shares a single copy and a single
 * in-flight request -- calling `useManifest()` from three components must not
 * fetch it three times.
 */
const manifest = shallowRef<Manifest | undefined>(undefined);
const error = shallowRef<string | undefined>(undefined);

let started: Promise<void> | undefined;

function load(): Promise<void> {
  started ??= getManifest().then(
    (loaded) => {
      manifest.value = loaded;
    },
    (cause: unknown) => {
      error.value = cause instanceof Error ? cause.message : String(cause);
    },
  );
  return started;
}

const readonlyManifest = computed(() => manifest.value);
const readonlyError = computed(() => error.value);
const connections = computed<readonly ManifestConnection[]>(() => manifest.value?.connections ?? []);

/** Loaded or failed, as opposed to still in flight. */
const settled = computed(() => manifest.value !== undefined || error.value !== undefined);

/** Every report kind some registered plugin can render, deduplicated. */
const kinds = computed<readonly string[]>(() => [
  ...new Set((manifest.value?.viewers ?? []).flatMap((viewer) => viewer.reports)),
]);

export interface UseManifest {
  readonly manifest: ComputedRef<Manifest | undefined>;
  readonly error: ComputedRef<string | undefined>;
  /** False until the request has either landed or failed. */
  readonly settled: ComputedRef<boolean>;
  readonly connections: ComputedRef<readonly ManifestConnection[]>;
  readonly kinds: ComputedRef<readonly string[]>;
  /** Idempotent; the first call fetches and later ones await that same request. */
  readonly load: () => Promise<void>;
  /** The plugin registered to render a report kind, tracked as the manifest arrives. */
  readonly viewerFor: (kind: MaybeRefOrGetter<string>) => ComputedRef<ManifestViewer | undefined>;
}

export function useManifest(): UseManifest {
  return {
    manifest: readonlyManifest,
    error: readonlyError,
    settled,
    connections,
    kinds,
    load,
    viewerFor: (kind) =>
      computed(() => {
        const wanted = toValue(kind);
        return manifest.value?.viewers.find((viewer) => viewer.reports.includes(wanted));
      }),
  };
}
