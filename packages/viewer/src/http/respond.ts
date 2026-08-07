import type { ServerResponse } from "node:http";
import { errorBody, HttpError } from "./errors.js";

export function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  const text = `${JSON.stringify(body)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    ...headers,
  });
  response.end(text);
}

/** Reports and the manifest are never cached: both change under a stable URL. */
export const NO_STORE = { "cache-control": "no-store" } as const;

export function sendError(response: ServerResponse, error: HttpError): void {
  const headers: Record<string, string> = error.status === 405 ? { allow: "GET" } : {};
  json(response, error.status, errorBody(error), headers);
}
