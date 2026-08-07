import { parseArgs } from "node:util";
import type { StorageConnectionConfig, ViewerConfig, ViewerConfigInput } from "./config/types.js";
import { ViewerError } from "./errors.js";
import { startServer } from "./server.js";
import type { ViewerServer } from "./server.js";

const USAGE = `orion-viewer - serve Orion reports

Usage: orion-viewer [options]

Options:
      --config <path>          Configuration module to load
      --no-config              Ignore any configuration file
      --host <name>            Interface to bind [default: 127.0.0.1]
      --port <number>          Port to bind, 0 for an ephemeral one [default: 7317]
      --base-path <path>       Mount prefix when behind a reverse proxy [default: /]
      --tls-cert <path>        Certificate to serve HTTPS with
      --tls-key <path>         Private key for --tls-cert
      --connection <name=pkg>  Register a storage connection. Repeatable
      --viewer <package>       Register a viewer plugin. Repeatable
      --client-dir <path>      Where the built client lives
  -h, --help                   Show this help

Connections and viewers given as flags take no plugin options; use a
configuration file for anything that needs them.

Looks for orion-viewer.config.ts, .js or .mjs in the working directory.
`;

function toPort(text: string): number {
  const port = Number(text);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ViewerError(`--port must be an integer between 0 and 65535, but got '${text}'.`);
  }
  return port;
}

/** `--connection prod=@orion/plugin-storage-s3` */
function toConnection(text: string): StorageConnectionConfig {
  const separator = text.indexOf("=");
  if (separator <= 0 || separator === text.length - 1) {
    throw new ViewerError(
      `--connection must be written as <name>=<package>, but got '${text}'.`,
    );
  }
  return { name: text.slice(0, separator), package: text.slice(separator + 1) };
}

export interface ParsedArgs {
  readonly input: ViewerConfigInput;
  readonly help: boolean;
}

export function parseCliArgs(argv: readonly string[]): ParsedArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        config: { type: "string" },
        "no-config": { type: "boolean" },
        host: { type: "string" },
        port: { type: "string" },
        "base-path": { type: "string" },
        "tls-cert": { type: "string" },
        "tls-key": { type: "string" },
        connection: { type: "string", multiple: true },
        viewer: { type: "string", multiple: true },
        "client-dir": { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (error) {
    throw new ViewerError(error instanceof Error ? error.message : String(error));
  }

  const values = parsed.values;
  if (values.help === true) return { input: {}, help: true };

  const cert = values["tls-cert"];
  const key = values["tls-key"];
  if ((cert === undefined) !== (key === undefined)) {
    throw new ViewerError("--tls-cert and --tls-key must be given together.");
  }

  const config: ViewerConfig = {
    ...(values.host !== undefined ? { host: values.host } : {}),
    ...(values.port !== undefined ? { port: toPort(values.port) } : {}),
    ...(values["base-path"] !== undefined ? { basePath: values["base-path"] } : {}),
    ...(cert !== undefined && key !== undefined ? { tls: { cert, key } } : {}),
    ...(values.connection !== undefined
      ? { connections: values.connection.map(toConnection) }
      : {}),
    ...(values.viewer !== undefined
      ? { viewers: values.viewer.map((pkg) => ({ package: pkg })) }
      : {}),
    ...(values["client-dir"] !== undefined ? { clientDir: values["client-dir"] } : {}),
  };

  if (values["no-config"] === true && values.config !== undefined) {
    throw new ViewerError("--config and --no-config cannot both be given.");
  }

  return {
    input: {
      ...config,
      ...(values["no-config"] === true ? { config: false as const } : {}),
      ...(values.config !== undefined ? { config: values.config } : {}),
    },
    help: false,
  };
}

/** Closes the server on the signals a supervisor sends, so `docker stop` is clean. */
function installShutdown(viewer: ViewerServer): void {
  const shutdown = (): void => {
    void viewer.close().then(
      () => {
        process.exitCode = 0;
      },
      () => {
        process.exitCode = 1;
      },
    );
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

export async function run(argv: readonly string[]): Promise<number> {
  try {
    const { input, help } = parseCliArgs(argv);

    if (help) {
      process.stdout.write(USAGE);
      return 0;
    }

    const viewer = await startServer(input);
    installShutdown(viewer);

    process.stdout.write(`Orion viewer listening on ${viewer.url}\n`);
    if (viewer.config.source !== undefined) {
      process.stdout.write(`Configuration: ${viewer.config.source}\n`);
    }
    for (const connection of viewer.registry.connections.values()) {
      process.stdout.write(`  ${connection.name} -> ${connection.plugin.name}\n`);
    }
    if (viewer.registry.connections.size === 0) {
      process.stdout.write("  no storage connections configured\n");
    }

    return 0;
  } catch (error) {
    if (error instanceof ViewerError) {
      process.stderr.write(`orion-viewer: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
