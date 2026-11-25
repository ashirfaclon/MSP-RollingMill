/**
 * What was rolled over a run of dates, from the finished items received from production (ERP PROD_TRAN): each
 * item's name read as the mill's Finished stock by size names it, summed by that name, largest first (the user,
 * 25 Nov 2026). `labelOf` returns null for an item that is not shown (no readable size, a miss roll …).
 */
import type { MillReceipt } from '../integrations/erp/cache';

export interface RolledSection { label: string; mt: number }

export function sectionsRolled(
  dates: string[], receipts: MillReceipt[], labelOf: (name: string) => string | null,
  mode: 'all' | 'online' | 'offline' = 'all',
): RolledSection[] {
  const by = new Map<string, number>();
  for (const r of receipts) {
    if (r.date < dates[0] || r.date > dates[dates.length - 1]) continue;
    if (mode !== 'all' && r.mode !== mode) continue;
    const label = labelOf(r.name);
    if (label) by.set(label, (by.get(label) ?? 0) + r.mt);
  }
  return [...by].map(([label, mt]) => ({ label, mt: Math.round(mt * 100) / 100 }))
    .sort((a, b) => b.mt - a.mt || a.label.localeCompare(b.label));
}
