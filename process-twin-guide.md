# Building a live process twin

How the CPP process mimic is built, and how to build the same thing for another process.

The result: a plant drawn once, as a machine rather than a diagram, where every animated
line takes its speed and weight from a live measurement. A reader should see *which way
the process is working* before reading a single number.

Reference implementation: `frontend/src/cpp/CppProcessFlow.tsx` and its five companions.

---

## 1. Libraries

That is the whole list. There is no diagramming library, no SVG framework, no animation
library, no state manager.

| | version | used for |
|---|---|---|
| `react` + `react-dom` | 18.3 | the component |
| `typescript` | 5.6 | the model contract |
| `vite` | 5.4 | build |
| `three` | 0.170 | **offline only** — baking equipment sprites. Never shipped. |
| `playwright-core` | 1.63 | **offline only** — driving headless Chrome for the bake |

The diagram itself is **hand-written SVG in JSX**, laid out by arithmetic, styled by CSS
custom properties, animated by one CSS keyframe.

**Why not a diagramming library.** React Flow, GoJS, mxGraph and the rest are built for
diagrams the *user* arranges — draggable nodes, routed edges, a canvas. A process twin is
the opposite: the topology is the plant's, fixed, and the layout is derived from it. You
would spend your time fighting the library's layout engine to produce the one arrangement
you already know you want, and you would still have to hand-draw the equipment.

---

## 2. Architecture — four files, four jobs

```
mimicModel.ts     the plant as data. No geometry, no colours.
mimicSprites.json the artwork manifest: sprite size + nozzle positions. Generated.
mimicArt.tsx      one component per equipment type. Places a sprite in a box.
mimicDraw.tsx     primitives shared by every drawing: Pipe, Lamp, Readout, fit, nozzle.
CppProcessFlow.tsx  the layout. Positions everything and connects it.
mimic.css         colour, theme, animation.
```

The split that matters is **model vs drawing**. The model says *six boilers feed three
headers which feed four turbines*. The drawing decides where that goes on screen. Change
the plant and only the model changes; change the layout and the model does not notice.

A second drawing (`CppProcessFlowWide.tsx`) renders the *same model* in a different
arrangement for a wider panel. That is the test of whether the split is real.

---

## 3. Step one — the topology model

Define one interface per equipment type. Every one carries **identity, topology, live
value, derived state**:

```ts
export type MimicTone = 'ok' | 'warn' | 'risk' | 'na';

export interface MimicBoiler {
  id: string;             // identity — the plant's id, not the drawing's
  name: string;
  kind: 'afbc' | 'whrb';  // which sprite to draw
  headerId: string;       // topology — what it connects to
  tph: number | null;     // the live reading. null means NOT MEASURED.
  load: number;           // 0..1, drives animation speed and line weight
  running: boolean;
  tone: MimicTone;        // the status lamp
  lines: string[];        // keys of the pipes this machine owns (for tracing)
}
```

Four rules for the model:

1. **`null` is a first-class value and never becomes 0.** An unmeasured flow must not
   animate, and a boiler with no reading must not look stopped. These are different
   facts and the drawing shows them differently.
2. **Topology is by id, never by array position.** `headerId: 'hdr24'`, not "the first
   header". Position-based wiring breaks the moment a machine is added.
3. **`load` is normalised 0..1 in the model**, not in the drawing. The drawing should
   never know what a normal steam flow is.
4. **The ids are the process's**, and the backend uses the same ones. A click on a
   machine opens that machine's data because both sides already agree what it is called.

Build the model with one function from your live payload, and a second that returns a
static demo model with the same shape. The demo one is how you develop without a plant.

---

## 4. Step two — bake the equipment sprites

The equipment is **not vector art**. Each machine is a PNG, rendered offline from a
Three.js scene: PBR materials under an environment map, one sun for the whole plant, a
real cast shadow.

**Why.** At the size these draw, what reads as real is light behaviour — a specular band
travelling across a curve, occlusion where two parts meet, a shadow on the floor. A path
fill does none of it. And because every sprite comes out of one rig, the light cannot
drift between machines the way hand-drawn shading does.

The rig lives in `frontend/tools/mimic-render/` and never ships:

```
scene.js     each machine modelled from primitives, sized in metres, around the origin
index.html   loads the scene, exposes window.renderMachine(name, theme, size)
render.cjs   serves the folder, drives headless Chrome, writes trimmed PNGs + the manifest
```

```bash
node render.cjs          # every machine, both themes
node render.cjs boiler   # just one
```

Conventions that make the machines sit together:

- **One camera and one light rig for all of them.** Shallow three-quarter view — 18° yaw,
  11° pitch — under an **orthographic** camera. Enough to show depth, with no perspective
  convergence fighting the flat pipe runs between machines.
- **Two bakes per machine, one per theme.** Baked pixels cannot recolour, so the choice is
  made at render time and CSS picks which to display. The light-theme metal must be a
  *mid* tone — a near-white machine on a near-white panel loses its form.
- **Each machine framed by its own bounding box**, so the sprite's edges are the machine's
  edges and the trim is tight.
- **A second sprite for a state that changes the lighting.** The fired boiler has a
  `-fire` variant with an emissive bed and a point light inside, so the glow spills onto
  the hopper and the floor. An overlay pasted on afterwards lights nothing and always
  looks pasted.

### The manifest is the important output

```json
{ "afbc": { "w": 328, "h": 339, "nozzles": { "steamOut": [0.4784, 0.1796] } } }
```

The renderer projects each connection point through the same camera that drew the machine
and writes it as a **fraction of the sprite**. This is the only place the drawing knows
anything about the artwork.

**Never hand-keep these numbers.** A copied figure drifts the moment a machine is
re-modelled, and every pipe on that machine drifts with it.

---

## 5. Step three — the drawing primitives

### `fit(box, aspect)` — where the sprite actually lands

Sprites keep their own proportions (`preserveAspectRatio="xMidYMax meet"`), so a tall
machine does not fill a wide slot. Pipes must attach to the **machine**, not the slot:

```ts
export function fit(b: Box, aspect: number): Box {
  const w = Math.min(b.w, b.h * aspect);
  const h = w / aspect;
  return { x: b.x + (b.w - w) / 2, y: b.y + b.h - h, w, h, cx: b.x + (b.w - w) / 2 + w / 2 };
}
```

`xMidYMax` also means every machine **stands on its base line**, so machines of different
proportions share a floor.

### `nozzle(box, sprite, id, aspect, flip)` — a connection point

```ts
const art = fit(b, aspect);
const n = SPRITES[sprite].nozzles[id];
return [art.x + (flip ? 1 - n[0] : n[0]) * art.w, art.y + n[1] * art.h];
```

`flip` mirrors a machine about its own box so its discharge faces the other way — the
nozzles mirror with it. A pump facing the wrong way forces its pipe to double back over
everything it just passed; turning the machine costs nothing and the pipe goes straight.

### `flowOf(rate, ref)` — a measurement becomes movement

```ts
export function flowOf(rate: number | null, ref: number) {
  if (rate === null || rate <= 0.5) return null;   // null never animates
  const load = clamp01(rate / ref);
  return { dur: 3.4 - 2.3 * load, load };          // faster when harder worked
}
```

### `Pipe` — three stacked paths on one `d`

```tsx
<g className={`mx-pipe mx-pipe--${kind}`} data-k={k}>
  <path className="mx-pipe-bed"  d={d} />                       {/* the casing */}
  <path className="mx-pipe-line" d={d}
        style={{ opacity: 0.6 + 0.35*load, strokeWidth: 2.3 + 1.5*load }} />
  {flow && <path className="mx-pipe-flow" d={d}
        style={{ animationDuration: `${flow.dur}s` }} />}        {/* the dashes */}
</g>
```

One geometry, three roles. Line weight *and* opacity scale with load, so a hard-worked
line is visibly heavier, not just faster.

### `Readout` and `Lamp` — one lane each

One size, one offset, for every machine in the plant: **name above, reading directly
below, status lamp always in the same corner, no text inside a glyph, a flow rate written
against the pipe that carries it.** Because nothing shares a lane, nothing can collide —
and you never have to think about overlap again.

---

## 6. Step four — layout

Layout is **arithmetic over the model**, in a fixed viewBox. Bands down the page:

```ts
const VB     = { w: 1151, h: 715 };
const FEEDER = { y: 20,  h: 64, w: 100, band: 100 };  // coal deck
const BOILER = { y: 24,  h: 96, maxW: 132, gap: 46 };
const HDR    = { y: 178, h: 26 };
const TG     = { y: 292, h: 56, w: 166 };
const COND   = { y: 360, w: 124, h: 62 };
```

Within a band, position is derived: the boiler row is centred, each header spans its own
boilers, machines sit under their header, each tower under the machines it cools. **A
single-machine plant draws correctly from the same code** — that is the test.

### The viewBox sets the panel's height

Understand this before touching any number. The svg is `width: 100%` with no fixed
height, so the browser derives height from the viewBox aspect:

```
panel height = panel width ÷ (VB.w / VB.h)
```

Make the viewBox taller and **the panel grows taller**, pushing everything below it off
screen. New content has to be paid for in *width*, not height.

Export the aspect and let the wrapper reserve the room:

```tsx
export const MIMIC_ASPECT = VB.w / (VB.h + FEEDER.band);
<div style={{ aspectRatio: MIMIC_ASPECT }}><CppProcessFlow … /></div>
```

Without a definite ratio the wrapper takes the svg's intrinsic height and the section
grows with the drawing.

---

## 7. Step five — style and theme

Every colour is a CSS custom property on `.mx`, redefined under
`:root[data-theme="light"]`:

```css
.mx {
  --mx-steam: #ff7a33;  --mx-cond: #34b6f5;  --mx-cw: #11cbb2;  --mx-coal: #c9a227;
  --mx-ink: #e7f1fb;    --mx-ink-2: #a9c4de; --mx-ink-3: #7b9cbb;
}
:root[data-theme="light"] .mx {
  --mx-steam: #e2540b;  --mx-cond: #0a6fbe;  --mx-cw: #00897b;  --mx-coal: #8a6d13;
  --mx-ink: #142c47;    --mx-ink-2: #44607f; --mx-ink-3: #6a839f;
}
```

**One colour per fluid**, used everywhere that fluid appears. Pick hues that stay distinct
on both grounds — the light-theme values are not the dark ones lightened, they are chosen
again for a white field.

Sprites switch by display, since pixels cannot recolour:

```css
:root[data-theme="light"] .mx-sprite--dark  { display: none; }
:root[data-theme="light"] .mx-sprite--light { display: block; }
```

**Subordinate circuits recede.** The cooling network is thinner and its casing fainter
(`opacity: 0.16`) so the steam path reads first. Decide which circuit is the story.

SVG `<defs>` carry the shared materials — multi-stop gradients for lit cylinders (eight
stops: terminator, shade, lit, specular, lit, base, terminator, **rim**; the rim is what
separates an object from the background without an outline), ambient-occlusion gradients,
one drop shadow for the whole plant, a grain filter, a glow filter.

---

## 8. Step six — animation

One keyframe. That is all.

```css
.mx-pipe-flow {
  stroke-dasharray: 1.4 12;
  animation: mx-flow linear infinite;   /* duration set inline, per pipe, from load */
}
@keyframes mx-flow { to { stroke-dashoffset: -26.8; } }
```

Dashes march along the path. Duration comes from `flowOf`, so speed *is* the measurement.
`stroke-dashoffset` animates on the compositor and costs nothing with dozens of pipes.

**Honour reduced motion**:

```css
@media (prefers-reduced-motion: reduce) {
  .mx-pipe-flow, .mx-plume, .mx-bubble { animation: none; }
}
```

The drawing must still be readable with every animation off — which it is, because load
also sets line weight and opacity.

---

## 9. Step seven — interaction

Every pipe carries `data-k={key}` and every machine lists the keys it owns in
`lines[]`. Selecting a machine builds the lit set from the **model**:

```ts
export function litSet(model: MimicModel, sel: string | null): Set<string> | null
```

Everything in the set stays bright; everything else dims. Because the keys are the
plant's and not the picture's, tracing lights the same set in both drawings, and the
detail drawer keys off exactly the same strings.

---

## 10. The rules that cost the most to learn

1. **What moves is measured.** A line with no reading does not animate. A machine not
   running goes still and grey. Never animate a line because it looks better moving.
2. **Nothing is drawn that is not known.** The headers here carry no figures, because no
   header has a transmitter of its own — the plant chose NA over a number borrowed from
   the machines around it. Resist the decorative value.
3. **A fault is the whole machine, not a dot.** A fired boiler that is not firing turns
   red entirely, readable across a control room without reading a label.
4. **No text inside a glyph**, ever. Labels in fixed lanes outside the machine.
5. **Measure text you must fit.** A header name printed inside its drum needs the drum to
   be at least as long as the words: `width ≈ len × (fontSize × 0.62 + tracking)`.
6. **The drawing derives from the model, not from constants.** Every time a position was
   hard-coded it broke when a machine was added or a plant had only one.
7. **Geometry comes from the renderer, never from the eye.** Nozzle fractions, sprite
   aspects — all generated. The one time these were hand-copied, the turbine steam lines
   ended up hanging beside the casings.

---

## 11. Porting to a new process

1. **Write the topology down** — equipment types, what connects to what, which reading
   belongs to each. This is the whole design; do it before any code.
2. **Define the model interfaces.** One per equipment type, with the four parts from §3.
3. **Write the demo model first**, with plausible static numbers. Build the whole drawing
   against it; wire the live feed last.
4. **Model the equipment in `scene.js`** — primitives, metres, around the origin — and
   declare each machine's nozzles. Run the rig; commit the PNGs and the manifest.
5. **Lay out the bands** top to bottom in process order, and derive positions inside each
   band from the model.
6. **Connect nozzle to nozzle** with `Pipe`, giving each run a stable key.
7. **Pick a colour per fluid** and define both themes.
8. **Wire `flowOf`** to each line's own live rate with a sensible reference value.
9. **Check the single-machine case**, the everything-null case and the
   everything-stopped case. If those three draw correctly, the rest will.

### Reusable as-is

`mimicDraw.tsx` is process-agnostic — `fit`, `nozzle`, `flowOf`, `Pipe`, `Lamp`,
`Readout`, `MimicDefs` and `litSet` carry no CPP knowledge. Copy the file, keep the
`.mx-*` class names, and supply your own model, sprites and layout.
