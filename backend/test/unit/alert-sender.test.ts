/** The alert sender: what is news, the message, delivery and its memory (docs/SMS-ALERTS.md §6–§7). */
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Alarm, EscalationLevel, MillEscalation } from '../../src/contracts';
import { checkEscalation, emailOf, escalationOf, phoneOf } from '../../src/modules/alerts/escalation';
import { decide, wantOf, type MillRead, type OpenAlert } from '../../src/modules/alerts/sender/decide';
import { flush, GIVE_UP_MS, nextTryAt } from '../../src/modules/alerts/sender/deliver';
import { eventOf, istText, sinceText } from '../../src/modules/alerts/sender/message';
import { coerceState, emptyState, MAX_GAP_MS, resume, type OutboxEntry } from '../../src/modules/alerts/sender/state';
import { postJson, rehearsalUrls, testSiblingOf, urlLabel } from '../../src/modules/alerts/sender/webhook';

const alarm = (over: Partial<Alarm> = {}): Alarm => ({
  key: 'rmd|limit:oil-temp|Oil tank 2|Oil', episode: 'rmd|limit:oil-temp|Oil tank 2|Oil|2026-11-20 10:15', ruleId: 'limit:oil-temp',
  kind: 'limit', severity: 'warning', label: 'Oil tank temperature', asset: 'Oil tank 2', point: 'Oil',
  message: 'Oil tank 2 · Oil: oil tank temperature 38 °C, below the min of 45 °C (since 20 Nov)',
  value: 38, worst: 37, unit: '°C', limit: { min: 45, max: 60 }, limitId: 'oil-temp',
  since: '2026-11-20 10:15', lastAt: '2026-11-21 09:00', readings: 3, active: true, clearedAt: null, occurrences: 1,
  muted: false, severityPinned: false, source: 'TMT Mechanical → Oil Tank Temperature', ...over,
});
const ch = (enabled: boolean, ...contacts: string[]) => ({ enabled, contacts });
const lvl = (everyMinutes: number, phone: string, email = ''): EscalationLevel => ({ everyMinutes, sms: ch(true, phone), whatsapp: ch(false, phone), email: ch(!!email, ...(email ? [email] : [])) });
const esc = (onePerCrossing: boolean, ...levels: EscalationLevel[]): MillEscalation => ({ onePerCrossing, levels, setBy: null, setAt: null });
const read = (alarms: Alarm[], e: MillEscalation = esc(true, lvl(0, '+919000000001')), ok = true): MillRead => ({ mill: 'rmd', ok, alarms, escalation: e, floorOf: () => 'warning' });
const T = (min: number) => new Date(Date.parse('2026-11-21T09:30:00.000Z') + min * 60_000).toISOString();
const primed = (open: OpenAlert[] = []) => ({ primedAt: T(-60), open });

describe('the contact list', () => {
  test('phones and emails normalised; junk named', () => {
    expect(phoneOf(' +91 98765-43210 ')).toBe('+919876543210');
    expect(phoneOf('(0771) 123 4567')).toBe('07711234567');
    expect(phoneOf('12345')).toBeNull();
    expect(emailOf('Ravi.K@MSP.in')).toBe('ravi.k@msp.in');
    expect(emailOf('ravi@')).toBeNull();
    const c = checkEscalation({ onePerCrossing: true, levels: [{ everyMinutes: 30, sms: { enabled: true, contacts: '9876543210, 98765-43210; 1' }, whatsapp: { enabled: false, contacts: [] }, email: { enabled: false, contacts: ['x'] } }] });
    expect(c.value.levels[0].sms.contacts).toEqual(['9876543210']);
    expect(c.problems).toEqual(['Level 1 SMS: "1" is not a phone number (7 to 15 digits)', 'Level 1 Email: "x" is not an email id']);
    expect(checkEscalation({ onePerCrossing: true, levels: Array.from({ length: 11 }, () => lvl(0, '9876543210')) }).problems).toContain('At most 10 levels');
  });

  test('read leniently: nothing stored is the shipped list; a bad stored level is dropped', () => {
    expect(escalationOf(undefined)).toEqual({ onePerCrossing: true, levels: [], setBy: null, setAt: null });
    const e = escalationOf({ onePerCrossing: false, levels: [lvl(5, '9876543210'), { everyMinutes: -1 }], by: 'A', at: 't' });
    expect(e).toMatchObject({ onePerCrossing: false, setBy: 'A', levels: [expect.objectContaining({ everyMinutes: 5 })] });
    expect(e.levels).toHaveLength(1);
  });
});

describe('what is news', () => {
  test('first look: everything standing is adopted quietly', () => {
    const d = decide({ primedAt: null, open: [] }, [read([alarm()])], T(0));
    expect(d.events).toEqual([]);
    expect(d.open).toEqual([expect.objectContaining({ silent: 'primed', told: [] })]);
    expect(d.primedAt).toBe(T(0));
    // …and stays quiet while it stands.
    expect(decide(d, [read([alarm()])], T(1)).events).toEqual([]);
  });

  test('a new crossing goes to level 1 once; the same crossing is not news again', () => {
    const d = decide(primed(), [read([alarm()])], T(0));
    expect(d.events).toHaveLength(1);
    expect(d.events[0]).toMatchObject({ kind: 'raised', id: alarm().episode, level: 1, smsTo: ['+919000000001'], whatsappTo: [], emailTo: [] });
    expect(decide(d, [read([alarm()])], T(600)).events).toEqual([]);
  });

  test('back inside re-arms silently; the next crossing is news', () => {
    const a = decide(primed(), [read([alarm()])], T(0));
    const b = decide(a, [read([alarm({ active: false })])], T(1));
    expect(b.events).toEqual([]);
    expect(b.open).toEqual([]);
    const c = decide(b, [read([alarm({ episode: 'rmd|limit:oil-temp|Oil tank 2|Oil|2026-11-22 08:00' })])], T(2));
    expect(c.events.map((e) => e.kind)).toEqual(['raised']);
  });

  test('data checks, muted alerts and alerts below "messages from" send nothing', () => {
    const data = alarm({ key: 'rmd|stale:oil-temp', episode: 'rmd|stale:oil-temp|x', kind: 'stale', severity: 'data', ruleId: 'stale:oil-temp' });
    const pinned = alarm({ key: 'rmd|stale:bearings', episode: 'e2', kind: 'stale', severity: 'critical', ruleId: 'stale:bearings' });
    const muted = alarm({ key: 'k3', episode: 'e3', muted: true });
    const d = decide(primed(), [read([data, pinned, muted])], T(0));
    expect(d.events).toEqual([]);
    expect(d.open.map((o) => o.silent)).toEqual(['below', 'below', 'muted']);
    // Un-muting does not send the old crossing.
    expect(decide(d, [read([{ ...muted, muted: false }])], T(1)).events).toEqual([]);
  });

  test('below "messages from" when first seen, told once it rises to it', () => {
    const critOnly = (alarms: Alarm[]): MillRead => ({ ...read(alarms), floorOf: () => 'critical' });
    const a = decide(primed(), [critOnly([alarm()])], T(0));
    expect(a.events).toEqual([]);
    const b = decide(a, [critOnly([alarm({ severity: 'critical' })])], T(60));
    expect(b.events).toEqual([expect.objectContaining({ kind: 'raised', severity: 'critical', severityLabel: 'CRITICAL' })]);
    expect(wantOf(alarm(), () => 'critical')).toBe('below');
  });

  test('a mill that fails to read keeps what is remembered — nothing re-raised after', () => {
    const a = decide(primed(), [read([alarm()])], T(0));
    const b = decide(a, [read([], undefined, false)], T(1));
    expect(b.open).toEqual(a.open);
    expect(decide(b, [read([alarm()])], T(2)).events).toEqual([]);
  });

  test('one message per crossing off: level 1 every N, later levels after their own N, 0 = with the first', () => {
    const e = esc(false, lvl(30, '+911'), lvl(60, '+912'), lvl(0, '+913'));
    const at0 = decide(primed(), [read([alarm()], e)], T(0));
    expect(at0.events.map((x) => [x.kind, x.level])).toEqual([['raised', 1], ['repeated', 3]]);
    expect(at0.events[1]).toMatchObject({ raisedId: alarm().episode, id: `${alarm().episode}~L3@${T(0)}`, smsTo: ['+913'] });
    const at29 = decide(at0, [read([alarm()], e)], T(29));
    expect(at29.events).toEqual([]);
    const at30 = decide(at29, [read([alarm()], e)], T(30));
    expect(at30.events.map((x) => x.level)).toEqual([1]);
    const at60 = decide(at30, [read([alarm()], e)], T(60));
    expect(at60.events.map((x) => x.level)).toEqual([1, 2]);
    const at90 = decide(at60, [read([alarm()], e)], T(90));
    expect(at90.events.map((x) => x.level)).toEqual([1]);
    // Back inside: the reminders stop.
    expect(decide(at90, [read([alarm({ active: false })], e)], T(120)).events).toEqual([]);
  });

  test('one message per crossing on: level 1 only, never again', () => {
    const e = esc(true, lvl(30, '+911'), lvl(0, '+912'));
    const a = decide(primed(), [read([alarm()], e)], T(0));
    expect(a.events.map((x) => x.level)).toEqual([1]);
    expect(decide(a, [read([alarm()], e)], T(600)).events).toEqual([]);
  });

  test('no contact list: still sent, nobody named', () => {
    const [ev] = decide(primed(), [read([alarm()], esc(true))], T(0)).events;
    expect(ev).toMatchObject({ escalation: null, smsTo: [], whatsappTo: [], emailTo: [] });
  });
});

describe('the message', () => {
  test('the Melt Shop shape, with the department; the same 7 lines every time', () => {
    const e = eventOf(alarm(), 'rmd', esc(true, lvl(0, '+919000000001', 'a@msp.in')), 1, 'raised', 'id-1', null, '2026-11-21T09:31:00.000Z');
    expect(e).toMatchObject({
      department: 'RMD', mill: 'rmd', equipment: 'Oil tank 2 · Oil', title: 'Oil tank temperature low',
      valueText: '38 °C', limit: 45, limitLabel: '< min', limitText: '45 °C', sinceIst: '20 Nov 2026, 10:15', timeIst: '21 Nov 2026, 15:01 IST',
      escalation: { level: 1, of: 1, everyMinutes: 0 }, smsTo: ['+919000000001'], whatsappTo: [], emailTo: ['a@msp.in'],
      subject: '[WARNING] RMD Oil tank 2 · Oil — Oil tank temperature low',
    });
    expect(e.body).toBe([
      'Department: RMD', 'Equipment: Oil tank 2 · Oil', 'Condition: Oil tank temperature low', 'Severity: WARNING',
      'Reading: 38 °C', 'Limit: < min 45 °C', 'Time: 21 Nov 2026, 15:01 IST',
    ].join('\n'));
    const high = eventOf(alarm({ value: 72.5, severity: 'critical', unit: '%', point: '' }), 'hsm', esc(true), 1, 'raised', 'i', null, '2026-11-21T00:00:00.000Z');
    expect(high).toMatchObject({ department: 'HSM', title: 'Oil tank temperature high', valueText: '72.5%', limitText: '60%', equipment: 'Oil tank 2' });
    expect(eventOf(alarm({ value: null }), 'rmd', esc(true), 1, 'raised', 'i', null, T(0)).body).toContain('Reading: NA');
  });

  test('times', () => {
    expect(istText('2026-11-20T20:00:00.000Z')).toBe('21 Nov 2026, 01:30 IST');
    expect(sinceText('2026-11-19')).toBe('19 Nov 2026');
    expect(sinceText('')).toBe('NA');
  });
});

describe('delivery', () => {
  const entry = (id: string, over: Partial<OutboxEntry> = {}): OutboxEntry => ({
    event: eventOf(alarm(), 'rmd', esc(true), 1, 'raised', id, null, new Date().toISOString()), owed: ['u1', 'u2'], tries: 0, lastTriedAt: null, lastError: null, ...over,
  });
  const deps = (down: Set<string>) => {
    const posted: string[] = []; const done: string[] = []; const rehearsed: string[] = [];
    return {
      posted, done, rehearsed,
      d: {
        post: async (url: string, b: { id: string }) => { posted.push(`${url}:${b.id}`); return down.has(url) ? { ok: false as const, status: 500, error: 'HTTP 500' } : { ok: true as const, status: 200 }; },
        rehearse: async (b: { id: string }) => { rehearsed.push(b.id); },
        done: async (e: { id: string }) => { done.push(e.id); },
        log: () => {},
        nowMs: () => Date.now(),
      },
    };
  };

  test('each receiver retried on its own; done once every receiver has it', async () => {
    const x = deps(new Set(['u2']));
    const left = await flush([entry('a')], new Set(['a']), 20_000, x.d);
    expect(x.posted).toEqual(['u1:a', 'u2:a']);
    expect(x.rehearsed).toEqual(['a']);
    expect(left).toEqual([expect.objectContaining({ owed: ['u2'], tries: 1, lastError: 'HTTP 500' })]);
    // Not yet due (backs off a minute).
    const y = deps(new Set());
    expect(await flush(left, new Set(), 20_000, y.d)).toHaveLength(1);
    expect(y.posted).toEqual([]);
    const due = [{ ...left[0], lastTriedAt: new Date(Date.now() - 61_000).toISOString() }];
    expect(await flush(due, new Set(), 20_000, y.d)).toEqual([]);
    expect(y.posted).toEqual(['u2:a']);
    expect(y.done).toEqual(['a']);
    expect(y.rehearsed).toEqual([]);
  });

  test('backoff 1, 2, 4 … capped at 30 minutes; new messages first; old ones given up', async () => {
    const at = '2026-11-21T00:00:00.000Z';
    expect(nextTryAt(entry('a', { tries: 1, lastTriedAt: at })) - Date.parse(at)).toBe(60_000);
    expect(nextTryAt(entry('a', { tries: 3, lastTriedAt: at })) - Date.parse(at)).toBe(240_000);
    expect(nextTryAt(entry('a', { tries: 12, lastTriedAt: at })) - Date.parse(at)).toBe(1_800_000);
    const x = deps(new Set());
    const old = entry('old', { tries: 2, lastTriedAt: at });
    old.event = { ...old.event, at: new Date(Date.now() - GIVE_UP_MS - 1).toISOString() };
    const retry = entry('r', { tries: 1, lastTriedAt: new Date(Date.now() - 120_000).toISOString() });
    // A zero budget defers retries, never new messages.
    const left = await flush([old, retry, entry('n')], new Set(['n']), 0, x.d);
    expect(x.posted.filter((p) => p.startsWith('u1'))).toEqual(['u1:n']);
    expect(x.done).toEqual(['n', 'old']);
    expect(left.map((e) => e.event.id)).toEqual(['r']);
  });
});

describe('the webhook', () => {
  let url = '';
  const got: { headers: IncomingHttpHeaders; body: unknown }[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      got.push({ headers: req.headers, body: JSON.parse(raw || '{}') });
      res.writeHead(req.url === '/down' ? 503 : 200).end('{}');
    });
  });
  beforeAll(async () => { await new Promise<void>((r) => server.listen(0, '127.0.0.1', r)); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
  afterAll(() => { server.close(); });

  test('JSON with the token; a non-2xx is a failure', async () => {
    expect(await postJson(`${url}/hook`, { id: 'x' }, 's3cret')).toEqual({ ok: true, status: 200 });
    expect(got[0]).toMatchObject({ body: { id: 'x' }, headers: { 'x-alert-token': 's3cret', 'content-type': 'application/json' } });
    expect(await postJson(`${url}/down`, { id: 'y' }, null)).toEqual({ ok: false, status: 503, error: 'HTTP 503' });
    expect(got[1].headers['x-alert-token']).toBeUndefined();
    expect(await postJson('http://127.0.0.1:1/none', {}, null)).toMatchObject({ ok: false, status: null });
  });

  test('the n8n rehearsal sibling', () => {
    expect(testSiblingOf('https://n8n.example/webhook/msp/x')).toBe('https://n8n.example/webhook-test/msp/x');
    expect(testSiblingOf('https://hooks.example/abc')).toBeNull();
    expect(rehearsalUrls(['https://n8n.example/webhook/a', 'https://h.example/b'], [], true)).toEqual(['https://n8n.example/webhook-test/a']);
    expect(rehearsalUrls(['https://n8n.example/webhook/a'], ['https://t.example/t'], true)).toEqual(['https://t.example/t']);
    expect(rehearsalUrls(['https://n8n.example/webhook/a'], [], false)).toEqual([]);
    expect(urlLabel('https://n8n.example/webhook/msp/x?token=1')).toBe('n8n.example/webhook/msp…');
  });
});

describe('the memory', () => {
  test('read leniently; too old is looked at afresh, keeping what is undelivered', () => {
    expect(coerceState({ version: 2 })).toBeNull();
    const s = coerceState({ version: 1, primedAt: T(0), savedAt: T(0), open: [{ key: 'k', episode: 'e', mill: 'rmd', seenAt: T(0), silent: 'nope', told: [{ level: 1, at: T(0) }, { level: 'x' }] }, { key: 'bad' }] })!;
    expect(s.open).toEqual([{ key: 'k', episode: 'e', mill: 'rmd', seenAt: T(0), silent: null, told: [{ level: 1, at: T(0) }] }]);
    expect(s.outbox).toEqual([]);
    expect(resume(null, Date.parse(T(0))).state).toEqual(emptyState());
    expect(resume(s, Date.parse(T(60))).state.primedAt).toBe(T(0));
    const ob = { ...s, outbox: [{ event: { id: 'x' }, owed: ['u'], tries: 1, lastTriedAt: null, lastError: null }] } as never;
    const stale = resume(ob, Date.parse(T(0)) + MAX_GAP_MS + 1).state;
    expect(stale.primedAt).toBeNull();
    expect(stale.open).toEqual([]);
    expect(stale.outbox).toHaveLength(1);
  });
});
