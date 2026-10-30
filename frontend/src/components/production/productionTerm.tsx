/**
 * The days a production figure covers (the user, 30 Oct 2026): the Duration period, ending at
 * the ERP's last booked date when that is earlier — a period ending today really covers up to
 * yesterday, until today's log sheet is entered.
 */
import { dm } from '@/services/hsmProduction';

export function productionTerm(from: string | null | undefined, to: string | null | undefined, lastDate: string | null | undefined): { from: string; to: string } | null {
  if (!from || !to) return null;
  const end = lastDate && lastDate < to && lastDate >= from ? lastDate : to;
  return { from, to: end };
}

/** "1 Oct – 29 Oct 2026", or "29 Oct 2026" for one day: the Production card's period, beside its label. */
export function productionTermText(from: string | null | undefined, to: string | null | undefined, lastDate: string | null | undefined): string | null {
  const t = productionTerm(from, to, lastDate);
  if (!t) return null;
  const y = t.to.slice(0, 4);
  return t.from === t.to ? `${dm(t.to)} ${y}` : `${dm(t.from)}${t.from.slice(0, 4) === y ? '' : ` ${t.from.slice(0, 4)}`} – ${dm(t.to)} ${y}`;
}
