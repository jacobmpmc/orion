export interface Command {
  /** Name used to invoke the command, e.g. `orion help`. */
  readonly name: string;
  /** One-line description shown in the command list. */
  readonly summary: string;
  /** Usage line shown in the command list, e.g. `orion help [command]`. */
  readonly usage: string;
  /** Extra prose shown by `orion help <command>`. */
  readonly details?: string;
  /** Runs the command. Resolves with the process exit code. */
  run(argv: readonly string[]): Promise<number>;
}
