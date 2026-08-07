import type { Command } from "./types.js";

/**
 * Renders the top-level help text, or usage for a single command when given
 * a command name.
 *
 * `commands` is passed in rather than imported to avoid a cycle with the
 * registry, which needs to list `help` itself.
 */
export function createHelpCommand(commands: () => readonly Command[]): Command {
  return {
    name: "help",
    summary: "Show usage for orion or a specific command",
    usage: "orion help [command]",

    async run(argv) {
      const all = commands();
      const topic = argv[0];

      if (topic !== undefined) {
        const command = all.find((c) => c.name === topic);
        if (command === undefined) {
          process.stderr.write(`orion: unknown command '${topic}'\n`);
          return 1;
        }
        const detail = command.details === undefined ? "" : `\n${command.details}\n`;
        process.stdout.write(`${command.summary}\n\nUsage: ${command.usage}\n${detail}`);
        return 0;
      }

      const width = Math.max(...all.map((c) => c.name.length));
      const lines = all.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`);

      process.stdout.write(
        [
          "orion - generate and publish reports for CI/CD pipelines",
          "",
          "Usage: orion <command> [options]",
          "",
          "Commands:",
          ...lines,
          "",
          "Run 'orion help <command>' for more detail.",
          "",
        ].join("\n"),
      );
      return 0;
    },
  };
}
