/**
 * The host's stand-in for a report it could not draw.
 *
 * Drawn by the host rather than by the plugin that asked for the nested render,
 * so every unrenderable child looks the same wherever it appears, and a plugin
 * author never has to write this fallback.
 *
 * Styled inline rather than through a stylesheet: this lands inside a subtree a
 * plugin owns, and a plugin is free to scope, reset or override anything in its
 * own root. Theme tokens are read with literal fallbacks for the same reason.
 */
export function placeholder(message: string): HTMLElement {
  const node = document.createElement("div");
  node.className = "orion-placeholder";
  node.setAttribute("role", "note");
  node.style.cssText = [
    "margin: 0",
    "padding: 0.75rem 1rem",
    "border: 1px dashed var(--line, #d0d7de)",
    "border-radius: 6px",
    "color: var(--muted, #656d76)",
    "font: inherit",
    "font-size: 0.875rem",
    "line-height: 1.5",
    "background: transparent",
  ].join(";");
  // textContent, never innerHTML: the message carries plugin names and storage
  // errors, neither of which the host gets to assume anything about.
  node.textContent = message;
  return node;
}
