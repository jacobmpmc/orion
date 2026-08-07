#!/usr/bin/env node
import { findCommand } from "./commands/index.js";

async function main(argv: readonly string[]): Promise<number> {
  const [name = "help", ...rest] = argv;

  // Treat the conventional flags as aliases for the help command so that
  // `orion --help` and `orion help` agree.
  const normalised = name === "--help" || name === "-h" ? "help" : name;

  const command = findCommand(normalised);
  if (command === undefined) {
    process.stderr.write(
      `orion: unknown command '${name}'\nRun 'orion help' to see available commands.\n`,
    );
    return 1;
  }

  return command.run(rest);
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(
      `orion: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  },
);
