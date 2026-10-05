/** Balance verdict: ✓ balances, ✗ does not, – an input is missing. */
export default function CheckMark({ ok }: { ok: boolean | null }) {
  if (ok === true) return <span className="dm-mark dm-mark--ok" title="Balances" aria-label="Balances">✓</span>;
  if (ok === false) return <span className="dm-mark dm-mark--risk" title="Does not balance" aria-label="Does not balance">✗</span>;
  return <span className="dm-mark dm-mark--na" title="Missing input" aria-label="Missing input">–</span>;
}
