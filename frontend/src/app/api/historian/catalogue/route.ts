import { loadEnv } from '@/server/env';
import { catalogue, probeHistorian } from '@/server/historian/client';
import { HttpError, handle } from '@/server/http';

/**
 * Discovery for building HSM tag definitions.
 *   no params           → measurements that published in the last day
 *   ?measurement=NAME   → that measurement's Units, Groups and fields
 *
 * A measurement name reaches a Flux query, so it is accepted only if the historian itself
 * listed it — user input is never passed through unchecked.
 */
export function GET(req: Request) {
  return handle('historian_catalogue_failed', async () => {
    const env = loadEnv();
    const measurement = new URL(req.url).searchParams.get('measurement');
    const probe = await probeHistorian(env);
    if (!measurement) return probe;
    if (probe.connection === 'up' && !probe.measurements.includes(measurement)) {
      throw new HttpError(404, 'unknown_measurement', 'No such measurement published in the last day');
    }
    return catalogue(env, measurement);
  });
}
