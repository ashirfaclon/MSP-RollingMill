import { loadEnv } from '@/server/env';

/** Poll interval, fetched once per page so every screen refreshes at the same rate. */
export function GET() {
  return Response.json({ poll_interval_seconds: loadEnv().pollIntervalSeconds });
}
