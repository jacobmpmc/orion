/**
 * A failure the person running the viewer can act on: a bad config file, a
 * plugin that will not load, an option a plugin rejected.
 *
 * Its message is printed as-is by the `orion-viewer` binary, so write it for
 * that reader -- name the setting and say what to do about it. Anything else
 * propagates as a crash, which is the right outcome for a genuine bug.
 */
export class ViewerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ViewerError";
  }
}
