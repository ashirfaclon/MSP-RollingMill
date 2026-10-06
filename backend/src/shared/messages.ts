/**
 * The ONLY place client-facing source names and connection messages are defined.
 *
 * No implementation jargon — no InfluxDB, VPN, Oracle, AppSheet, token, .env — because
 * every string here can reach the screen. Code elsewhere picks a key; it never writes copy.
 */

import type { SourceId } from '../contracts';
export type { SourceId };

export const SOURCE_LABEL: Record<SourceId, string> = {
  historian: 'Plant historian',
  ems: 'Electrical meters',
  erp: 'ERP',
  logbook: 'Shift & quality logbook',
};

export const MSG = {
  HISTORIAN_UP: 'Plant historian connected',
  HISTORIAN_NOT_CONFIGURED: 'Plant historian connection not yet configured',
  HISTORIAN_UNREACHABLE: 'Plant historian unreachable',
  HISTORIAN_NO_TAGS: 'No historian tag is mapped for this mill yet',
  HISTORIAN_STALE: 'Plant historian connected — no recent readings for this mill',

  EMS_UP: 'Electrical meters connected',
  EMS_NOT_CONFIGURED: 'Electrical meter connection not yet configured',
  EMS_UNREACHABLE: 'Electrical meters unreachable',
  EMS_NO_TAGS: 'No electrical meter is mapped for this mill yet',
  EMS_STALE: 'Electrical meters connected — readings have stopped',

  ERP_UP: 'ERP synced',
  ERP_NOT_SYNCED: 'The ERP has not been synced yet',
  ERP_SYNC_FAILED: 'The last ERP sync failed — showing the previous sync',
  ERP_NEVER_REACHED: 'The ERP could not be reached',

  LOGBOOK_UP: 'Logbook connected',
  LOGBOOK_NO_SESSION: 'Logbook not connected — open the app from the IOsense portal',
  LOGBOOK_SESSION_EXPIRED: 'Logbook session expired — open the app from the IOsense portal again',
  LOGBOOK_UNREACHABLE: 'Logbook unreachable',
  LOGBOOK_NOT_MAPPED: 'Logbook forms for this mill are not mapped yet',
} as const;
