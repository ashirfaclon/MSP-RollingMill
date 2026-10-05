import { loadEnv } from '@/server/env';
import { probeEms } from '@/server/ems/client';
import { handle } from '@/server/http';

/** Discovery: every equipment feeder the electrical meters published in the last day. */
export function GET() {
  return handle('ems_equipment_failed', () => probeEms(loadEnv()));
}
