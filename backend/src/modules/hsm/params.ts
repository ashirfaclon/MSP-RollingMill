/** Query-string validation shared by the HSM routes — a bad request is a named 400, never a guess. */
import { HttpError } from '../../shared/http-error';
import { dateRange, isDate, type Grain } from './production.service';
import type { RmdMode } from '../../contracts';

const GRAINS: Grain[] = ['day', 'week', 'month'];
export const MAX_DAYS = 400;

/** `from`..`to` plant dates (YYYY-MM-DD, inclusive), at most MAX_DAYS. */
export function parseRange(q: URLSearchParams): { from: string; to: string } {
  const from = q.get('from') ?? '';
  const to = q.get('to') ?? '';
  if (!isDate(from) || !isDate(to)) throw new HttpError(400, 'bad_range', 'from and to must be dates (YYYY-MM-DD)');
  if (from > to) throw new HttpError(400, 'bad_range', 'from must not be after to');
  if (dateRange(from, to).length > MAX_DAYS) throw new HttpError(400, 'range_too_long', `At most ${MAX_DAYS} days`);
  return { from, to };
}

/** `grain` = day | week | month; day when absent. */
export function parseGrain(q: URLSearchParams): Grain {
  const grain = (q.get('grain') ?? 'day') as Grain;
  if (!GRAINS.includes(grain)) throw new HttpError(400, 'bad_grain', 'grain must be day, week or month');
  return grain;
}

const RMD_MODES: RmdMode[] = ['all', 'online', 'offline'];

/** RMD `mode` = all | online | offline; all when absent. */
export function parseRmdMode(q: URLSearchParams): RmdMode {
  const mode = (q.get('mode') ?? 'all') as RmdMode;
  if (!RMD_MODES.includes(mode)) throw new HttpError(400, 'bad_mode', 'mode must be all, online or offline');
  return mode;
}
