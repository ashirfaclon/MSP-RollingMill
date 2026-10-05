/** Liveness: the app process is up. Says nothing about the plant systems — see /api/sources. */
export function GET() {
  return Response.json({ ok: true, time: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
