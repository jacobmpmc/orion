/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare global {
  interface Window {
    /** Injected into index.html when the viewer is mounted under a path. */
    __ORION_BASE__?: string;
  }
}

export {};
