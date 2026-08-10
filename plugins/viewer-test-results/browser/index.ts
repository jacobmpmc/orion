import type { ViewerMount } from "@orion/core";
import { matches, matchesFile, readReport, rows, type Row } from "./model.js";
import {
  controls,
  failureCard,
  fileGroup,
  summaryBar,
  unreadable,
  versionNotice,
  type FileGroup,
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

interface Entry {
  readonly row: Row;
  readonly node: HTMLElement;
}

export const mount: ViewerMount<HTMLElement> = (element, { report }) => {
  const root = document.createElement("div");
  root.className = "otr";

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

  const bar = controls();
  root.append(bar.node);

  const failures: Entry[] = [];
  const allRows = rows(data);
  const failing = allRows.filter((row) => row.testCase.status === "failed");

  if (failing.length > 0) {
    const section = document.createElement("section");
    const failuresHeading = document.createElement("h2");
    failuresHeading.textContent = "Failures";
    section.append(failuresHeading);
    for (const row of failing) {
      const node = failureCard(row);
      section.append(node);
      failures.push({ row, node });
    }
    root.append(section);
  }

  const files = document.createElement("section");
  const heading = document.createElement("h2");
  heading.textContent = "Files";
  files.append(heading);

  const groups: FileGroup[] = data.files.map((file) => {
    const group = fileGroup(
      file,
      allRows.filter((row) => row.file === file),
    );
    files.append(group.node);
    return group;
  });
  root.append(files);

  const empty = document.createElement("p");
  empty.className = "otr-empty";
  empty.textContent = "Nothing matches that filter.";
  empty.hidden = true;
  root.append(empty);

  const apply = (): void => {
    const query = bar.search.value;
    const failedOnly = bar.failedOnly.checked;
    let visible = 0;

    for (const entry of failures) {
      entry.node.hidden = !matches(entry.row, query, failedOnly);
    }

    for (const group of groups) {
      let shown = 0;
      for (const entry of group.entries) {
        const keep = matches(entry.row, query, failedOnly);
        entry.node.hidden = !keep;
        if (keep) shown += 1;
      }

      if (group.entries.length === 0) {
        // A file that failed to load has no tests to match on; it stands or
        // falls by its own path.
        const keep = matchesFile(group.file, query, failedOnly);
        group.node.hidden = !keep;
        group.count.textContent = "no tests";
        if (keep) visible += 1;
        continue;
      }

      // A file with nothing left to show goes too, so the list does not become
      // a column of empty headings.
      group.node.hidden = shown === 0;
      group.count.textContent =
        shown === group.entries.length ? `${shown}` : `${shown} of ${group.entries.length}`;
      visible += shown;
    }

    empty.hidden = visible > 0;
  };

  bar.search.addEventListener("input", apply);
  bar.failedOnly.addEventListener("change", apply);
  apply();

  element.append(root);

  // Removing the root takes the listeners and the <style> with it; there is
  // nothing registered anywhere else to clean up.
  return () => root.remove();
};
