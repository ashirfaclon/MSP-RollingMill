import { checkSources } from '@/server/status';
import { handle } from '@/server/http';

/**
 * Connection status of every source — each one actually exercised.
 * `?refresh=1` bypasses the 15 s memo.
 */
export function GET(req: Request) {
  const force = new URL(req.url).searchParams.get('refresh') === '1';
  return handle('sources_check_failed', () => checkSources(undefined, force));
}
