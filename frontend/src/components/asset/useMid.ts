'use client';

/**
 * MID vibration monitoring for an Asset Health screen (/api/mid/:mill): the visits up to the end of the
 * Duration period, narrowed to one section of the mill — or the whole mill ('all') for LSM and RMS,
 * which have no sections. MID visits about once a month, so the figures are the last visit's, with its date.
 */
import { useMemo } from 'react';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type MidMachine, type MidReport, type MidSection, type MidStatus } from '@/services/hsmApi';

const RANK: Record<MidStatus, number> = { Good: 0, Acceptable: 1, 'Un-acceptable': 2 };

export interface MidView {
  report: MidReport | null;
  loading: boolean;
  error: string | null;
  /** The last visit's date; null with no visit up to the period end. */
  date: string | null;
  /** The section's machines at the last visit. */
  machines: MidMachine[];
  /** The highest H / V / A reading over those machines, mm/s. */
  maxMmS: number | null;
  /** The machine in the worst condition (Un-acceptable before Acceptable before Good). */
  worst: MidMachine | null;
  /** The section's highest reading at each visit. */
  trend: { date: string; maxMmS: number }[];
  /** Every visit with the section's machines, oldest first: the Condition trend draws every machine (the user, 31 Oct 2026). */
  visits: { date: string; machines: MidMachine[] }[];
}

const highest = (ms: MidMachine[]) => {
  const v = ms.map((m) => m.maxMmS).filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
};

/** `section`: one section, 'all' for the whole mill, null for a zone with no machines (NA). */
export function useMid(mill: 'hsm' | 'rmd' | 'lsm' | 'rms', section: MidSection | 'all' | null): MidView {
  const { dates } = useSelection();
  const url = rangeUrl(`/api/mid/${mill}`, dates);
  const s = useApi<MidReport>(url);
  const report = s.data && s.dataUrl === url ? s.data : null;
  return useMemo(() => {
    const pick = (ms: MidMachine[]) => (section === null ? [] : section === 'all' ? ms : ms.filter((m) => m.section === section));
    const machines = report?.latest ? pick(report.latest.machines) : [];
    const graded = machines.filter((m) => m.status !== null);
    const worst = graded.length ? graded.reduce((a, m) => (RANK[m.status!] > RANK[a.status!] ? m : a)) : null;
    const trend = (report?.visits ?? [])
      .map((v) => ({ date: v.date, maxMmS: highest(pick(v.machines)) }))
      .filter((t): t is { date: string; maxMmS: number } => t.maxMmS !== null);
    const visits = (report?.visits ?? []).map((v) => ({ date: v.date, machines: pick(v.machines) })).filter((v) => v.machines.length > 0);
    return {
      report, loading: !s.data && !s.error, error: s.error,
      date: report?.latest?.date ?? null,
      machines, maxMmS: highest(machines), worst, trend, visits,
    };
  }, [report, section, s.data, s.error]);
}
