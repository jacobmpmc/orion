import { generateCommand } from "./generate.js";
import { createHelpCommand } from "./help.js";
import { storeCommand } from "./store.js";
import type { Command } from "./types.js";

/**
 * The registry of available commands. Report generation, storage and plugin
 * commands get appended here as they land.
 */
export const commands: readonly Command[] = [
  generateCommand,
  storeCommand,
  createHelpCommand(() => commands),
];

export function findCommand(name: string): Command | undefined {
  return commands.find((command) => command.name === name);
}

export type { Command };
