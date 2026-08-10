import type { TestFile, TestResultsData } from "@orion/report-test-results";
import { formatDuration, formatTime, summarize, toneFor, type Row, type Tone } from "./model.js";

/**
 * Element builders.
 *
 * Every value out of the report reaches the DOM as `textContent` or through
 * `append(string)`, and **`innerHTML` is never used here**. Failure messages
 * are stack traces containing arbitrary source from whoever's tests these are;
 * treating them as markup would be a script-injection hole in a page that
 * renders reports from CI. Keep it that way.
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
  return `otr-tone-${tone}`;
}

/** The counts bar, plus which runner produced the run and when. */
export function summaryBar(data: TestResultsData): HTMLElement {
  const wrapper = el("div");
  const bar = el("div", "otr-bar");

  for (const chip of summarize(data)) {
    const node = el("span", "otr-chip");
    node.append(el("b", toneClass(chip.tone), String(chip.count)), el("span", "otr-muted", chip.label));
    bar.append(node);
  }

  wrapper.append(bar);

  const meta = [
    data.tool,
    formatTime(data.startedAt),
    ...(data.durationMs === undefined ? [] : [formatDuration(data.durationMs)]),
    data.success ? "run passed" : "run failed",
  ].join(" · ");
  wrapper.append(el("p", "otr-meta", meta));

  return wrapper;
}

export interface Controls {
  readonly node: HTMLElement;
  readonly search: HTMLInputElement;
  readonly failedOnly: HTMLInputElement;
}

/** The filter row. Wiring the events is the caller's job. */
export function controls(): Controls {
  const node = el("div", "otr-controls");

  const search = el("input");
  search.type = "search";
  search.placeholder = "Filter by test name or file…";
  search.setAttribute("aria-label", "Filter tests");

  const failedOnly = el("input");
  failedOnly.type = "checkbox";

  const toggle = el("label", "otr-toggle");
  toggle.append(failedOnly, "Failed only");

  node.append(search, toggle);
  return { node, search, failedOnly };
}

/** One failure, with every message the runner recorded. */
export function failureCard(row: Row): HTMLElement {
  const card = el("article", "otr-failure");
  card.append(el("h3", undefined, row.testCase.fullName));

  const where =
    row.testCase.location === undefined
      ? row.file.path
      : `${row.file.path}:${row.testCase.location.line}:${row.testCase.location.column}`;
  card.append(el("p", "otr-meta", where));

  for (const message of row.testCase.failures ?? []) {
    card.append(el("pre", undefined, message));
  }

  return card;
}

/** One case in a file's list. */
export function caseRow(row: Row): HTMLElement {
  const node = el("li", "otr-case");
  const tone = toneClass(toneFor(row.testCase.status));

  const dot = el("span", `otr-dot ${tone}`);
  dot.setAttribute("role", "img");
  dot.setAttribute("aria-label", row.testCase.status);

  const name = el("span", "otr-name");
  if (row.testCase.suite.length > 0) {
    name.append(el("span", "otr-suite", `${row.testCase.suite.join(" › ")} › `));
  }
  name.append(row.testCase.name);

  node.append(dot, name, el("span", "otr-duration", formatDuration(row.testCase.durationMs)));
  return node;
}

export interface FileGroup {
  readonly file: TestFile;
  readonly node: HTMLDetailsElement;
  /** The "n of m" counter, updated as the filter changes. */
  readonly count: HTMLElement;
  readonly entries: readonly { readonly row: Row; readonly node: HTMLElement }[];
}

/** One file: a collapsible summary line over its cases. */
export function fileGroup(file: TestFile, fileRows: readonly Row[]): FileGroup {
  const node = el("details", "otr-file");
  // A failing file opens itself: it is what the reader came for.
  node.open = file.status === "failed";

  const summary = el("summary");
  const dot = el("span", `otr-dot ${toneClass(file.status === "failed" ? "danger" : "ok")}`);
  dot.setAttribute("role", "img");
  dot.setAttribute("aria-label", file.status);

  const count = el("span", "otr-duration");
  summary.append(
    dot,
    el("span", "otr-path", file.path),
    count,
    el("span", "otr-duration", formatDuration(file.durationMs)),
  );
  node.append(summary);

  if (file.message !== undefined) {
    node.append(el("pre", undefined, file.message));
  }

  const list = el("ol", "otr-cases");
  const entries = fileRows.map((row) => {
    const caseNode = caseRow(row);
    list.append(caseNode);
    return { row, node: caseNode };
  });
  node.append(list);

  return { file, node, count, entries };
}

/** The message shown instead of a rendering when the data is not this schema. */
export function unreadable(): HTMLElement {
  return el(
    "p",
    "otr-empty",
    "This report is not in a shape the test-results viewer understands.",
  );
}

/** The banner for a report produced by a newer reporter than this plugin. */
export function versionNotice(): HTMLElement {
  return el(
    "p",
    "otr-notice",
    "This report was produced by a newer reporter than this viewer plugin. It is shown as far as this version understands it.",
  );
}
