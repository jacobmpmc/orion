import type { CompositeEntry } from "@orion/report-composite";
import { entryMeta, entryTitle } from "./model.js";

/**
 * Element builders.
 *
 * Every value out of the report reaches the DOM as `textContent` or through
 * `append(string)`, and **`innerHTML` is never used here**. A composite carries
 * titles and ids written by whoever ran the pipeline, and the reports nested
 * inside it come from anywhere at all; treating any of that as markup would be
 * a script-injection hole in a page that renders reports from CI. Keep it that
 * way.
 */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The composite's own heading, when it was given one. */
export function title(text: string): HTMLElement {
  return el("h2", "ocp-title", text);
}

/** The count of parts, so a collapsed page still says how much is in it. */
export function summaryLine(count: number): HTMLElement {
  const label = count === 1 ? "1 report" : `${count} reports`;
  return el("p", "ocp-meta", label);
}

export interface Section {
  readonly node: HTMLDetailsElement;
  /** The element the host mounts the child report into. This plugin never
   * touches what goes inside it. */
  readonly body: HTMLElement;
}

/**
 * One part: a collapsible header over the element its report is drawn into.
 *
 * `renderable` only decides whether the section starts open. A part nothing can
 * draw is still built and still asked for -- the host puts its own placeholder
 * inside -- so the reader can open it and find out why rather than wondering
 * where it went.
 */
export function section(entry: CompositeEntry, renderable: boolean): Section {
  const node = el("details", "ocp-entry");
  node.open = renderable;

  const summary = el("summary");
  summary.append(el("span", "ocp-name", entryTitle(entry)));

  const meta = entryMeta(entry);
  if (meta !== "") summary.append(el("span", "ocp-meta", meta));
  node.append(summary);

  if (entry.description !== undefined && entry.description.trim() !== "") {
    node.append(el("p", "ocp-description", entry.description));
  }

  const body = el("div", "ocp-body");
  node.append(body);

  return { node, body };
}

/** The message shown instead of a rendering when the data is not this schema. */
export function unreadable(): HTMLElement {
  return el("p", "ocp-empty", "This report is not in a shape the composite viewer understands.");
}

/** A composite that contains nothing. Legal, and worth saying out loud. */
export function empty(): HTMLElement {
  return el("p", "ocp-empty", "This composite contains no reports.");
}

/** The banner for a report produced by a newer reporter than this plugin. */
export function versionNotice(): HTMLElement {
  return el(
    "p",
    "ocp-notice",
    "This report was produced by a newer reporter than this viewer plugin. It is shown as far as this version understands it.",
  );
}
