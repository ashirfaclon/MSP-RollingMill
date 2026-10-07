/**
 * Where the API is. '' = same origin (`next dev` proxies /api to BACKEND_URL); otherwise the
 * backend's URL from NEXT_PUBLIC_API_BASE_URL, inlined at build time — no trailing slash.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '');
