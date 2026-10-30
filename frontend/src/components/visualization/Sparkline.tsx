/**
 * A card's sparkline: the period's readings as one thin line in the card's own colour, no axes,
 * stretched to the card's width (the user's reference, 30 Oct 2026). A gap in the readings is a
 * gap in the line — a missing reading is never drawn as zero.
 */
export default function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length < 2) return <span className="rm-spark rm-spark--empty" aria-hidden />;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  const n = values.length;
  /* One path per unbroken run of readings. */
  const runs: string[] = [];
  let run = '';
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) { if (run) runs.push(run); run = ''; return; }
    const x = n === 1 ? 50 : (i / (n - 1)) * 100;
    const y = 22 - ((v - lo) / span) * 20;
    run += `${run ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  if (run) runs.push(run);
  return (
    <svg className="rm-spark" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label={label}>
      {runs.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
