/**
 * LSM finished stock by section, by the plant's stock rule — checked against the ERP's own
 * Stock Sheet Engine report for division LS (13 Oct 2026: 112 items, closing 5,759.51 MT vs
 * 5,759.49 here). ITEMTRAN_BODY, division LS, finished and semi-finished items (FG, SM — the
 * ERP files many prime items as SM), every godown but STOR1P, without the excluded voucher
 * types; stock at the end of a date = Σ received − issued up to it. Billets are left out
 * (raw material, not finished stock).
 *
 * Every finished item under LS is LSM's (the user, 13 Oct 2026). A section is read from the
 * item's name ("MS ANGLE 65X8 12 mtr" → Angle 65×8); its lengths (6 m, 12 m, special length) and
 * defective item are summed into it. LSM's 19 sections as the plant listed them (Section wise R/M
 * length sheet) come first, in their names and order; any other section (Angle 40×5, Channel 150,
 * rounds …) follows, angles → channels → beams → rounds; a name giving no section goes to Other.
 *
 * RMS is the same rule for division RS (rmsStock), its sections ordered angles → channels →
 * beams → H beams, by size.
 */
import type { Env } from '../../config/env';
import type { LsmStockReport } from '../../contracts';
import { readErpLsmStock, readErpRmsStock, type LsmStockCache } from '../../integrations/erp/cache';
import { MSG } from '../../shared/messages';

/** Below this an item or section is nil (the ERP's rounding): it isn't shown. */
const MIN_MT = 0.05;
const kg = (mt: number) => Math.round(mt * 1000);
const mtOf = (kgs: number) => Math.round(kgs / 10) / 100;
const TYPE: Record<string, string> = { ANGLE: 'Angle', CHANNEL: 'Channel', BEAM: 'Beam', 'H BEAM': 'H Beam', ROUND: 'Round', 'ROUND BAR': 'Round' };

/** LSM's sections in the plant's order: the name's section → the plant's label. */
export const LSM_SECTIONS: [string, string][] = [
  ['Angle 50×6', 'A 50×50×6'], ['Angle 65×5', 'A 65×65×5'], ['Angle 65×6', 'A 65×65×6'], ['Angle 65×8', 'A 65×65×8'],
  ['Angle 75×5', 'A 75×75×5'], ['Angle 75×6', 'A 75×75×6'], ['Angle 75×8', 'A 75×75×8'], ['Angle 75×10', 'A 75×75×10'],
  ['Angle 90×6', 'A 90×90×6'], ['Angle 90×8', 'A 90×90×8'],
  ['Angle 100×6', 'A 100×100×6'], ['Angle 100×8', 'A 100×100×8'], ['Angle 100×10', 'A 100×100×10'], ['Angle 100×12', 'A 100×100×12'],
  ['Channel 125', 'MC 125×65'], ['Channel 100×50', 'MC 100×50'], ['Channel 75×40', 'MC 75×40'],
  ['Beam 100', 'MB 100×50'], ['Beam 125', 'MB 125×70'],
];
const LABEL = new Map(LSM_SECTIONS);
const RANK = new Map(LSM_SECTIONS.map(([k], i) => [k, i]));
const TYPE_ORDER = ['Angle', 'Channel', 'Beam', 'H Beam', 'Round'];

/** A section not on the plant's list, in the same style: Angle 40×5 → A 40×40×5, Channel 150 → MC 150. */
function labelOf(s: { label: string; type: string; a: number; b: number }) {
  if (s.type === 'Angle' && s.b) return `A ${s.a}×${s.a}×${s.b}`;
  if (s.type === 'Channel') return `MC ${s.a}${s.b ? `×${s.b}` : ''}`;
  if (s.type === 'Beam') return `MB ${s.a}${s.b ? `×${s.b}` : ''}`;
  return s.label;
}
/** The plant's sections first (LSM), in their order; then the rest by type and size; Other last. */
const sortOf = (s: { label: string; type: string; a: number; b: number } | null, plant: boolean) =>
  !s ? 1e9 : plant && RANK.has(s.label) ? RANK.get(s.label)! : 1000 + TYPE_ORDER.indexOf(s.type) * 10000 + s.a * 10 + s.b / 100;

/** The section an item name gives, e.g. { label: 'Angle 65×8', type: 'Angle', a: 65, b: 8 }; null for none. */
export function sectionOf(name: string): { label: string; type: string; a: number; b: number } | null {
  const u = name.toUpperCase().replace(/M\.S\.?/g, 'MS ').replace(/\s+/g, ' ');
  const m = /\b(H BEAM|ANGLE|CHANNEL|BEAM|ROUND(?: BAR)?)\s*(\d+)\s*(?:MM)?\s*(?:X\s*(\d+))?/.exec(u);
  if (!m) return null;
  const type = TYPE[m[1]];
  const a = Number(m[2]);
  const b = m[3] ? Number(m[3]) : 0;
  return { label: `${type} ${a}${b ? `×${b}` : ''}`, type, a, b };
}

export function stockBySection(cache: Pick<LsmStockCache, 'moves' | 'items'>, asOf: string, plantList = true): LsmStockReport['sizes'] {
  const byItem = new Map<string, number>();
  for (const m of cache.moves) {
    if (m.date > asOf) continue;
    byItem.set(m.item, (byItem.get(m.item) ?? 0) + kg(m.netMt));
  }
  const groups = new Map<string, { sort: number; items: { code: string; name: string; kg: number }[] }>();
  for (const [code, kgs] of byItem) {
    const name = (cache.items[code] ?? code).replace(/\s+/g, ' ').trim();
    const s = sectionOf(name);
    const key = s ? (plantList ? LABEL.get(s.label) : undefined) ?? labelOf(s) : 'Other';
    const g = groups.get(key) ?? { sort: sortOf(s, plantList), items: [] };
    g.items.push({ code, name, kg: kgs });
    groups.set(key, g);
  }
  return [...groups].map(([label, g]) => ({
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label,
    sort: g.sort,
    stockMt: mtOf(g.items.reduce((a, i) => a + i.kg, 0)),
    // A negative item stays listed (the section total counts it, as the ERP's report does); 0 is left out.
    items: g.items.map((i) => ({ code: i.code, name: i.name, stockMt: mtOf(i.kg) }))
      .filter((i) => Math.abs(i.stockMt) >= MIN_MT)
      .sort((a, b) => b.stockMt - a.stockMt || a.name.localeCompare(b.name)),
  }))
    .filter((g) => g.stockMt >= MIN_MT)
    .sort((x, y) => x.sort - y.sort)
    .map(({ sort: _s, ...g }) => g);
}

export function lsmStock(env: Env, asOf: string): LsmStockReport {
  return report(readErpLsmStock(env), asOf, true);
}

/** RMS: the same rule for division RS (no plant section list: angles → channels → beams, by size). */
export function rmsStock(env: Env, asOf: string): LsmStockReport {
  return report(readErpRmsStock(env), asOf, false);
}

function report(cache: LsmStockCache | null, asOf: string, plantList: boolean): LsmStockReport {
  const sizes = cache ? stockBySection(cache, asOf, plantList) : [];
  return {
    asOf,
    erp: {
      connection: cache ? 'up' : 'down',
      message: cache ? MSG.ERP_UP : MSG.ERP_NOT_SYNCED,
      syncedAt: cache?.syncedAt ?? null,
      lastDate: cache?.moves.at(-1)?.date ?? null,
    },
    sizes,
    totalMt: mtOf(sizes.reduce((a, s) => a + kg(s.stockMt), 0)),
  };
}
