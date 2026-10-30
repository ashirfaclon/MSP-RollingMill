# Mill Mimic: Improvement Spec

Feedback on the live Mill mimic (screenshots at 01:38 IST), turned into a list of changes with the design reasoning, the coding approach and the tools for each one.

**Current rating:** 7/10 against the benchmark. **Target:** 9+/10.

This spec keeps the philosophy of `process-twin-guide.md`: hand-written SVG, layout computed from the model, motion driven by measurements, and no diagramming library. Every change below extends that architecture. None of them replace it.

---

## 0. Summary

| # | Change | Priority | Visible effect | Files touched |
|---|---|---|---|---|
| C1 | Route model, diverter symbols, active path | **P0** | You can see which way steel is going | `mimicModel.ts`, `mimicDraw.tsx`, `MillProcessFlow.tsx`, `mimic.css` |
| C2 | Quality and staleness for each signal | **P0** | No false readings; frozen signals are greyed out | `mimicModel.ts`, live adapter, `mimicDraw.tsx` |
| C3 | Reference bars (actual vs rated or setpoint) | **P0** | A reading like "31 A" now has meaning | `mimicModel.ts`, `mimicDraw.tsx` |
| C4 | Trace whole paths, not single machines | **P0** | Clicking a stand lights its full route | `mimicModel.ts` (`litSet`) |
| C5 | Fix headers and label lanes | P1 | No duplicated headers, no crowded lanes | `MillProcessFlow.tsx` |
| C6 | Straight pass line | P1 | Removes the "step" artefact at every stand | `tools/mimic-render/scene.js`, manifest test |
| C7 | Clear period labels | P1 | "Since 09:00" is no longer ambiguous | `mimicModel.ts`, `Readout` |
| C8 | Lamp shapes, attached to machines | P1 | State is readable without colour | `mimicDraw.tsx` (`Lamp`) |
| C9 | Detail drawer with trend | P2 | Selecting a machine becomes a diagnostic tool | new `MimicDrawer.tsx`, history API |
| C10 | Material tracking | P2 | Shows where the bar is right now | new `materialTrack.ts`, `MillProcessFlow.tsx` |
| C11 | Hardened live transport and store | P2 | Smooth, honest updates; survives outages | new `liveStore.ts`, live adapter |

Do the P0 changes in order (C2 first, because C1, C3 and C4 all depend on signal quality), then P1, then P2.

---

## 1. Principles to keep

These are not up for debate. Every change must respect them.

1. **What moves is measured.** No animation without a fresh, plausible reading.
2. **`null` never becomes `0`.** Unknown, stale and zero are three different states, and each is drawn differently.
3. **Layout is derived from the model.** No hard-coded positions. A plant with one line or one stand must still draw correctly.
4. **Geometry comes from the renderer.** Nozzle positions come from the bake manifest, never typed by hand.
5. **No text inside a glyph.** Labels go in fixed lanes outside the machine.
6. **Ids belong to the plant.** The backend, the model, the drawing and the drawer all use the same string ids.

---

## 2. P0 changes

### C1. Route model, diverter symbols and active path

**Problem.** In the live view, Line 1's S stands are all off while its finishing stands run, and Line 2's S stands run while its finishing stands are off. The drawing doesn't explain how steel gets from a running section to the next running section. Either a crossover exists but isn't drawn, or the data is mismatched. In both cases the main goal of the twin fails: you can't tell which way the process is working.

**Design**
- Draw every diverter, switch or crossover as a **vector switch symbol**: a short pipe stub that visibly points down the selected branch. Use vector, not a baked sprite, because its state changes and has to recolour.
- **Active path:** every segment that is currently carrying steel, from infeed to exit, is drawn at full weight and saturation.
- **Inactive branches** fade to the "subordinate circuit" style from guide §7 (casing opacity around 0.16, thin line, no flow dashes).
- If any running machine is **not reachable** from the infeed along the active route, show a single amber banner: *"Route inconsistent: FS–TB2 running with no feed path."* Don't hide the contradiction. Showing it is the twin doing its job.

**Model**

```ts
// mimicModel.ts
export interface MimicNode {           // any machine: stand, shear, pinch roll, box…
  id: string;
  kind: string;                        // sprite key
  running: boolean | null;             // null = unknown
}

export interface MimicEdge {
  id: string;                          // pipe key, same as Pipe data-k
  from: string;                        // node id (or 'infeed')
  to: string;                          // node id (or 'exit')
  via?: { diverterId: string; position: string }; // only exists when diverter is in this position
}

export interface MimicDiverter {
  id: string;
  positions: string[];                 // e.g. ['line1', 'line2', 'cross']
  position: Signal<string>;            // live, with quality (see C2)
}

export interface MimicRouteModel {
  nodes: Record<string, MimicNode>;
  edges: MimicEdge[];
  diverters: Record<string, MimicDiverter>;
}
```

**Logic**

```ts
// An edge is "open" if it has no diverter, or its diverter is fresh and in that position.
const isOpen = (e: MimicEdge, m: MimicRouteModel) =>
  !e.via || (isFresh(m.diverters[e.via.diverterId].position) &&
             m.diverters[e.via.diverterId].position.value === e.via.position);

// Active path = open edges reachable from 'infeed' that pass only through running nodes.
export function activeEdges(m: MimicRouteModel): Set<string> {
  const out = new Set<string>();
  const queue = ['infeed'];
  const seen = new Set(queue);
  while (queue.length) {
    const at = queue.shift()!;
    for (const e of m.edges) {
      if (e.from !== at || !isOpen(e, m)) continue;
      const next = m.nodes[e.to];
      if (e.to !== 'exit' && next?.running !== true) continue;
      out.add(e.id);
      if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
    }
  }
  return out;
}

// Running machines the walk never reached = inconsistency to report.
export function orphanRunning(m: MimicRouteModel, active: Set<string>): string[] {
  const reached = new Set(m.edges.filter(e => active.has(e.id)).map(e => e.to));
  return Object.values(m.nodes).filter(n => n.running && !reached.has(n.id)).map(n => n.id);
}
```

**Drawing.** `Pipe` gets a `state: 'active' | 'idle' | 'unknown'` prop:
- `active` keeps today's behaviour (weight and speed from `flowOf`).
- `idle` uses the subordinate style.
- `unknown` (diverter signal stale) uses a dashed casing with no flow.

**Acceptance criteria**
- With the 01:38 data, the drawing either shows a crossover carrying Line 2's roughing output into the running finishing stands, or it shows the inconsistency banner.
- Toggling a diverter in the demo model reroutes the heavy path with no layout change.

**Libraries:** none. This is graph code plus SVG.

---

### C2. Quality and staleness for each signal

**Problem.** The global pill says "Live", but one stand's reading could be frozen and nobody would know. FS shows **−4 A with a green lamp**, which presents sensor offset or noise as a real reading.

**Design.** Each reading has four visual states:

| State | Condition | Drawing |
|---|---|---|
| **good** | fresh and plausible | normal ink, lamp by tone |
| **stale** | older than `staleAfterMs` | grey ink, age suffix: `24 A · 3m`; no flow animation |
| **suspect** | outside its plausible range | value shown with a `?` mark in amber; tooltip gives the reason; never feeds `load` |
| **missing** | `null` | `NA` (unchanged) |

For FS's −4 A: if a signal's sensor has a known offset band (for example ±5 A), values inside the band display as **`≈0 A`** with quality `good`. A value outside the band in the impossible direction is **`suspect`**. The value is never silently changed to 0, because principle 2 still applies: the raw value stays available in the tooltip.

**Model**

```ts
export type Quality = 'good' | 'stale' | 'suspect' | 'missing';

export interface Signal<T = number> {
  value: T | null;
  ts: number | null;         // source timestamp (ms epoch), not the browser's receive time
  quality: Quality;          // computed, never sent by the UI
}

export interface SignalSpec {
  staleAfterMs: number;      // e.g. 10_000 for currents, 60_000 for counters
  min?: number; max?: number;        // plausible range
  zeroBand?: number;                 // |v| ≤ zeroBand displays as ≈0
}

export function assess(raw: { value: number | null; ts: number | null },
                       spec: SignalSpec, now: number): Signal {
  if (raw.value === null || raw.ts === null) return { ...raw, quality: 'missing' };
  if (now - raw.ts > spec.staleAfterMs)      return { ...raw, quality: 'stale' };
  if ((spec.min !== undefined && raw.value < spec.min - (spec.zeroBand ?? 0)) ||
      (spec.max !== undefined && raw.value > spec.max))
    return { ...raw, quality: 'suspect' };
  return { ...raw, quality: 'good' };
}
```

**Rules**
- `flowOf()` and `load` accept **only `good` signals**. Anything else gives `null`, so nothing animates.
- `running` is derived from a `good` signal. Otherwise it is `null` (unknown), not `false`.
- The global pill becomes a summary: `Live · 01:38 IST` when every signal is good, `Live · 3 signals stale` otherwise. Clicking it lists the stale and suspect signals.
- `SignalSpec` values live in a **plant config file** (`millSignals.ts`), never in drawing code.

**Acceptance criteria**
- Freezing one stand's feed in the demo model greys out only that stand within `staleAfterMs`, and its flow stops.
- FS at −4 A displays `≈0 A` if a zero band is configured, or `−4 A ?` in amber if it isn't. In neither case does it show a green lamp with a plain number.

---

### C3. Reference bars: actual against rated or setpoint

**Problem.** "31 A" carries no meaning on its own. An operator can't tell whether that's idle or overloaded.

**Design**
- A thin horizontal bar (about 40×3 px) directly under each reading, in the readout lane. Fill = `load` (0..1). Colour = the machine's tone.
- If a **setpoint** signal exists, draw a 1 px tick at the setpoint. The gap between fill and tick is the deviation.
- At ≥ 90% of rated current, the bar turns `warn`. At ≥ 100% it turns `risk`. Thresholds come from config.
- No bar for `missing` or `suspect` signals. Bars for `stale` signals are drawn at 30% opacity.

**Model.** Add rated and setpoint values to the node:

```ts
export interface MimicStand extends MimicNode {
  current: Signal;           // A
  ratedCurrent: number;      // from plant config
  setpoint?: Signal;         // optional
  load: number | null;       // = current.good ? clamp01(current.value / ratedCurrent) : null
}
```

**Drawing.** Add a new `RefBar` primitive to `mimicDraw.tsx`. It stays process-agnostic, taking `load`, `setpoint`, `tone` and `quality`.

**Acceptance criteria:** at one glance, the most-loaded stand on Line 2 is identifiable without reading numbers.

---

### C4. Trace whole paths, not single machines

**Problem.** Selecting PRI lights only PRI and its own pipe stubs. The operator's question is *where does the bar come from and where does it go*.

**Logic.** Change `litSet` to walk the graph in both directions along open edges:

```ts
export function litSet(m: MimicRouteModel, sel: string | null): Set<string> | null {
  if (!sel) return null;
  const lit = new Set<string>([sel]);
  const walk = (start: string, dir: 'up' | 'down') => {
    const stack = [start];
    while (stack.length) {
      const at = stack.pop()!;
      for (const e of m.edges) {
        if (!isOpen(e, m)) continue;
        const [a, b] = dir === 'down' ? [e.from, e.to] : [e.to, e.from];
        if (a !== at || lit.has(e.id)) continue;
        lit.add(e.id); lit.add(b); stack.push(b);
      }
    }
  };
  walk(sel, 'up'); walk(sel, 'down');
  return lit;
}
```

**Design**
- Selected machine: full colour plus a 2 px selection ring in `--mx-ink`.
- Upstream and downstream path: full colour.
- Everything else: dim to 0.25. That's slightly stronger than today's dimming, which currently leaves labels like "−4 A" readable enough to distract.
- `Esc` or clicking empty space clears the selection.

**Acceptance criteria:** selecting PRI lights infeed → (route) → FS → PRI → PR2 → TB1 → TB2 → exit.

---

## 3. P1 changes

### C5. Headers and label lanes

**Problem**
- The same header text ("Route / Diverter · 6 of 14 on") appears on both rows with a **combined** count.
- The second header row crowds the `LINE 1 · 4.7 M/S` label.
- The Line 1 speed sits under stands that are all off.

**Change**
- **One header per row, counting only that row:** `LINE 1 · ROUGHING · 0 OF 8 ON`, `LINE 1 · FINISHING · 5 OF 5 ON`. Put the plant-wide totals once, in the panel title bar.
- **Line speed** moves to the section it's measured at. If it's measured at the finishing exit, put it at the right end of the row, in the exit lane.
- **Lane plan for each row** (top to bottom, fixed heights, nothing shares a lane):
  `header (14) → name (14) → machine → reading (16) → ref bar (6) → row meta (12)`
  The row gap is computed so that `row meta` of row 1 and `header` of row 2 never touch (a minimum of 18 px between them).

**Acceptance criteria:** no two text boxes intersect at any panel width from 1100 to 1920 px. Add this as a test (see §6).

### C6. Straight pass line

**Problem.** The orange line steps up and down at every stand. A mill's pass line is straight, so the steps look like a defect.

**Cause:** the `entry` and `exit` nozzle y-fractions differ between sprites, or across sprite kinds.

**Change**
1. In `tools/mimic-render/scene.js`, put every stand's entry and exit nozzles at the same height above the floor (the pass-line height, in metres). Keep it the same across all stand kinds.
2. Re-run `node render.cjs` and commit the PNGs and `mimicSprites.json`.
3. Add a manifest test that fails the build if any connected entry and exit nozzles differ in projected y by more than 0.5 px at the drawn size.

**Rule:** never fix this in `MillProcessFlow.tsx` with offsets. Geometry comes from the renderer (principle 4).

### C7. Clear period labels

**Problem.** "Since 09:00 IST" shown at 01:38 is ambiguous, because it was 16 hours ago.

**Change.** Period labels come from a `period` object in the model, not a hard-coded string:

```ts
period: { label: 'Shift A' | 'Day' | string; start: number /* ms */ }
```

Display rules:
- Same calendar day: `SINCE 09:00 IST`.
- Earlier day: `SINCE 29 OCT 09:00 IST`.
- If shift names are known: `SHIFT C · SINCE 22:00`.

Accumulated values (billets, MT) never get a tone lamp and use the `--mx-ink-2` weight, so they can't be mistaken for live readings.

### C8. Lamp shapes, attached to machines

**Problem.** The lamps float up and to the right, detached from their machines, and state is shown by colour alone.

**Change**
- Anchor the lamp to the sprite's top-right corner using `fit()` (the machine's real box), not the slot box.
- Give each state its own shape (12 px, SVG):

| State | Shape | Colour token |
|---|---|---|
| running | filled circle | `--mx-ok` |
| stopped | hollow circle | `--mx-ink-3` |
| warning | triangle | `--mx-warn` |
| fault | square, and the whole machine turns red (guide §10.3) | `--mx-risk` |
| unknown | dashed hollow circle | `--mx-ink-3` |

- Give each lamp an `aria-label` (for example "PRI running, 2 amps").

---

## 4. P2 changes

### C9. Detail drawer with trend

**Design.** Selecting a machine opens a right-hand drawer about 320 px wide. The mimic stays visible and traced.
- Header: name, state lamp, quality, last update.
- **Trend:** the last 30 minutes of the main signal (current), with setpoint and rated lines overlaid; line speed as a secondary series if relevant.
- Events: the last 5 state changes (start, stop, fault) with times.
- The drawer is keyed by the plant id, the same string as `data-k` and `lines[]`.

**Library: [uPlot](https://github.com/leeoniya/uPlot)** (MIT, very small, built for dense time series). Use it instead of Recharts or ECharts, because it is tiny, fast at thousands of points, and draws to canvas so it won't stress React. Wrap it in a roughly 40-line `useUPlot(ref, data, opts)` hook rather than adding a React wrapper package.

**Backend:** `GET /api/mill/history?ids=PRI.current,PRI.setpoint&from=…&to=…&step=5s`. Downsample on the server (min/max per bucket) so the drawer never fetches more than about 1,000 points per series.

### C10. Material tracking

**Design.** A small glowing bar glyph (in the steel colour token) shows the **head-end** of each bar moving along the active path. Stands currently holding steel get a subtle inner glow (a sprite variant like the guide's `-fire` approach, or a CSS overlay *inside* the sprite's alpha mask).

**Logic (estimation, if there's no tracking signal)**
1. A stand is "loaded" when its current rises above its idle band (C2 `zeroBand` plus margin) and is `good`.
2. The head-end is in the **furthest loaded stand** along the active path, and is interpolated toward the next stand using the line speed and the known inter-stand distance from config.
3. When the next stand loads, snap to it. That corrects drift.
4. If the speed signal isn't `good`, show the stand-level occupancy only, with no interpolation (principle 1).

If the plant has a **real tracking signal** (HMD or material tracking from the L2 system), use that instead and skip the estimation.

**Performance:** the glyph position is written straight to the SVG element in a `requestAnimationFrame` loop via a ref (`el.setAttribute('transform', …)`). It **never** goes through React state, because per-frame React renders are the main performance trap.

### C11. Hardened live transport and store

**Approach**

```
PLC / SCADA ──► backend gateway ──► WebSocket (or SSE) ──► liveStore ──► React (≤ 4 Hz)
                 (auth, TLS,           JSON deltas:            per-signal          snapshot via
                  downsampling)        {id, v, ts}             Signal objects      useSyncExternalStore
```

- **Transport:** browser ↔ **your backend gateway** over WebSocket (or Server-Sent Events if the stream only goes one way). Use **MQTT.js** only if the broker exposes MQTT-over-WebSocket *and* sits behind your auth. Don't connect browsers straight to a plant broker, because browser MQTT can't do mutual TLS.
- **Message shape:** deltas `{ id: 'L2.S3.current', v: 17.2, ts: 1793300280000 }`. Use source timestamps, not the time the message was received.
- **Reconnect:** exponential backoff (1 s → 30 s cap) with jitter. On reconnect, request a full snapshot before applying deltas again.
- **Store:** a plain TypeScript module (`liveStore.ts`) holding `Map<id, Signal>`. Raw deltas are applied as they arrive. A 250 ms timer re-runs `assess()` (so staleness kicks in even when no messages arrive) and publishes a new immutable snapshot.
- **React binding:** `useSyncExternalStore` (built into React 18). **No state-management library** is needed, which matches the guide's "no state manager" rule.
- **Twin state backend (optional):** if you need desired vs reported values, audit history or a twin API for other consumers, **Eclipse Ditto** (EPL-2.0) models exactly that. If your current backend already holds the data, adopt the same shape (`reported`, `desired`, `ts`) and skip Ditto.

---

## 5. Tools and libraries

### Keep (from the guide)

| Tool | Role |
|---|---|
| React 18 + TypeScript 5 + Vite 5 | component, model contract, build |
| Hand-written SVG and CSS custom properties | the drawing and theming |
| Three.js (offline) | sprite baking |
| playwright-core (offline) | driving the bake |

### Add

| Tool | Role | Why this one |
|---|---|---|
| **uPlot** | drawer trends (C9) | very small, fast with dense time series, canvas-rendered |
| **Vitest** | unit tests for `activeEdges`, `litSet`, `assess`, layout | native to Vite, no extra config |
| **@playwright/test** | visual regression and lane-collision tests (§6) | already using Playwright for the bake |
| **MQTT.js** *(only if needed)* | broker over WebSocket | standard browser MQTT client; only behind your own auth |
| **Eclipse Ditto** *(optional, backend)* | reported/desired twin state, history, API | only if your backend doesn't already provide it |

### Avoid

| Tool | Why |
|---|---|
| React Flow, GoJS, mxGraph | built for user-arranged diagrams; you'd fight the layout engine (guide §1) |
| react-konva or @pixi/react | not needed at around 40 machines. Revisit only if you go past a few hundred animated entities or need free zoom across a whole site |
| Zustand, Redux | `useSyncExternalStore` covers the need |
| Recharts or other SVG chart libraries for trends | too heavy at high point counts inside a live view |
| tldraw | needs a license key in production |

---

## 6. Testing

### Scenario fixtures

Add these next to the demo model (`millDemoModels.ts`). Every one must draw correctly in both themes.

| Fixture | Checks |
|---|---|
| `allNull` | every reading NA, no animation, a single empty-state banner (not one per machine) |
| `allStopped` | all grey, no flow, lamps hollow |
| `singleStand` | layout holds with one machine per row |
| `liveCrossover` | the 01:38 case: active path crosses lines correctly |
| `routeInconsistent` | finishing running with no feed path, so the amber banner shows |
| `oneStale` | one stand frozen: only that stand greys out |
| `negativeCurrent` | FS at −4 A shows `≈0` or `?`, never a green plain number |
| `overload` | one stand at 105% rated: red bar, warn/risk tone |
| `previousDayPeriod` | period label includes the date |

### Automated tests

- **Unit (Vitest):** `activeEdges`, `orphanRunning`, `litSet`, `assess`, `flowOf` (only accepts `good`), period label formatting.
- **Geometry (Vitest):** manifest test that connected nozzles share a pass-line y within 0.5 px (C6).
- **Lane collision (Playwright):** render each fixture at 1100, 1440 and 1920 px wide; collect `getBBox()` of every text node; fail if any two intersect.
- **Visual regression (Playwright):** screenshot every fixture in light and dark themes; diff against committed baselines.
- **Reduced motion:** with `prefers-reduced-motion: reduce` emulated, no element has a running animation, and the drawing stays readable (line weight still encodes load).

---

## 7. Accessibility

- The root `<svg>` gets `role="img"` and an `aria-label` summary that updates at most once every 10 s, for example: "Mill: Line 2 roughing running, Line 1 finishing running, 3 signals stale."
- Each machine group gets `role="button"`, `tabindex="0"`, an `aria-label` with name, state and reading, and opens on Enter or Space.
- Lamp shapes (C8) mean no state depends on colour alone.
- Text contrast is at least 4.5:1 on both themes. Check `--mx-ink-3` on the light panel in particular.

---

## 8. Performance budget

| Item | Budget |
|---|---|
| React commits from live data | ≤ 4 per second |
| Per-frame work | material-track glyph transforms only (via ref) plus CSS dash animation |
| Frame time on a mid-range laptop, all lines running | < 4 ms scripting, 60 fps |
| Drawer trend | ≤ 1,000 points per series after server downsampling |
| Sprite payload | baked at 2× for crisp HiDPI; WebP with PNG fallback; < 1.5 MB total for both themes |

---

## 9. Rollout order

1. **C2** signal quality and the live store skeleton (C11 store, without transport changes).
2. **C1** route model and active path. Confirm the crossover question with the plant first (see §10).
3. **C3** reference bars, then **C4** path tracing.
4. **C5–C8** layout, geometry and label fixes. Re-bake sprites for C6.
5. Add the fixtures and automated tests from §6. Lock in the baselines.
6. **C9** drawer and trend, then **C10** material tracking.
7. **C11** transport hardening (reconnect, snapshot on reconnect, gateway auth).

---

## 10. Questions for the plant team before starting C1, C3 and C10

1. Is there a **crossover** between Line 2's S stands and Line 1's finishing section? Which signal gives the diverter position?
2. What are the **S** units: stands, pinch rolls or diverter positions? The heading says "Route / Diverter" but the glyphs are stands.
3. Does **FS current** have a known zero offset? What is its plausible range?
4. **Rated current** for each stand, and whether current or speed **setpoints** are available as signals.
5. Which section is **line speed** measured at?
6. **Shift start times**, for period labels.
7. Inter-stand **distances**, and whether an L2 **material tracking** signal exists (it would replace the C10 estimate).
