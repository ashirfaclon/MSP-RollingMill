/**
 * The date a finished-stock figure is from (the user, 30 Oct 2026): the day it is counted to, or
 * the ERP's last booked date when that is earlier — stock for a period ending today is really
 * yesterday's, until today is entered.
 */
import { dm } from '@/services/hsmProduction';

export function stockDate(asOf: string | null | undefined, lastDate: string | null | undefined): string | null {
  if (!asOf) return null;
  return lastDate && lastDate < asOf ? lastDate : asOf;
}

/** "as of 29 Oct 2026", beside the Finished stock card's label; null without a date. */
export function stockAsOfText(asOf: string | null | undefined, lastDate: string | null | undefined): string | null {
  const d = stockDate(asOf, lastDate);
  return d ? `as of ${dm(d)} ${d.slice(0, 4)}` : null;
}
