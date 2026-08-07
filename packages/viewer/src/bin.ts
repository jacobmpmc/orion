#!/usr/bin/env node
import { run } from "./cli.js";

run(process.argv.slice(2)).then(
  (code) => {
    // Set rather than exited, so a listening server keeps the process alive and
    // a failure still drains stderr before Node winds down.
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`orion-viewer: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
