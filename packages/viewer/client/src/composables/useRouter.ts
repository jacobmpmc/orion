import { computed, shallowRef } from "vue";
import type { ComputedRef } from "vue";
import { base } from "../api.js";

export type Route =
  | { readonly name: "home" }
  | { readonly name: "report"; readonly connection: string; readonly id: string }
  | { readonly name: "notFound" };

/**
 * Three routes over the History API.
 *
 * Hand-rolled rather than `vue-router`: the whole route table is the union
 * above, and the server's SPA fallback already does the hard part by serving
 * the shell for any path it does not recognise.
 */
function parse(pathname: string): Route {
  const relative = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.slice(1);
  const segments = relative.split("/").filter((segment) => segment !== "");

  if (segments.length === 0) return { name: "home" };

  if (segments[0] === "r") {
    const [, connection, ...idSegments] = segments;
    if (connection === undefined || idSegments.length === 0) return { name: "notFound" };
    return {
      name: "report",
      connection: decodeURIComponent(connection),
      id: idSegments.map((segment) => decodeURIComponent(segment)).join("/"),
    };
  }

  return { name: "notFound" };
}

/**
 * Module scope, and the `popstate` listener with it: there is exactly one
 * browser history, so a per-component instance would only ever be a second view
 * of the same thing. Nothing here is scoped to a component lifetime, which is
 * why no listener is ever torn down.
 */
const current = shallowRef<Route>(parse(window.location.pathname));

window.addEventListener("popstate", () => {
  current.value = parse(window.location.pathname);
});

function navigate(path: string): void {
  const url = path.startsWith("/") ? path : `${base}${path}`;
  window.history.pushState(null, "", url);
  current.value = parse(new URL(url, window.location.origin).pathname);
}

/** Builds the link a CI job would print for a stored report. */
function reportHref(connection: string, id: string): string {
  const encodedId = id
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}r/${encodeURIComponent(connection)}/${encodedId}`;
}

const route = computed(() => current.value);

export interface UseRouter {
  readonly route: ComputedRef<Route>;
  readonly navigate: (path: string) => void;
  readonly reportHref: (connection: string, id: string) => string;
}

export function useRouter(): UseRouter {
  return { route, navigate, reportHref };
}

/** The read-only half, for components that render a route but never change it. */
export function useRoute(): ComputedRef<Route> {
  return route;
}
