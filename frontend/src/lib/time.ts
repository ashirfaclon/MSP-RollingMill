/** Plant time (IST) formatting. The zone is explicit, so server and browser agree. */
const HHMM = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
});

export const fmtIst = (ms: number): string => HHMM.format(ms);

/** "8 h 00 m", "36 m". */
export function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} m`;
}
