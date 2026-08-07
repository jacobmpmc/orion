import type { OptionValue } from "@orion/core";
import { ViewerError } from "../errors.js";
import type {
  PluginOptionValues,
  StorageConnectionConfig,
  TlsConfig,
  ViewerConfig,
  ViewerPluginConfig,
} from "./types.js";

/** A connection name has to survive being a single URL path segment. */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionValue(value: unknown): value is OptionValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (!Array.isArray(value)) return false;
  return value.every((item) => typeof item === "string" || typeof item === "number");
}

/**
 * Collects problems rather than throwing at the first one, so a hand-edited
 * config file can be fixed in one pass instead of one restart per typo.
 */
class Problems {
  readonly messages: string[] = [];

  add(message: string): void {
    this.messages.push(message);
  }
}

function readOptions(raw: unknown, where: string, problems: Problems): PluginOptionValues {
  if (raw === undefined) return {};
  if (!isRecord(raw)) {
    problems.add(`${where}.options must be an object of option values.`);
    return {};
  }

  const values: Record<string, OptionValue> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!isOptionValue(value)) {
      problems.add(
        `${where}.options.${name} must be a string, number, boolean or array of those.`,
      );
      continue;
    }
    values[name] = value;
  }
  return values;
}

function readConnections(
  raw: unknown,
  problems: Problems,
): readonly StorageConnectionConfig[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    problems.add("connections must be an array.");
    return undefined;
  }

  const connections: StorageConnectionConfig[] = [];
  const seen = new Map<string, number>();

  raw.forEach((entry: unknown, index) => {
    const where = `connections[${index}]`;
    if (!isRecord(entry)) {
      problems.add(`${where} must be an object.`);
      return;
    }

    const name = entry["name"];
    const pkg = entry["package"];
    const label = entry["label"];

    if (typeof name !== "string" || name === "") {
      problems.add(`${where}.name is missing.`);
    } else if (!NAME_PATTERN.test(name)) {
      problems.add(
        `${where}.name '${name}' must start with a letter or digit and may only contain letters, digits, '.', '_' and '-'.`,
      );
    } else {
      const first = seen.get(name);
      if (first !== undefined) {
        problems.add(`${where}.name '${name}' is already used by connections[${first}].`);
      } else {
        seen.set(name, index);
      }
    }

    if (typeof pkg !== "string" || pkg === "") {
      problems.add(`${where}.package is missing: name the storage plugin to load.`);
    }
    if (label !== undefined && typeof label !== "string") {
      problems.add(`${where}.label must be a string.`);
    }

    const options = readOptions(entry["options"], where, problems);
    if (typeof name === "string" && typeof pkg === "string") {
      connections.push({
        name,
        package: pkg,
        ...(typeof label === "string" ? { label } : {}),
        options,
      });
    }
  });

  return connections;
}

function readViewers(raw: unknown, problems: Problems): readonly ViewerPluginConfig[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    problems.add("viewers must be an array.");
    return undefined;
  }

  const viewers: ViewerPluginConfig[] = [];
  raw.forEach((entry: unknown, index) => {
    const where = `viewers[${index}]`;
    if (!isRecord(entry)) {
      problems.add(`${where} must be an object.`);
      return;
    }
    const pkg = entry["package"];
    if (typeof pkg !== "string" || pkg === "") {
      problems.add(`${where}.package is missing: name the viewer plugin to load.`);
      return;
    }
    viewers.push({ package: pkg, options: readOptions(entry["options"], where, problems) });
  });

  return viewers;
}

function readTls(raw: unknown, problems: Problems): TlsConfig | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    problems.add("tls must be an object with cert and key paths.");
    return undefined;
  }

  const cert = raw["cert"];
  const key = raw["key"];
  const ca = raw["ca"];
  const passphrase = raw["passphrase"];

  if (typeof cert !== "string" || cert === "") {
    problems.add("tls.cert is required when tls is given.");
  }
  if (typeof key !== "string" || key === "") {
    problems.add("tls.key is required when tls is given.");
  }
  if (ca !== undefined && typeof ca !== "string") problems.add("tls.ca must be a path.");
  if (passphrase !== undefined && typeof passphrase !== "string") {
    problems.add("tls.passphrase must be a string.");
  }

  if (typeof cert !== "string" || typeof key !== "string") return undefined;
  return {
    cert,
    key,
    ...(typeof ca === "string" ? { ca } : {}),
    ...(typeof passphrase === "string" ? { passphrase } : {}),
  };
}

function readString(raw: unknown, field: string, problems: Problems): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || raw === "") {
    problems.add(`${field} must be a non-empty string.`);
    return undefined;
  }
  return raw;
}

/**
 * Checks an arbitrary value into a `ViewerConfig`.
 *
 * A config module is imported and executed, so what it hands back is untrusted
 * input in the same way a plugin package is -- it is checked before anything
 * downstream is allowed to assume its shape.
 */
export function validateConfig(raw: unknown, source: string): ViewerConfig {
  const problems = new Problems();

  if (!isRecord(raw)) {
    throw new ViewerError(
      `Invalid configuration in ${source}:\n  the module must export a configuration object.`,
    );
  }

  const host = readString(raw["host"], "host", problems);
  const clientDir = readString(raw["clientDir"], "clientDir", problems);

  let port: number | undefined;
  if (raw["port"] !== undefined) {
    const value = raw["port"];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 65535) {
      problems.add(`port must be an integer between 0 and 65535, but got ${JSON.stringify(value)}.`);
    } else {
      port = value;
    }
  }

  let basePath: string | undefined;
  if (raw["basePath"] !== undefined) {
    const value = raw["basePath"];
    if (typeof value !== "string" || !value.startsWith("/")) {
      problems.add(`basePath must be a path starting with '/', but got ${JSON.stringify(value)}.`);
    } else {
      basePath = value;
    }
  }

  const tls = readTls(raw["tls"], problems);
  const connections = readConnections(raw["connections"], problems);
  const viewers = readViewers(raw["viewers"], problems);

  if (problems.messages.length > 0) {
    throw new ViewerError(
      [`Invalid configuration in ${source}:`, ...problems.messages.map((m) => `  ${m}`)].join("\n"),
    );
  }

  return {
    ...(host !== undefined ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(basePath !== undefined ? { basePath } : {}),
    ...(tls !== undefined ? { tls } : {}),
    ...(connections !== undefined ? { connections } : {}),
    ...(viewers !== undefined ? { viewers } : {}),
    ...(clientDir !== undefined ? { clientDir } : {}),
  };
}
