import type { Diagnostic, PropertyChange, PulumiDiffData, ResourceChange } from "@orion/report-pulumi-diff";
import {
  formatValue,
  labelFor,
  omittedUnchanged,
  signFor,
  subtitle,
  summarize,
  toneFor,
  toneForChange,
  type Tone,
} from "./model.js";

/**
 * Element builders.
 *
 * Every value out of the report reaches the DOM as `textContent` or through
 * `append(string)`, and **`innerHTML` is never used here**. A property value is
 * arbitrary infrastructure input -- a policy document, a user-data script,
 * whatever the program produced; treating it as markup would be a
 * script-injection hole in a page that renders reports from CI. Keep it that
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

function toneClass(tone: Tone): string {
  return `opd-tone-${tone}`;
}

/** The counts bar, plus what was previewed and how it went. */
export function summaryBar(data: PulumiDiffData): HTMLElement {
  const wrapper = el("div");
  const bar = el("div", "opd-bar");

  for (const chip of summarize(data)) {
    const node = el("span", "opd-chip");
    node.append(
      el("b", toneClass(chip.tone), String(chip.count)),
      el("span", "opd-tone-muted", chip.label),
    );
    bar.append(node);
  }

  wrapper.append(bar, el("p", "opd-meta", subtitle(data)));
  return wrapper;
}

export interface Controls {
  readonly node: HTMLElement;
  readonly search: HTMLInputElement;
  readonly changedOnly: HTMLInputElement;
  readonly expandAll: HTMLButtonElement;
}

/** The filter row. Wiring the events is the caller's job. */
export function controls(showChangedOnly: boolean, showExpandAll: boolean): Controls {
  const node = el("div", "opd-controls");

  const search = el("input");
  search.type = "search";
  search.placeholder = "Filter by name, type, URN or property…";
  search.setAttribute("aria-label", "Filter resources");

  const changedOnly = el("input");
  changedOnly.type = "checkbox";

  const toggle = el("label", "opd-toggle");
  toggle.append(changedOnly, "Changes only");

  const expandAll = el("button", "opd-expand-all");
  // Explicit, because a button inside a form defaults to submitting it -- and
  // this one lives in a page whose host app is not ours to assume about.
  expandAll.type = "button";

  node.append(search);
  // Offering to hide unchanged resources is pointless when the report never
  // carried any -- the reporter drops them unless asked to keep them.
  if (showChangedOnly) node.append(toggle);
  // Nothing to expand in a preview that would change nothing.
  if (showExpandAll) node.append(expandAll);

  return { node, search, changedOnly, expandAll };
}

/** The preview's own messages, which are often why a diff gets rejected. */
export function diagnosticsList(diagnostics: readonly Diagnostic[]): HTMLElement {
  const list = el("ul", "opd-diagnostics");

  for (const diagnostic of diagnostics) {
    const tone: Tone =
      diagnostic.severity === "error" ? "danger" : diagnostic.severity === "warning" ? "warn" : "muted";

    const item = el("li", `opd-diagnostic ${toneClass(tone)}`);
    item.append(el("p", undefined, diagnostic.message));
    if (diagnostic.urn !== undefined) item.append(el("p", "opd-urn", diagnostic.urn));
    list.append(item);
  }

  return list;
}

/** One property's row in a resource's table. */
function changeRow(change: PropertyChange): HTMLElement {
  const row = el("tr");
  const tone = toneClass(toneForChange(change));

  row.append(el("td", `opd-sign ${tone}`, signFor(change)));

  const path = el("td", "opd-path");
  path.append(change.path);
  if (change.replaces) {
    path.append(" ", el("span", "opd-forces", "forces replacement"));
  }
  row.append(path);

  const before = el("td");
  before.append(el("pre", "opd-value opd-before", formatValue(change.before)));
  row.append(before);

  const after = el("td");
  after.append(el("pre", "opd-value opd-after", formatValue(change.after)));
  row.append(after);

  return row;
}

/** A resource's property table, wrapped so a wide value scrolls itself. */
function changesTable(changes: readonly PropertyChange[]): HTMLElement {
  const scroll = el("div", "opd-scroll");
  const table = el("table", "opd-changes");

  const head = el("tr");
  for (const heading of ["", "Property", "Before", "After"]) {
    head.append(el("th", undefined, heading));
  }
  const thead = el("thead");
  thead.append(head);
  table.append(thead);

  const body = el("tbody");
  for (const change of changes) body.append(changeRow(change));
  table.append(body);

  scroll.append(table);
  return scroll;
}

export interface ResourceGroup {
  readonly resource: ResourceChange;
  readonly node: HTMLDetailsElement;
}

/** One resource: a collapsible summary line over what changes about it. */
export function resourceGroup(resource: ResourceChange): ResourceGroup {
  const node = el("details", "opd-resource");
  // A replacement opens itself: it is the outcome a reviewer came to check.
  node.open = resource.op === "replace" || resource.op === "delete";

  const tone = toneClass(toneFor(resource.op));
  const summary = el("summary");
  summary.append(
    el("span", `opd-badge ${tone}`, labelFor(resource.op)),
    el("span", "opd-name", resource.name),
    el("span", "opd-type", resource.type),
  );

  const changes = resource.changes;
  if (changes !== undefined) {
    summary.append(
      el("span", "opd-count", changes.length === 1 ? "1 property" : `${changes.length} properties`),
    );
  }
  node.append(summary);

  const body = el("div", "opd-body");
  body.append(el("p", "opd-urn", resource.urn));

  if (resource.provider !== undefined) {
    body.append(el("p", "opd-meta", `provider ${resource.provider}`));
  }

  if (changes === undefined) {
    // No detailed diff at all is not the same as one that found nothing, and
    // the difference matters: the first means the preview did not say.
    body.append(
      el(
        "p",
        "opd-empty",
        resource.diffReasons === undefined
          ? "The preview recorded no property-level diff for this resource."
          : `Changed: ${resource.diffReasons.join(", ")}`,
      ),
    );
  } else if (changes.length === 0) {
    body.append(el("p", "opd-empty", "No properties differ."));
  } else {
    body.append(changesTable(changes));
  }

  node.append(body);
  return { resource, node };
}

/** The note explaining a summary that counts more than the list shows. */
export function unchangedNote(data: PulumiDiffData): HTMLElement | undefined {
  const omitted = omittedUnchanged(data);
  if (omitted === 0) return undefined;

  return el(
    "p",
    "opd-meta",
    `${omitted} unchanged ${omitted === 1 ? "resource is" : "resources are"} counted above but not listed. Generate with --same to include them.`,
  );
}

/** The message shown instead of a rendering when the data is not this schema. */
export function unreadable(): HTMLElement {
  return el("p", "opd-empty", "This report is not in a shape the pulumi-diff viewer understands.");
}

/** The banner for a report produced by a newer reporter than this plugin. */
export function versionNotice(): HTMLElement {
  return el(
    "p",
    "opd-notice",
    "This report was produced by a newer reporter than this viewer plugin. It is shown as far as this version understands it.",
  );
}
