# Design Handover — MSP Control-Room Dashboard System

**Audience:** a frontend engineer rebuilding this look and behaviour in a different
project. This describes the design system as it is actually shipped in
`pellet-frontend/`, not as it was intended. Every rule below is enforced somewhere in
the code and the file is named so you can lift it.

---

## 1. What this design system is

A **dark control-room dashboard language** with a daylight/print theme that flips from
the same token set. It was built for plant screens read at a distance, where the failure
mode that matters most is *a number that looks confident and isn't*.

Three ideas carry the whole system. Port these or the rest is cosmetics:

1. **Tokens own the skin; screens own layout only.** `styles/theme.css` defines every
   colour, radius and shadow plus the shared primitives. Screen stylesheets
   (`cpp.css`, `management.css`, …) contain grid and spacing and nothing else. That is
   what makes the light theme a single `:root[data-theme="light"]` block instead of a
   second design system.
2. **Honesty is a visual primitive.** Every value carries a badge saying how it was
   obtained (Live / Calc / Partial / Check / NA / Demo). `NA` is a *claim* — "we looked
   and there is no source" — so it is never shown while a request is still in flight.
3. **The number is the brightest thing in its row.** Labels recede, values advance.
   This is the single rule that makes dense tables readable, and it is restated in the
   CSS wherever specificity would break it.

---

## 2. Tokens

All in `pellet-frontend/src/styles/theme.css`. Dark is `:root`, light is
`:root[data-theme="light"]` — same names, daylight values.

### Field / surfaces
| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg-0` | `#04101f` | `#dfe6f0` | page ground |
| `--bg-1` | `#071a2e` | `#eaf0f8` | secondary ground |
| `--panel` | `#0a1e35` | `#fbfcfe` | card surface |
| `--panel-2` | `#0d2742` | `#f1f5fb` | inset / table head / controls |
| `--panel-3` | `#123253` | `#e4ecf6` | hover, scrollbar thumb |
| `--panel-hi` | `#16405f` | `#d6e3f2` | selected segment |

The body ground is two radial gradients over `--bg-0`, `background-attachment: fixed`,
so the page has a light source and panels read as lifted off it.

> **Light-theme rationale worth keeping.** Pure white cards on a near-white page were
> the glare problem: maximum brightness, minimum separation. The ground drops to
> `#dfe6f0` and the card lifts to an off-white, so it reads as paper; the *border*
> carries the card edge, not brightness. That is why light borders are firmer than a
> naive tint (`--border` at `#bacbde`).

### Lines
`--border` `#1b3f63` · `--border-soft` `#143352` (in-card row separators) ·
`--border-hi` `#24557f` (hover/emphasis).

### Type
`--text` `#eaf3fd` · `--text-2` `#a8c2dc` · `--text-3` `#7f9cba` ·
`--muted` `#8fabc8` · `--muted-2` `#6b88a6` · `--muted-3` `#55738f`.

In light theme all three muted tones were darkened to clear **4.5:1 on a card** — the
smallest labels in this system are 9–9.5 px and a light-on-dark tint does not survive
being inverted.

### Status
| Token | Dark | Light | Meaning |
|---|---|---|---|
| `--ok` | `#2fe07a` | `#14803c` | in band / on target |
| `--warn` | `#f7b731` | `#9a6a00` | approaching a limit |
| `--risk` | `#ff5252` | `#c62828` | past a limit |
| `--info` | `#38bdf8` | `#0b6fb8` | derived / computed |
| `--na` | `#7b95b0` | `#5e7288` | no source |
| `--demo` | `#b78bfa` | `#6d28d9` | illustrative, not plant data |

Each has a `-dim` companion (the same hue at 0.10–0.15 alpha) used for chip and badge
fills. Accents: `--accent` `#4da3ff`, `--accent-2` `#22d3ee`, `--gold` `#ffc84a`,
`--violet` `#a78bfa`.

### Chart series
`--s-actual` (green) · `--s-expected` (blue) · `--s-pred` (amber) · `--s-alt` (teal).
Mirrored in JS as `SERIES` in `components/Chart.tsx` — see §6.

### Geometry
`--radius: 10px` · `--radius-sm: 7px` ·
`--shadow: 0 1px 0 rgba(255,255,255,.03) inset, 0 8px 24px rgba(0,0,0,.34)`.
Light shadow is tight and pale (`0 1px 2px` / `0 6px 18px` at 5–7 % navy) because a heavy
black shadow on paper is a grey smudge, not depth.

---

## 3. Typography

Font stack: `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
**Root size is `12.5px`** — this is an information-density design; everything below is
relative to that being the normal reading size.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Page H1 (`.page-h1`) | 21px | 800 | −0.3px |
| KPI card value (`.cpp-card-value`) | 30px → 25px under 1500px | 800 | −0.6px |
| Statbox value | 19px | 800 | — |
| Panel title | 12.5px | 700 | 0.2px |
| Card title (`.cpp-card-title`) | 12px | 700 | 0.1px |
| Table cell | 11.5px | 400 | — |
| Panel sub / page meta | 10.5–11px | 500–600 | — |
| Section label (`.section-label`) | 11px | 800 | **1.4px, uppercase** |
| Table header | 9.5px | 800 | 0.7px, uppercase |
| Statbox / footer labels | 9.5–10px | 700 | 0.7px, uppercase |

`.num { font-variant-numeric: tabular-nums; letter-spacing: -0.2px; }` — put it on every
figure so columns align and a value doesn't jitter as it updates.

**The house label/value convention**, restated in three stylesheets because it is the
thing that breaks first:

```
LABEL   muted, small, uppercase, heavy    →  var(--muted-2), 9.5–11px, 700–800
VALUE   --text or a v-* status tone       →  the brightest thing in the row
```

Card titles on the CPP headline strip are the deliberate exception: sentence case at
12px, because those six names are *read*, not scanned.

---

## 4. Primitives (all in `theme.css`)

### Panel — the standard framed card
```tsx
<Panel title="Turbine status" index={2} sub="live" right={<DataBadge status="ready" />}>
  …
</Panel>
```
`components/Panel.tsx` (33 lines). Classes: `.panel`, `.panel-head`, `.panel-title`,
`.panel-title .idx` (numbered circle badge), `.panel-sub`, `.panel-body`,
`.panel-body.tight`. Header has a `.spacer` so the `right` slot always sits flush right.

### Chips — `.chip--ok | warn | risk | info | na`
Pill, 10.5px/700, tinted fill + 32–34 % alpha border in the same hue.

### Honesty badges — `.dbadge--live | calc | partial | unreliable | na | demo`
9.5px, 800, uppercase, 4px radius. Rendered by `components/DataBadge.tsx`:

| `KpiStatus` | derived | Badge | Label | Title text |
|---|---|---|---|---|
| `ready` | no | `live` | **Live** | Measured plant tag |
| `ready` | yes | `calc` | **Calc** | Derived from measured values |
| `partial` | — | `calc` | **Calc** | — |
| *(explicit)* | — | `partial` | **Partial** | Computed from the inputs available so far |
| `unreliable` | — | `unreliable` | **Check** | Sensor frozen or saturated |
| `awaiting` | — | `na` | **NA** | Awaiting data |
| *(demo mode)* | — | `demo` | **Demo** | Illustrative value — not plant data |

Demo mode relabels **everything** to Demo unless an explicit `kind` is passed (the legend
needs to show every kind). This is non-negotiable if you port the demo/live switch.

### Priority pills — `.pill--critical | warning | data | idle | na | p1 | p2 | p3 | cleared`
Note `--cleared`: a recovered alert is green but the *softest* green on the page, because
the row is history and must not compete with a live alert.

### Trend arrows — `.trend--up | down | flat | good`
`up` is red and `down` is blue by default — direction is not a verdict; a rising
temperature is bad. Use `--good` to override where higher genuinely is better.
Glyphs in `lib/format.ts`: `TREND_GLYPH = { up:'↑', down:'↓', flat:'→' }`.

### `table.grid`
Sticky uppercase header on `--panel-2`, rows separated by `--border-soft`, last row
borderless, `tr.clickable:hover` tints at 7 % accent, `tr.idle` at 0.55 opacity.
Variants `.head-risk` / `.head-info` recolour the header band.

> **Two specificity traps, already solved — keep the fixes.**
> `table.grid td` sets `--text-2` at (0,0,1,2), which out-ranks a bare `.v-ok` at
> (0,0,1,0), so every value inside a table silently rendered dim. All `v-*` classes are
> **restated** as `table.grid td.v-ok { … }`. And `table.grid td.num` deliberately sets
> *no* colour — it would out-specify the value tones and flatten the hierarchy.

### Value colour classes
`.v-ok .v-warn .v-risk .v-info .v-na .v-gold` and **`.v-val`** = primary text colour.
`valueClass(value, tone)` in `lib/format.ts` is the only thing that should pick one:
`null → v-na`, tone → that tone, **no tone → `v-val`**. Without `v-val` a live reading
with no verdict falls through to the muted NA colour and a real 908.4 MT looks blank.

### Statbox
`.statbox` + `.label` + `.value` + `.value .u` — the readouts that sit beside a chart.

### Empty state — `.chart-empty`
Dashed border, 45° hatch at 1.4 % white, centred muted copy. A chart with nothing to draw
renders **this**, never an empty grid that could read as a flat line.

### Skeletons — `.skel` + `--num | --num-lg | --text | --cell | --block`
`components/Skel.tsx`. The third state beside a reading and an NA:

```
loading   nobody has looked yet      → Skel
0         looked, and it is none     → 0
NA        there is no source at all  → NA
```

One `skel-pulse` keyframe (1.5 s) for the whole app so every screen breathes together.
Widths are deliberately uneven — a column of identical bars reads as a rendering fault.
`role="status" aria-busy="true"`. Honours `prefers-reduced-motion`.
**Only for the first load**: the test is `loading && !payload`, never `loading` alone, or
every poll greys the page out.

### The ⓘ affordance — `.infodot` / `components/InfoDot.tsx`
15 px circle, serif italic `i`. Sits at 0.55 opacity until its card is hovered, then 1.
Clicking opens the same drawer the card does — the formula is never hidden behind a guess
about what is clickable.

---

## 5. Component inventory

Copy these more or less verbatim; they have no project-specific logic.

| File | What it gives you |
|---|---|
| `components/Panel.tsx` | the framed card |
| `components/DataBadge.tsx` | honesty badge + `kindForStatus` |
| `components/Chart.tsx` | **the whole chart layer** — `TrendChart`, `Sparkline`, `BridgeChart`, `baseOptions`, `axisStyle`, `currentSkin`, `exportingOptions`, `SERIES`, `seriesPalette` |
| `components/ChartMenu.tsx` | export/full-screen menu, rendered in the panel header |
| `components/Skel.tsx` | loading placeholder |
| `components/InfoDot.tsx` | ⓘ formula affordance |
| `components/Ring.tsx` | health dial (SVG, no dependency) |
| `components/Highlight.tsx` | lifts numbers out of prose |
| `components/drawer.tsx` | `DrawerProvider` + `useDrawer()` context |
| `components/KpiDrawer.tsx` + `drawer.css` | the `kd-*` drawer chrome |
| `components/TopBar.tsx` + `topbar.css` | app bar: brand, tabs, mode/theme segments, pickers, connection dot, refresh |
| `components/DateRangePicker.tsx` + `daterange.css` | duration presets + custom range |
| `cpp/CppCard.tsx` | the KPI headline card |
| `cpp/CppKpiDrawer.tsx` | card → drawer drill-down (reuses `drawer.css`) |
| `cpp/CppIcon.tsx` | 20 hand-drawn SVG icons |
| `cpp/CppCharts.tsx` | `DonutChart`, waterfall, grade bars, `tonePalette()` |
| `cpp/num.ts` | `fixed` / `fixedSigned` |
| `lib/format.ts` | `fmt`, `fmtUnit`, `fmtSigned`, `fmtPct`, `fmtTime`, `fmtDate`, `toneClass`, `valueClass`, `statusTone` |
| `util/hint.ts` | truncates a tooltip to its first sentence |
| `state/globalSel.ts` | the global selection store (see §9) |
| `state/mode.ts` | `useIsDemo()`, `useTheme()` |

### The KPI card — `CppCard`

Anatomy: icon · title · value+unit · footer (target / deviation, or a one-line note) ·
sparkline that absorbs spare height.

- **The card edge carries the verdict**, not the fill: `border-top-width: 2px` in the
  tone colour, rest of the border in the same hue at ~40 % alpha. Legible across a
  control room without repainting the card.
- **A card with a target prints a plain number and lets the deviation carry the colour.**
  Six red headline figures say "everything is broken" when the truth is "everything is a
  little under target".
- **A card that *is* a deviation** (`isDeviation: true`) signs its value and takes the
  tone itself.
- **A measured value with no approved target takes the neutral edge.** Green would be the
  screen asserting "on target" against a target nobody signed off. This is `metricTone()`
  and it is worth copying exactly.
- `variant="flush"` merges the card into the top of a panel body: it hands back border,
  radius, shadow and ground and keeps only the tone edge and the behaviour. The
  difference is entirely in CSS.
- Sizing goes through a custom property (`--cpp-card-value`) **not** a descendant
  selector, so the `@media` step-downs keep ownership of the rule.
- `min-height: clamp(126px, 15vh, 196px)` — past ~200 px the card is mostly sparkline.

### The Ring
Accepts `number | string | null`. Anything non-numeric draws a **dashed** empty track with
a short label inside — a full ring would read as 100 %, and `Number('DATA INVALID')`
prints NaN. Long state text shrinks (8/10/13 px by length).

### Iconography — `CppIcon`
32×32 viewBox, top-left light source, shaded body, rim highlight — reads as a solid object
at 26 px and takes its card's status colour. Ids: `gauge bolt bars flame fan shield-check
steam shield-alert warn-triangle gear database turbine boiler thermometer vacuum o2 trend
stopwatch clipboard expand`.

> **Gradient ids must be per-instance**, `` `cppi-${id}-${useId()}` ``. SVG ids are
> document-global: two gauges in different colours shared one `<linearGradient>` and
> whichever rendered first painted both.

Deliberately not emoji — an emoji can't inherit a status colour and renders differently
on every OS.

---

## 6. The chart layer

Highcharts `^12`, with `exporting`, `export-data`, **`offline-exporting`** and
`full-screen` modules. One theme for every chart in the app.

**Offline exporting is a requirement, not an optimisation.** The standard exporting module
POSTs the chart to Highcharts' public export server. Behind a plant VPN that request hangs
*and* it sends process data off-site. `fallbackToExportServer: false` + the offline module
rasterises in the browser. Keep this in any industrial deployment.

Other decisions worth carrying:

- **Plant time, globally:** `Highcharts.setOptions({ time: { timezone: 'Asia/Kolkata' } })`.
  An operator comparing a chart to the DCS clock must not have to translate. Swap the zone,
  keep the principle.
- **Theme-aware skins:** `DARK_SKIN` / `LIGHT_SKIN` read at draw time from
  `document.documentElement.dataset.theme`. Series colours are repainted through a
  `LIGHT_INK` map so call sites can keep importing `SERIES` constants and still follow the
  theme. `surface` is painted into full-screen and exported images — a transparent PNG
  reads as black in most viewers.
- **Tooltips render `outside: true`** (into `document.body`) so a chart in a panel, drawer
  or table cell isn't clipped by an ancestor's `overflow`. Highcharts gives that container
  `z-index: 3`; one rule in `theme.css` lifts
  `.highcharts-tooltip-container { z-index: 9100 !important; }` above every overlay. A
  tooltip is transient and pointer-transparent, so it can't trap anything.
  Inside full screen `outside` is turned **off** via `fullscreenOpen`/`fullscreenClose` —
  the browser only composites the fullscreen element's own subtree.
- **`snap: 30`** (default 10): a daily-sampled lab series puts a dozen points across a
  week and the default made each one a pixel-hunt.
- **Hover stem**, not a crosshair: a dotted line drawn from the hovered point down to the
  axis, in the series colour. A crosshair says "somewhere on this vertical"; the stem ties
  the tooltip to the mark. Drawn on the renderer, so it must be destroyed explicitly on
  chart teardown or it stays painted over the next plot.
- **Markers appear automatically below 90 points** (`MARKER_LIMIT`) and are suppressed
  above — hundreds of markers read as noise. `markers` forces either way.
- **Spec bands:** shaded `plotBand` plus explicit dashed **LCL/UCL** plot lines, because a
  one-sided limit ("TI ≥ 90 %") draws no band at all and the limit would be invisible.
  Labels sit at opposite ends and opposite sides so they never collide.
- **Zone grading** (`bandZones`): below floor = cool blue, in band = green, past warn =
  amber, past ceiling = red — *running cold is not running hot*. `twoTone` collapses it to
  pass/fail. A zoned series must not carry an explicit `fillColor` (use `fillOpacity`) or
  the zones only reach the stroke.
- **Structure vs data signatures.** The chart rebuilds on a `sig` of *structure only*;
  point data lands through `series.setData(…, false, true, true)` in a second effect. A
  rebuild on every poll made the whole plot blink.
- **`height="fill"`** — pass `undefined` to Highcharts so it measures the container. The
  host is `flex: 1 1 0` with `min-height`. **This needs the `.hc-fill` fix:**

  ```css
  .hc-fill { position: relative; flex: 1 1 0; min-height: 170px; overflow: hidden; }
  .hc-fill > .highcharts-container { position: absolute !important; inset: 0; }
  ```

  Highcharts v12 renders its container ~3 px taller than asked and watches it with a
  ResizeObserver. Anywhere the parent chain is content-sized, those 3 px push the parent
  out, the observer fires, the chart grows again — the page extends without bound. Taking
  the generated container out of flow breaks the cycle at the source.
- **The export menu lives in the panel header**, not in the plot: `contextButton.enabled:
  false` and `ChartMenu` drives the chart through its public API. Anything drawn inside the
  chart box either covers the plot or steals height from it. Sparklines disable exporting
  entirely — loading the module turns the button on for every chart by default, which put
  a hamburger inside a 26 px trend cell.

`tonePalette()` in `CppCharts.tsx` splits `warn` into **orange (`poor`)** and **amber
(`moderate`)** for four-level health grading — the CSS tokens only have one warn, and two
identical oranges collapse the middle of the scale.

---

## 7. Layout language

```css
.appshell { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }
.app-main { flex: 1; min-height: 0; overflow-y: auto;
            padding: 14px 16px 26px; max-width: 1860px; margin: 0 auto; }
```

**A definite height, not `min-height`.** With `min-height` every height below becomes
content-derived, so anything that measures itself and grows pushes the page down on each
pass. `100dvh` first so a mobile URL bar doesn't crop it.

**Filling the viewport without magic numbers:**
```css
.app-main:has(.cpp-row) { display: flex; flex-direction: column; min-height: 0; }
.app-main > .cpp-row:last-of-type { flex: 1; min-height: 0; }
```
No subtracted header height — that would be wrong the moment a banner appeared or wrapped.

**Grids:** `.cpp-strip` is `repeat(var(--cpp-cols, 6), minmax(0, 1fr))` with a 10px gap —
set the column count from the call site. `.cpp-groups` splits live readings from
shift averages as two **equal** columns (not auto-sized), so every card keeps the same
width; the group heading changes what the numbers mean, not how they are read. Group
headings are a centred label between two fading rules, with a status dot tinted by
`--group-tone`.

**Breakpoints:** `1500px` steps the card value down 30 → 25 px and the title 12 → 11 px
(six cards on a 1280 screen leaves ~200 px each and the value+unit must stay on one line).
`1400px` hides the top-bar tab sub-labels and the connection timestamp.

**Panel spacing rhythm:** head `9px 13px`, body `11px 13px 13px`, tight body `6px 8px 8px`,
grid gap 10px, row gap 12px, table cells `7px 9px`.

---

## 8. Interaction & motion

- **Drawer, not modal.** A modal covers the dashboard to show one chart and must be
  dismissed before anything else can be read. The drawer opens beside the screen, so the
  number stays next to the plant it came from and there is room for what a person asks
  next: how it was computed, what it is judged against, how it has moved. Both the pellet
  `KpiDrawer` and `CppKpiDrawer` share the **same `kd-*` stylesheet** deliberately — the
  data differs, the chrome must not.
- **Escape closes every overlay.** Stacking order in use: KPI drawer 41, expanded mimic
  240, sensor menu 9000, chart tooltip 9100.
- **`title` attributes are hints, not derivations.** `hint()` cuts to the first *sentence*
  (max 96 chars, cutting on a sentence-ending full stop so "179.9 TPH" never splits at the
  decimal). A native tooltip has no max width; an eight-line paragraph becomes a slab over
  the panel the reader was pointing at. The full text is one click away.
- **Transitions:** 120–130 ms on colour/border/transform, 260 ms chart animation,
  420 ms ring sweep, 900 ms refresh spin, 1.5 s skeleton pulse.
- **Hover:** cards lift `translateY(-1px)` and their border goes to full tone; rows tint
  at 6–7 % accent.
- **Accessibility carried through:** `aria-current="page"` on the active tab,
  `aria-pressed` on segmented buttons, `role="group"` + `aria-label` on segments,
  `aria-busy` on skeletons, `:focus-visible { outline: 2px solid var(--accent) }` on the
  infodot, `aria-hidden` on decorative SVG.

---

## 9. State & selection

`state/globalSel.ts` — a small module store on `useSyncExternalStore` + `localStorage`.
No state library. Worth lifting whole:

- `GlobalSel` = `{ plant, cppUnit, duration, customFromMs, customToMs, shift, shiftScope, unit, mode, theme }`.
- `DurationPreset` — 13 presets from `current_shift` through `previous_year`, with
  `DURATION_LABELS`.
- `resolveRange(sel, nowMs, view)` is a **pure function** split out from the hook so the
  rules are testable. The rules that matter:
  - A live preset resolves to `fromMs: null` — sending a moving "now" in the URL changes
    the fetch identity every tick and forces a reload with a loading state.
  - **A shift may only narrow a single plant day.** Filtering a month to "Shift A" blends
    30 different shifts into one number, so the picker disables itself.
  - **Explicit clock times win outright.** Times the reader typed are the most specific
    thing on screen; a shift must not replace them.
  - A per-view override exists because the preset is global and persisted — a "Current
    Week" chosen on one screen must not follow the reader to a screen headed "Today".
- `useResolvedRange()` quantises "now" to the minute — and to **5 minutes** for
  `current_month` / `current_year`, where a re-query per minute costs seconds of historian
  time to redraw a figure nobody can tell apart. The label is built from the same quantised
  instant, so the window the screen *names* is the window it asked for.

Theme is `document.documentElement.dataset.theme`; `useTheme()` is what forces charts to
redraw on a flip.

---

## 10. Number & text formatting

`lib/format.ts` and `cpp/num.ts`. Two formatters on purpose:

- `fmt()` — locale `en-IN`, **drops the decimal on a whole number**. Right for tonnages.
  Also renders backend state enums (`DATA_ISSUE`) as words. `null → 'NA'` everywhere.
- `fixed(v, dp)` / `fixedSigned(v, dp)` — **always honours the decimal places**. Right for
  instrument panels: `48.0 TPH` printed as `48` beside `43.1 TPH` reads as a coarser
  measurement.
- `fmtSigned` / `fixedSigned` put an explicit `+` on positives — for gaps and deviations.
- `Highlight` lifts numbers (and their units) out of diagnostic prose into value colour and
  weight: *"286.2 °C above the 220 °C ceiling"*. Note the regex needs a non-letter
  lookahead or single-letter units swallow the next word ("3 health" → "3 h" + "ealth").

---

## 11. Porting checklist

**Copy unchanged:**
```
src/styles/theme.css            ← the system
src/app.css                     ← shell
src/lib/format.ts  src/cpp/num.ts  src/util/hint.ts
src/components/                 ← all .tsx + .css
src/cpp/CppCard.tsx  CppKpiDrawer.tsx  CppIcon.tsx  CppCharts.tsx
src/state/globalSel.ts  src/state/mode.ts
```

**Then:**
1. Rename the `cpp-*` class prefix and `CppXxx` components to your domain — nothing in
   them is captive-power-specific except the icon set and a few copy strings.
2. Replace `TopBar.VIEWS` with your screens; keep the brand block, the mode/theme
   segments, the connection dot and the refresh button.
3. Set `--cpp-cols` per strip.
4. Adapt `SHIFT_HOURS` / the IST offset (`330`) in `globalSel.ts` to your plant's
   shift pattern and timezone, and the Highcharts `timezone` to match.
5. Point `types.ts` at your own snapshot contract. `KpiStatus`, `Tone`, `SeriesPoint` and
   `FormulaStep` are the four types the design system actually depends on — keep those
   names.
6. Decide your demo dataset. If you don't want a demo mode, drop `useIsDemo` and the
   `demo` badge kind; if you do, keep the rule that demo mode overrides every other badge.

**Do not port:** the screen stylesheets (`dashboards/*.css`, `cpp/mimic*.css`,
`cpp/visualization.css`, `cpp/management.css`, `cpp/assethealth.css`). Those are layout for
specific approved comps. Read them for the grid idioms; write your own.

**Verify after porting** — these are the five things that break silently:
1. Values inside `table.grid` still take their `v-*` colour (the specificity restatement).
2. Chart tooltips appear over panels and inside drawers (the z-index rule).
3. A filling chart doesn't grow the page without bound (the `.hc-fill` absolute rule).
4. The light theme's 9.5 px labels clear 4.5:1 on a card.
5. First load shows skeletons, not NA.
