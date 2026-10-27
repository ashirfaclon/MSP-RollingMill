/**
 * HSM costing for a period from the plant's monthly conversion-cost sheets (months.ts). A sheet is a
 * whole month, so a period gets figures only when every month it touches has one; several months
 * combine weighted by each month's production (₹ ÷ MT over all of them).
 */
import type { CostingMonth, CostingReport } from '../../../contracts';
import { round2 } from '../production.service';
import { COSTING_MONTHS } from './months';

/** "2026-09-15".."2026-10-02" → ["2026-09", "2026-10"]. */
export function monthsOf(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= end) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function hsmCosting(from: string, to: string, sheets: CostingMonth[] = COSTING_MONTHS): CostingReport {
  const months = monthsOf(from, to);
  const found = months.map((m) => sheets.find((s) => s.month === m)).filter((s): s is CostingMonth => !!s);
  const complete = found.length === months.length && found.length > 0;
  const mt = sum(found.map((s) => s.productionMt));
  const perMt = (pick: (s: CostingMonth) => number) => round2(sum(found.map((s) => pick(s) * s.productionMt)) / mt);
  return {
    from, to, months, sheets: found,
    period: complete ? {
      productionMt: round2(mt),
      conversionPerMt: perMt((s) => s.conversionPerMt),
      otherConversionPerMt: perMt((s) => sum(s.others.map((l) => l.perMt))),
      powerPerMt: perMt((s) => sum(s.power.map((l) => l.perMt))),
      materialLossRs: round2(sum(found.flatMap((s) => s.losses.map((l) => l.rs)))),
      // Tariff weighted by each month's power.
      tariffPerKwh: round2(sum(found.map((s) => s.tariffPerKwh * sum(s.power.map((l) => l.qty ?? 0)))) / sum(found.map((s) => sum(s.power.map((l) => l.qty ?? 0))))),
    } : null,
  };
}
