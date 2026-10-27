/**
 * Which section of the mill a MID machine belongs to.
 *   RMD  the plant's list (27 Oct 2026): ROUGHING 1 = 20" roughing stand, ROUGHING 2–4 = 16" roughing
 *        stand → roughing; Intermill, DC motors (old 1–6, new 01–08) → route / divertor; pinch rolls,
 *        shears, tail breakers → finishing; water pumps → auxiliary.
 *   HSM  the stands by name: ROUGHING-01…05 (RM 1–5) → roughing, FINISHING-01…06 (FM 1–6) → finishing,
 *        pumps → auxiliary; edgers and pinch rolls are in no stand group.
 *   LSM, RMS  no sections on their screens: every machine counts for the mill.
 */
import type { MidSection } from '../../contracts';

const RULES: Record<string, [RegExp, MidSection][]> = {
  hsm: [[/^ROUGHING-\d+$/, 'roughing'], [/^FINISHING-\d+$/, 'finishing'], [/^PUMP-\d+$/, 'auxiliary']],
  rmd: [
    [/^ROUGHING \d+$/, 'roughing'],
    [/^(INTERMILL|DC MOTOR NO\.\d+ OLD|NEW DC \d+( NEW)?)$/, 'route'],
    [/^(PRE|POST) PINCH ROLL (OLD|NEW)$|^CC SHEAR$|^FLYING SHEAR$|^TAIL BREAKER-\d+ (OLD|NEW)$/, 'finishing'],
    [/^(COLD|HOT) WATER PUMP/, 'auxiliary'],
  ],
};

export function sectionOf(mill: string, machine: string): MidSection | null {
  return RULES[mill]?.find(([re]) => re.test(machine))?.[1] ?? null;
}
