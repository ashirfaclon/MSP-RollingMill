import { loadEnv } from '@/server/env';
import { handle } from '@/server/http';
import { hsmLive } from '@/server/hsm/live';

/** Live HSM state: billets since the plant day began, and each stand's latest drive readings. */
export function GET() {
  return handle('hsm_live_failed', () => hsmLive(loadEnv()));
}
