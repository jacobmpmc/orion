import type { ViewerMount, ViewerUnmount } from "@orion/core";
import { entryKind, entryTarget, readReport } from "./model.js";
import { empty, section, summaryLine, title, unreadable, versionNotice } from "./render.js";
import { CSS } from "./styles.js";

/**
 * The browser half: the one export the viewer requires.
 *
 * This plugin renders almost nothing itself. It draws a header per part and
 * hands the element under it back to the host through `context.render`, which
 * dispatches to whichever plugin claims that part's kind -- including kinds
 * that did not exist when this was written, and including another composite.
 *
 * Everything below `.ocp-body` therefore belongs to someone else: this plugin
 * does not read it, restyle it, or clear it. The only thing it keeps is each
 * child's unmount, because a child that is not torn down leaves listeners
 * behind when the reader navigates away.
 */

export const mount: ViewerMount<HTMLElement> = async (element, { report, render, canRender }) => {
  const root = document.createElement("div");
  root.className = "ocp";

  const style = document.createElement("style");
  style.textContent = CSS;
  root.append(style);

  // In the document before any child mounts, not after: a nested plugin that
  // measures anything -- a column width, a scroll height -- gets zeroes out of
  // a detached subtree.
  element.append(root);

  const loaded = readReport(report);
  if (loaded === undefined) {
    root.append(unreadable());
    return () => root.remove();
  }

  const { data, newerVersion } = loaded;
  if (newerVersion) root.append(versionNotice());
  if (data.title !== undefined) root.append(title(data.title));
  root.append(summaryLine(data.entries.length));

  if (data.entries.length === 0) {
    root.append(empty());
    return () => root.remove();
  }

  const pending: Promise<ViewerUnmount>[] = [];

  for (const entry of data.entries) {
    const target = entryTarget(entry);
    if (target === undefined) continue;

    const kind = entryKind(entry);
    // A ref's kind is unknown until the host fetches it, so it starts open and
    // may still turn out to be unrenderable. A known-unrenderable part starts
    // collapsed: the reader sees the whole list without a screenful of
    // placeholders, and can still open one to read why.
    const part = section(entry, kind === undefined || canRender(kind));
    root.append(part.node);
    pending.push(render(part.body, target));
  }

  // The section nodes already exist, so the children mount into a settled tree
  // and their order on the page does not depend on which resolves first.
  // Mounted eagerly rather than on first open: a closed <details> still holds a
  // live subtree, and deferring would buy a little work back in exchange for
  // per-section state to get wrong.
  const unmounts = await Promise.all(pending);

  return () => {
    for (const unmount of unmounts) {
      try {
        unmount();
      } catch {
        // A child that fails to clean up must not strand its siblings, or the
        // root, in the page.
      }
    }
    root.remove();
  };
};
