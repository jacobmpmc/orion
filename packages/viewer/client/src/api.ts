import type { Report } from "@orion/core";

export interface ManifestConnection {
  readonly name: string;
  readonly label: string;
}

export interface ManifestViewer {
  readonly id: string;
  readonly name: string;
  readonly reports: readonly string[];
  readonly bundle: string;
}

export interface Manifest {
  readonly basePath: string;
  readonly connections: readonly ManifestConnection[];
  readonly viewers: readonly ManifestViewer[];
}

/** The server injects this when it is mounted somewhere other than the root. */
export const base = window.__ORION_BASE__ ?? "/";

/** A failure the server described, as opposed to the network giving up. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${base}${path}`, { headers: { accept: "application/json" } });

  if (!response.ok) {
    let code = "unknown";
    let message = `Request failed with status ${response.status}.`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // A non-JSON body means something other than the app answered; the
      // status line is all there is to go on.
    }
    throw new ApiError(response.status, code, message);
  }

  return (await response.json()) as T;
}

export function getManifest(): Promise<Manifest> {
  return get<Manifest>("api/manifest");
}

/** Ids routinely contain slashes, so each segment is encoded separately. */
export function reportPath(connection: string, id: string): string {
  const encodedId = id
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `api/reports/${encodeURIComponent(connection)}/${encodedId}`;
}

export function getReport(connection: string, id: string): Promise<Report> {
  return get<Report>(reportPath(connection, id));
}
