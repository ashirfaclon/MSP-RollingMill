/**
 * Route-handler plumbing: every handler runs inside `handle`, so a failure becomes
 * `{ error: '<code>', message }` with a status — a named error code, never a stack trace.
 */
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function handle(code: string, fn: () => Promise<unknown>): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof HttpError) return Response.json({ error: err.code, message: err.message }, { status: err.status });
    return Response.json({ error: code, message: 'The request could not be completed' }, { status: 500 });
  }
}
