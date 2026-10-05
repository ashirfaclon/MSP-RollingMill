import { loadEnv } from '@/server/env';
import { HttpError, handle } from '@/server/http';
import { STAND_METRICS, standTrend, type StandMetric } from '@/server/hsm/live';

const HOURS = [2, 6, 12, 24, 72];

/** Stand trend: `group` roughing | finishing, `metric` current | rpm | force | onOff, `hours` 2–72. */
export function GET(req: Request) {
  return handle('hsm_stands_failed', async () => {
    const q = new URL(req.url).searchParams;
    const group = q.get('group') ?? '';
    const metric = (q.get('metric') ?? 'current') as StandMetric;
    const hours = Number(q.get('hours') ?? 6);
    if (group !== 'roughing' && group !== 'finishing') throw new HttpError(400, 'bad_group', 'group must be roughing or finishing');
    if (!(metric in STAND_METRICS)) throw new HttpError(400, 'bad_metric', `metric must be one of ${Object.keys(STAND_METRICS).join(', ')}`);
    if (!HOURS.includes(hours)) throw new HttpError(400, 'bad_hours', `hours must be one of ${HOURS.join(', ')}`);
    return standTrend(loadEnv(), group, metric, hours);
  });
}
