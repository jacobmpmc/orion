import type { ServerResponse } from "node:http";
import { isReport } from "@orion/core";
import type { Registry } from "../../registry.js";
import { badRequest, HttpError, notFound } from "../errors.js";
import { json, NO_STORE } from "../respond.js";

/**
 * Splits `<connection>/<id...>` out of the path after `/api/reports/`.
 *
 * The id is everything left, not just the next segment: the filesystem backend
 * hands out root-relative paths, so slashes inside an id are normal.
 */
export function parseReportPath(rest: readonly string[]): { connection: string; id: string } {
  const [connection, ...idSegments] = rest;

  if (connection === undefined || connection === "") {
    throw badRequest("missing_connection", "The URL does not name a storage connection.");
  }

  let decoded: string[];
  try {
    decoded = idSegments.map((segment) => decodeURIComponent(segment));
  } catch {
    throw badRequest("invalid_id", "The report id is not correctly percent-encoded.");
  }

  const id = decoded.join("/");
  if (id === "") {
    throw badRequest("missing_id", "The URL does not name a report.");
  }
  if (id.includes("\0")) {
    throw badRequest("invalid_id", "The report id contains an illegal character.");
  }

  let connectionName: string;
  try {
    connectionName = decodeURIComponent(connection);
  } catch {
    throw badRequest("invalid_connection", "The connection name is not correctly percent-encoded.");
  }

  return { connection: connectionName, id };
}

export async function handleReport(
  response: ServerResponse,
  registry: Registry,
  rest: readonly string[],
  log: (message: string) => void,
): Promise<void> {
  const { connection: name, id } = parseReportPath(rest);

  const connection = registry.connections.get(name);
  if (connection === undefined) {
    throw notFound("unknown_connection", `No storage connection named '${name}'.`);
  }

  let report: unknown;
  try {
    report = await connection.plugin.fetch({ id, options: connection.options });
  } catch (error) {
    // The backend's own message can carry a bucket name or a credentialed URL,
    // so it is logged rather than returned.
    log(
      `storage '${name}' failed to fetch '${id}': ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw new HttpError(
      502,
      "storage_error",
      `The '${name}' storage backend could not be reached.`,
    );
  }

  if (report === undefined) {
    throw notFound("report_not_found", `No report '${id}' in connection '${name}'.`);
  }
  if (!isReport(report)) {
    throw new HttpError(
      500,
      "invalid_report",
      `The '${name}' storage backend returned something that is not a report.`,
    );
  }

  json(response, 200, report, NO_STORE);
}
