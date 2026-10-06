/**
 * One error shape for the whole API: `{ error: '<code>', message }`.
 *
 *   HttpError            → its own status and code (bad input, unknown measurement …)
 *   framework 4xx        → 400 bad_request / 429 rate_limited, message kept generic
 *   anything else        → 500 with the route's `config.errorCode` (e.g. hsm_production_failed),
 *                          logged with the request id — the client never sees a stack trace.
 */
import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { HttpError, type ErrorBody } from '../shared/http-error';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Code returned when this route fails unexpectedly. */
    errorCode?: string;
  }
}

export default fp(async function errorHandler(app: FastifyInstance) {
  app.setErrorHandler<FastifyError>((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.code, message: err.message } satisfies ErrorBody);
    }
    const status = err.statusCode ?? 500;
    if (status === 429) {
      return reply.status(429).send({ error: 'rate_limited', message: 'Too many requests — try again shortly' } satisfies ErrorBody);
    }
    if (status >= 400 && status < 500) {
      return reply.status(status).send({ error: 'bad_request', message: 'The request is malformed' } satisfies ErrorBody);
    }
    req.log.error({ err }, 'request failed');
    const code = req.routeOptions.config.errorCode ?? 'internal_error';
    return reply.status(500).send({ error: code, message: 'The request could not be completed' } satisfies ErrorBody);
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({ error: 'not_found', message: 'No such endpoint' } satisfies ErrorBody);
  });
});
