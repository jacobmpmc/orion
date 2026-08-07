// Stands in for a viewer plugin's built browser bundle. The server only reads
// this file's bytes, so it never has to be valid in a browser.
export function mount(element, { report }) {
  element.textContent = report.kind;
  return () => {
    element.textContent = "";
  };
}
