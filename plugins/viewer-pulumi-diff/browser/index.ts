import type { ViewerMount } from "@orion/core";
import { expansionFor, matches, readReport } from "./model.js";
import {
  controls,
  diagnosticsList,
  resourceGroup,
  summaryBar,
  unchangedNote,
  unreadable,
  versionNotice,
  type ResourceGroup,
} from "./render.js";
import { CSS } from "./styles.js";

/**
 * The browser half: the one export the viewer requires.
 *
 * The tree is built once and the filter only toggles `hidden` on nodes that are
 * already there. Re-rendering per keystroke would be simpler to write and worse
 * to use -- it would collapse every `<details>` the reader had opened and drop
 * the caret out of the search box on every character.
 */
export const mount: ViewerMount<HTMLElement> = (element, { report }) => {
  const root = document.createElement("div");
  root.className = "opd";

  const style = document.createElement("style");
  style.textContent = CSS;
  root.append(style);

  const loaded = readReport(report);
  if (loaded === undefined) {
    root.append(unreadable());
    element.append(root);
    return () => root.remove();
  }

  const { data, newerVersion } = loaded;
  if (newerVersion) root.append(versionNotice());

  root.append(summaryBar(data));

  if (data.diagnostics.length > 0) {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    heading.textContent = "Diagnostics";
    section.append(heading, diagnosticsList(data.diagnostics));
    root.append(section);
  }

  const hasUnchanged = data.resources.some((resource) => resource.op === "same");
  const bar = controls(hasUnchanged, data.resources.length > 0);
  root.append(bar.node);

  const resources = document.createElement("section");
  const heading = document.createElement("h2");
  heading.textContent = "Resources";
  resources.append(heading);

  const groups: ResourceGroup[] = data.resources.map((resource) => {
    const group = resourceGroup(resource);
    resources.append(group.node);
    return group;
  });
  root.append(resources);

  // A preview with nothing to do is a normal, and reassuring, result.
  if (groups.length === 0) {
    const nothing = document.createElement("p");
    nothing.className = "opd-empty";
    nothing.textContent = "This preview would change nothing.";
    resources.append(nothing);
  }

  const note = unchangedNote(data);
  if (note !== undefined) root.append(note);

  const empty = document.createElement("p");
  empty.className = "opd-empty";
  empty.textContent = "Nothing matches that filter.";
  empty.hidden = true;
  root.append(empty);

  /** The groups the filter is currently showing -- what the button acts on. */
  const shown = (): ResourceGroup[] => groups.filter((group) => !group.node.hidden);

  const relabel = (): void => {
    bar.expandAll.textContent = expansionFor(shown().map((group) => group.node.open)).label;
  };

  const apply = (): void => {
    const query = bar.search.value;
    const changedOnly = hasUnchanged && bar.changedOnly.checked;
    let visible = 0;

    for (const group of groups) {
      const keep = matches(group.resource, query, changedOnly);
      group.node.hidden = !keep;
      if (keep) visible += 1;
    }

    empty.hidden = visible > 0 || groups.length === 0;
    // The filter changes what "all" means, so the button has to say so.
    relabel();
  };

  bar.search.addEventListener("input", apply);
  bar.changedOnly.addEventListener("change", apply);

  bar.expandAll.addEventListener("click", () => {
    const visible = shown();
    const { expand } = expansionFor(visible.map((group) => group.node.open));
    for (const group of visible) group.node.open = expand;
    relabel();
  });

  // Opening or closing one resource by hand can leave the button offering the
  // wrong half of the toggle, so it follows along.
  for (const group of groups) group.node.addEventListener("toggle", relabel);

  apply();

  element.append(root);

  // Removing the root takes the listeners and the <style> with it; there is
  // nothing registered anywhere else to clean up.
  return () => root.remove();
};
