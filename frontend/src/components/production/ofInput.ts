import { fixed } from '@/lib/num';

/**
 * A figure's share of the billet input, "3.4%" — what HSM's Material & operating balance writes
 * beside every reject and the mass difference, now on every mill (the user, 30 Oct 2026). Null
 * when either figure is missing or there is no input, so the MT stands alone.
 */
export function ofInput(v: number | null | undefined, input: number | null | undefined): string | null {
  if (v == null || input == null || input <= 0) return null;
  return `${fixed((v / input) * 100, 1)}%`;
}
