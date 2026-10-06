/**
 * A failure the client should see as-is: `{ error: '<code>', message }` with `status`.
 * Thrown anywhere in a request; the error handler (plugins/error-handler.ts) turns it into
 * the response. Anything else becomes the route's own 500 code — never a stack trace.
 */
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** The body of every error response. */
export interface ErrorBody { error: string; message: string }
