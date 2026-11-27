/**
 * Who may see which mill (the user, 27 Nov 2026). Each MSP user is put in one IOsense role (Sub User Management):
 *   HSM / RMD / LSM / RMS   that mill only;
 *   All Access              every mill;
 *   the main account        every mill — MSP's own (FULL_ACCESS_ORGANISATIONS), not another company's;
 *   FULL_ACCESS_EMAILS      every mill whatever IOsense says of the role — MSP's master login, mspsteel@ycp.com;
 *   anything else           no mill: the sign-in is refused ("no mill assigned — contact your admin").
 *
 * A sub-user's role comes from IOsense's my-permissions as a role ID (a sub-user cannot read role names), so the
 * roles are matched by ID: renaming a role in IOsense changes nothing; deleting and re-creating one needs its new ID
 * here. The IDs are the roles as created on 27 Nov 2026 (the main account's role list, logged at sign-in).
 *
 * The role is asked again every time the dashboard is opened or refreshed (GET /api/auth/session), with the person's
 * own IOsense session, kept in this process only — never sent to the browser or written anywhere.
 */
import type { Env } from '../../config/env';
import { describeUser, userEmail } from '../../integrations/logbook/client';

export type MillId = 'hsm' | 'rmd' | 'lsm' | 'rms';
export const MILL_IDS: readonly MillId[] = ['hsm', 'rmd', 'lsm', 'rms'];

/** IOsense role ID → the mills it opens. */
export const ROLE_MILLS: Record<string, { name: string; mills: readonly MillId[] }> = {
  '6b0948ae0e5ad8305db1948f': { name: 'HSM', mills: ['hsm'] },
  '6b094dc90e5ad8305db1c54d': { name: 'RMD', mills: ['rmd'] },
  '6b094b69c645ca44c70639eb': { name: 'LSM', mills: ['lsm'] },
  '6b0950e73e5e1c134032fba8': { name: 'RMS', mills: ['rms'] },
  '6ae08f11c853b299a010112c': { name: 'All Access', mills: MILL_IDS },
};

/** What a signed-in person may see. */
export interface Access {
  mills: MillId[];
  /** The person's own email (sub-users share the main account's user ID), for "changed by". */
  email: string | null;
  /** Their IOsense role, for the log. */
  roleId: string | null;
  role: string;
}

export class AccessUnavailable extends Error {}

/**
 * Ask IOsense who this person is. Throws AccessUnavailable when IOsense does not answer — the caller decides
 * (sign-in: refuse and say "try again"; a refresh: keep what the session already has).
 */
export async function resolveAccess(userBearer: string, organisation: string, fullOrgs: readonly string[], env?: Env, fullEmails: readonly string[] = []): Promise<Access> {
  const [d, email] = await Promise.all([describeUser(userBearer, env), userEmail(userBearer, env)]);
  // The master login: every mill, even if IOsense gives it no role or does not say what it is.
  if (email && fullEmails.includes(email)) return { mills: [...MILL_IDS], email, roleId: d.roleId, role: 'master account' };
  if (d.isSubUser === null) throw new AccessUnavailable(d.error ?? 'IOsense did not say who this is');
  if (!d.isSubUser) {
    const ours = fullOrgs.includes(organisation);
    return { mills: ours ? [...MILL_IDS] : [], email, roleId: null, role: ours ? 'main account' : 'main account of another organisation' };
  }
  const r = d.roleId ? ROLE_MILLS[d.roleId] : undefined;
  return { mills: r ? [...r.mills] : [], email, roleId: d.roleId, role: r?.name ?? 'no rolling-mill role' };
}

/**
 * The mill an API path belongs to, or null for what every mill shares (sign-in, health, data sources, ERP sync):
 *   /api/<mill>/…                                   hsm, rmd, lsm, rms routes
 *   /api/{mid,pm,ca,settings,alerts}/<mill>[/…]     a mill in the path
 *   /api/forms/{plan,ca}/<mill>                     the plan and costing forms
 *   /api/forms/hsm/…, /api/forms/equipment/hsm-…    HSM checklists, HSM motor ratings
 *   /api/forms/equipment/rmd-…                      RMD oil tanks
 */
export function millOfPath(url: string): MillId | null {
  const path = url.split('?')[0].toLowerCase();
  const seg = path.split('/').filter(Boolean);
  if (seg[0] !== 'api') return null;
  const isMill = (s: string | undefined): s is MillId => !!s && (MILL_IDS as readonly string[]).includes(s);
  if (isMill(seg[1])) return seg[1];
  if (['mid', 'pm', 'ca', 'settings', 'alerts'].includes(seg[1] ?? '') && isMill(seg[2])) return seg[2];
  if (seg[1] === 'forms') {
    if ((seg[2] === 'plan' || seg[2] === 'ca') && isMill(seg[3])) return seg[3];
    if (seg[2] === 'hsm') return 'hsm';
    if (seg[2] === 'equipment') return (seg[3] ?? '').startsWith('rmd') ? 'rmd' : (seg[3] ?? '').startsWith('hsm') ? 'hsm' : null;
  }
  return null;
}

/* The person's IOsense session, per app session, so a refresh can ask again. Memory only; gone on restart (then the
   session keeps the access it was signed in with until it ends). */
const bearers = new Map<string, { bearer: string; untilMs: number }>();

export function keepBearer(sid: string, bearer: string, untilMs: number) {
  const now = Date.now();
  for (const [k, v] of bearers) if (v.untilMs < now) bearers.delete(k);
  bearers.set(sid, { bearer, untilMs });
}

export function bearerOf(sid: string | undefined): string | null {
  if (!sid) return null;
  const b = bearers.get(sid);
  return b && b.untilMs > Date.now() ? b.bearer : null;
}
