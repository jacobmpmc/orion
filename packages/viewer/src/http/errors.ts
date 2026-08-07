/**
 * A failure that belongs in a response rather than on the console.
 *
 * Deliberately not a `ViewerError`: that one means the viewer is misconfigured
 * and should not be running, while this one is a normal answer to one request.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

/** The body shape every failing response uses. */
export interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export function errorBody(error: HttpError): ErrorBody {
  return { error: { code: error.code, message: error.message } };
}

export const badRequest = (code: string, message: string): HttpError =>
  new HttpError(400, code, message);
export const notFound = (code: string, message: string): HttpError =>
  new HttpError(404, code, message);
