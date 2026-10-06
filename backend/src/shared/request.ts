import type { FastifyRequest } from 'fastify';

/** The raw query string as URLSearchParams — the shape every parser in params.ts takes. */
export const searchParams = (req: FastifyRequest): URLSearchParams => new URL(req.url, 'http://localhost').searchParams;
