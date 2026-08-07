import { ref } from "vue";
import type { Ref } from "vue";
import { base } from "./api.js";

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

export const route: Ref<Route> = ref(parse(window.location.pathname));

window.addEventListener("popstate", () => {
  route.value = parse(window.location.pathname);
});

export function navigate(path: string): void {
  const url = path.startsWith("/") ? path : `${base}${path}`;
  window.history.pushState(null, "", url);
  route.value = parse(new URL(url, window.location.origin).pathname);
}

/** Builds the link a CI job would print for a stored report. */
export function reportHref(connection: string, id: string): string {
  const encodedId = id
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}r/${encodeURIComponent(connection)}/${encodedId}`;
}
