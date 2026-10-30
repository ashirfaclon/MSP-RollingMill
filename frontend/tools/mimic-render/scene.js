/**
 * The rolling mills' equipment, modelled for the offline renderer.
 *
 * This file never ships in the app. It is the SOURCE of the sprites the HSM and RMD process
 * twins draw: each machine is built from primitives, lit once, and rendered to a PNG with a
 * baked contact shadow. Re-running the rig is how the artwork changes — nobody hand-edits
 * the output.
 *
 * Why a render rather than vector work: at the sizes the twin draws, what reads as real is
 * light behaviour — a specular that moves across a roll, occlusion where the chock meets the
 * housing, a shadow on the floor. A path fill cannot do any of it; a PBR material under an
 * environment map does all three for free.
 *
 * Conventions, so every machine sits together in the drawing:
 *   - One light rig and one camera for all of them, so the sun never moves between
 *     machines and their shadows all fall the same way.
 *   - A straight ELEVATION under an ORTHOGRAPHIC camera: no yaw, an 11° pitch so the tops of
 *     things show. An oblique view tilts the pass line, so a machine's `in` and `out` landed
 *     at different heights and the steel stepped at every stand (improvement-spec C6); with
 *     no yaw the pass line projects level, and the drawing is the 2D the plant asked for
 *     (the user, 29 Oct 2026).
 *   - Each machine is modelled around the origin, sized in metres, standing on y = 0, with
 *     the PASS LINE running along +x (the bar enters at −x and leaves at +x). Its `in` and
 *     `out` nozzles are the two points the pass line meets the machine.
 *
 * The machines are the ones the dashboard's mill mimic has a historian tag for (the user,
 * 29 Oct 2026): a rolling stand (HSM RM / FM, RMD 10" stands), a pinch roll, a tail breaker,
 * a shear, and the roller table that carries the billet in; the exit is a coil (HSM, strip)
 * or a bar bundle (RMD).
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/* ------------------------------- materials -------------------------------- */

/**
 * Two palettes, because the sprites are fixed pixels and the dashboard is not.
 *
 * The dark theme's metal is a cool blue-grey that sits in a navy panel; the light theme's
 * is a mid-tone — a near-white machine on a near-white panel loses its form.
 */
const PALETTE = {
  dark: {
    casing: 0x5d7f9e, casingRough: 0.52,
    steel: 0x7d98b0, steelRough: 0.38,
    roll: 0x8fa9bf, rollRough: 0.28,
    dark: 0x2e4258,
    concrete: 0x6b7f92, concreteRough: 0.92,
    env: 0.72,
    key: 2.5, fill: 0.55, rim: 1.1,
  },
  light: {
    casing: 0xa4b9cd, casingRough: 0.5,
    steel: 0xbccbd9, steelRough: 0.34,
    roll: 0xc9d6e2, rollRough: 0.26,
    dark: 0x5d7690,
    concrete: 0xb4c2d0, concreteRough: 0.92,
    env: 0.8,
    key: 2.7, fill: 0.5, rim: 0.9,
  },
};

const mat = (color, roughness, metalness = 0.85) => new THREE.MeshStandardMaterial({
  color, roughness, metalness, envMapIntensity: 1,
});

/* -------------------------------- helpers --------------------------------- */

const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
  const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  g.position.set(x, y, z);
  g.castShadow = true;
  g.receiveShadow = true;
  return g;
};

const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 48) => {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  g.position.set(x, y, z);
  g.castShadow = true;
  g.receiveShadow = true;
  return g;
};

/** A roll: a cylinder whose axis runs across the pass line (along z). */
const roll = (r, len, m, x, y, z = 0) => {
  const g = cyl(r, r, len, m, x, y, z);
  g.rotation.x = Math.PI / 2;
  return g;
};

/** A shaft or motor lying along the pass line (along x). */
const along = (r, len, m, x, y, z = 0) => {
  const g = cyl(r, r, len, m, x, y, z);
  g.rotation.z = Math.PI / 2;
  return g;
};

/**
 * The hot bar through a machine: an emissive length on the pass line with a warm light
 * inside it, so the glow spills onto the rolls, the housing and the floor. Drawn into the
 * sprite, not pasted on top of it, because an overlay lights nothing.
 */
const hotBar = (g, r, len, x, y, intensity = 18) => {
  const ember = new THREE.MeshStandardMaterial({
    color: 0xff8a2a, emissive: 0xff6a1e, emissiveIntensity: 2.4, roughness: 0.9, metalness: 0,
  });
  const bar = along(r, len, ember, x, y, 0);
  bar.castShadow = false;
  g.add(bar);
  const glow = new THREE.PointLight(0xff7b33, intensity, 7, 2);
  glow.position.set(x, y + 0.2, 0.6);
  g.add(glow);
};

/* ------------------------------- machines ---------------------------------- */

/**
 * ONE PASS-LINE HEIGHT FOR EVERY MACHINE, in metres above the floor. The steel runs straight
 * through the mill, so every machine's `in` and `out` sit at this height and every machine is
 * drawn at the same scale (`pxPerM` in the manifest) — the drawing then joins them with one
 * straight line, never a step (mill-mimic-improvement-spec C6).
 */
const PASS_M = 2.0;
const PASS = { stand: PASS_M, pinch: PASS_M, tb: PASS_M, shear: PASS_M, table: PASS_M };

/**
 * Every builder returns a group standing on y = 0, centred on x and z, so the renderer can
 * frame it without knowing what it is.
 */
const BUILDERS = {
  /**
   * A two-high rolling stand: two housings over a sole plate, a pair of rolls in their
   * chocks between them, the screw-down gear on top, and the drive motor behind with its
   * spindle to the rolls. HSM's RM / FM stands and RMD's 10" stands are all this machine
   * at different sizes; the layout scales the box.
   */
  stand(p, opts = {}) {
    const g = new THREE.Group();
    const casing = mat(p.casing, p.casingRough, 0.62);
    const steel = mat(p.steel, p.steelRough);
    const rollM = mat(p.roll, p.rollRough, 0.95);
    const dark = mat(p.dark, 0.72, 0.5);

    /* sole plate, then the two housings: each a frame with a real window, so the chocks sit
       IN the housing and the hot bar's glow shows through it */
    g.add(box(3.6, 0.4, 3.0, dark, 0, 0.2, 0));
    for (const z of [-0.95, 0.95]) {
      for (const x of [-0.98, 0.98]) g.add(box(0.64, 3.8, 0.55, casing, x, 2.3, z));
      g.add(box(2.6, 0.5, 0.55, casing, 0, 0.65, z));
    }
    /* the cap and the screw-down gear on it */
    g.add(box(2.8, 0.45, 2.6, casing, 0, 4.42, 0));
    g.add(cyl(0.5, 0.5, 0.7, steel, 0, 5.0, 0));
    g.add(cyl(0.62, 0.62, 0.14, dark, 0, 5.4, 0));
    /* chocks and rolls: the upper roll sits above the pass line, the lower below it */
    for (const y of [PASS.stand + 0.62, PASS.stand - 0.62]) {
      for (const z of [-0.95, 0.95]) g.add(box(1.1, 0.9, 0.5, steel, 0, y, z));
      g.add(roll(0.5, 2.5, rollM, 0, y));
    }
    /* drive: a motor behind the stand, its spindle into the lower roll */
    const spindle = cyl(0.22, 0.22, 1.6, steel, 0, PASS.stand - 0.62, -2.0);
    spindle.rotation.x = Math.PI / 2;
    g.add(spindle);
    const motor = cyl(0.85, 0.85, 2.2, steel, 0, 1.3, -3.6);
    motor.rotation.x = Math.PI / 2;
    g.add(motor);
    for (let i = 0; i < 5; i += 1) {
      const f = cyl(0.9, 0.9, 0.07, dark, 0, 1.3, -2.9 - i * 0.35);
      f.rotation.x = Math.PI / 2;
      g.add(f);
    }
    g.add(box(1.2, 0.5, 2.0, dark, 0, 0.25, -3.6));
    /* guide boxes either side of the pass line, where the bar enters and leaves */
    for (const x of [-1.55, 1.55]) g.add(box(0.5, 0.5, 0.9, dark, x, PASS.stand, 0));

    if (opts.hot) hotBar(g, 0.13, 4.2, 0, PASS.stand, 22);
    return g;
  },

  /** A pinch roll: a light frame with two small driven rolls, the motor beside it. */
  pinch(p, opts = {}) {
    const g = new THREE.Group();
    const casing = mat(p.casing, p.casingRough, 0.62);
    const steel = mat(p.steel, p.steelRough);
    const rollM = mat(p.roll, p.rollRough, 0.95);
    const dark = mat(p.dark, 0.72, 0.5);

    g.add(box(2.2, 0.3, 2.2, dark, 0, 0.15, 0));
    /* each side a frame with a window, so the rolls show and their ends stay inside it */
    for (const z of [-0.7, 0.7]) {
      for (const x of [-0.55, 0.55]) g.add(box(0.3, 3.0, 0.35, casing, x, 1.8, z));
      g.add(box(1.4, 0.3, 0.35, casing, 0, 0.45, z));
    }
    g.add(box(1.5, 0.3, 1.8, casing, 0, 3.45, 0));
    for (const y of [PASS.pinch + 0.36, PASS.pinch - 0.36]) g.add(roll(0.34, 1.6, rollM, 0, y));
    /* motor behind, geared to the lower roll */
    const motor = cyl(0.5, 0.5, 1.3, steel, 0, 1.2, -2.0);
    motor.rotation.x = Math.PI / 2;
    g.add(motor);
    g.add(box(0.6, 0.6, 0.6, dark, 0, 1.25, -1.15));
    for (const x of [-0.95, 0.95]) g.add(box(0.3, 0.4, 0.7, dark, x, PASS.pinch, 0));
    if (opts.hot) hotBar(g, 0.1, 2.6, 0, PASS.pinch, 12);
    return g;
  },

  /**
   * A tail breaker: a pinch-roll frame with the flywheel and gearbox that give it its
   * grip — the wheel on the drive side is what names this machine.
   */
  tb(p, opts = {}) {
    const g = new THREE.Group();
    const casing = mat(p.casing, p.casingRough, 0.62);
    const steel = mat(p.steel, p.steelRough);
    const rollM = mat(p.roll, p.rollRough, 0.95);
    const dark = mat(p.dark, 0.72, 0.5);

    g.add(box(2.4, 0.3, 2.6, dark, 0, 0.15, 0));
    /* each side a frame with a window, so the rolls show and their ends stay inside it */
    for (const z of [-0.7, 0.7]) {
      for (const x of [-0.6, 0.6]) g.add(box(0.3, 3.2, 0.4, casing, x, 1.9, z));
      g.add(box(1.5, 0.3, 0.4, casing, 0, 0.45, z));
    }
    g.add(box(1.6, 0.3, 1.9, casing, 0, 3.65, 0));
    for (const y of [PASS.tb + 0.4, PASS.tb - 0.4]) g.add(roll(0.38, 1.6, rollM, 0, y));
    /* flywheel and gearbox on the drive side */
    g.add(roll(0.95, 0.22, steel, 0, 2.0, -1.25));
    g.add(roll(0.3, 0.3, dark, 0, 2.0, -1.5));
    g.add(box(1.2, 1.1, 0.9, dark, 0, 1.0, -2.1));
    for (const x of [-1.05, 1.05]) g.add(box(0.3, 0.4, 0.7, dark, x, PASS.tb, 0));
    if (opts.hot) hotBar(g, 0.1, 2.8, 0, PASS.tb, 12);
    return g;
  },

  /**
   * A shear: a closed housing across the line with the bar's slot through it, the drum
   * drive on top and the motor at the back.
   */
  shear(p, opts = {}) {
    const g = new THREE.Group();
    const casing = mat(p.casing, p.casingRough, 0.62);
    const steel = mat(p.steel, p.steelRough);
    const dark = mat(p.dark, 0.72, 0.5);

    g.add(box(2.6, 0.35, 2.6, dark, 0, 0.17, 0));
    g.add(box(2.0, 3.3, 2.2, casing, 0, 2.0, 0));
    for (const y of [1.4, 2.7]) g.add(box(2.06, 0.07, 2.26, dark, 0, y, 0));
    /* the slot the bar passes through, cut into both faces */
    for (const x of [-1.02, 1.02]) g.add(box(0.08, 0.5, 1.1, dark, x, PASS.shear, 0));
    /* drum shaft across the top, its drive behind */
    g.add(roll(0.42, 2.6, steel, 0, 3.9, 0));
    g.add(roll(0.5, 0.12, dark, 0, 3.9, -1.36));
    const motor = cyl(0.55, 0.55, 1.4, steel, 0, 1.3, -2.0);
    motor.rotation.x = Math.PI / 2;
    g.add(motor);
    if (opts.hot) hotBar(g, 0.1, 3.0, 0, PASS.shear, 12);
    return g;
  },

  /** A length of roller table: side rails on legs, a row of rollers between them. */
  table(p) {
    const g = new THREE.Group();
    const steel = mat(p.steel, p.steelRough);
    const rollM = mat(p.roll, p.rollRough, 0.95);
    const dark = mat(p.dark, 0.72, 0.5);
    const top = PASS.table - 0.18;
    for (const z of [-0.95, 0.95]) g.add(box(4.0, 0.28, 0.16, dark, 0, top - 0.1, z));
    for (const x of [-1.7, 1.7]) for (const z of [-0.95, 0.95]) g.add(box(0.16, top - 0.1, 0.16, dark, x, (top - 0.1) / 2, z));
    for (let i = 0; i < 7; i += 1) g.add(roll(0.18, 1.9, rollM, -1.65 + i * 0.55, top));
    /* one roller's drive, so the table reads as driven rather than idle */
    const motor = cyl(0.3, 0.3, 0.7, steel, -0.55, top - 0.1, -1.45);
    motor.rotation.x = Math.PI / 2;
    g.add(motor);
    return g;
  },

  /** A coil of hot strip on its cradle — the HSM's exit. */
  coil(p) {
    const g = new THREE.Group();
    const steel = mat(p.steel, 0.3, 0.95);
    const dark = mat(p.dark, 0.72, 0.5);
    g.add(box(3.0, 0.3, 2.4, dark, 0, 0.15, 0));
    for (const x of [-0.9, 0.9]) g.add(box(0.5, 1.3, 1.9, dark, x, 0.8, 0));
    g.add(roll(1.25, 1.5, steel, 0, PASS_M));
    /* the wraps: thin dark rings round the face, and the bore */
    for (const r of [1.0, 0.75, 0.52]) g.add(roll(r, 1.52, dark, 0, PASS_M));
    for (const r of [1.12, 0.87, 0.63]) g.add(roll(r, 1.51, steel, 0, PASS_M));
    g.add(roll(0.32, 1.56, dark, 0, PASS_M));
    return g;
  },

  /** A bundle of bars on a cradle — the RMD's exit. */
  bundle(p) {
    const g = new THREE.Group();
    const steel = mat(p.steel, 0.3, 0.95);
    const dark = mat(p.dark, 0.72, 0.5);
    g.add(box(4.0, 0.3, 2.2, dark, 0, 0.15, 0));
    for (const x of [-1.3, 1.3]) g.add(box(0.3, PASS_M - 0.42, 1.8, dark, x, (PASS_M - 0.42) / 2 + 0.3, 0));
    /* a hexagonal pile at the pass line: rows of five, four, three */
    const rows = [[5, PASS_M - 0.22], [4, PASS_M], [3, PASS_M + 0.22]];
    for (const [n, y] of rows) {
      for (let i = 0; i < n; i += 1) g.add(along(0.12, 3.6, steel, 0, y, (i - (n - 1) / 2) * 0.26));
    }
    return g;
  },
};

export const MACHINES = [...Object.keys(BUILDERS), 'stand:hot', 'pinch:hot', 'tb:hot', 'shear:hot'];

/**
 * The nozzles — the whole point of rendering the machines in code.
 *
 * `in` and `out` are where the pass line meets each machine, in model space; the renderer
 * projects them through the SAME camera that drew the machine, so the drawing joins the
 * bar to the metal by construction rather than by eye.
 */
const NOZZLES = {
  stand: { in: [-1.8, PASS.stand, 0], out: [1.8, PASS.stand, 0] },
  pinch: { in: [-1.1, PASS.pinch, 0], out: [1.1, PASS.pinch, 0] },
  tb: { in: [-1.2, PASS.tb, 0], out: [1.2, PASS.tb, 0] },
  shear: { in: [-1.06, PASS.shear, 0], out: [1.06, PASS.shear, 0] },
  table: { in: [-2.0, PASS.table, 0], out: [2.0, PASS.table, 0] },
  coil: { in: [-1.5, PASS_M, 0] },
  bundle: { in: [-2.0, PASS_M, 0] },
};

/* -------------------------------- renderer --------------------------------- */

/**
 * One rig for every machine: orthographic three-quarter view, a key light that casts, a
 * fill, a rim, and a room environment for the reflections that make metal look like metal.
 * The floor is a shadow-only plane, so the contact shadow bakes into the transparent PNG.
 */
export function renderMachine(name, theme, size = 1024) {
  const p = PALETTE[theme];
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size, false);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = theme === 'light' ? 0.98 : 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = p.env;

  /* `stand:hot` is the same machine with the bar through it — one builder, two states. */
  const [base, variant] = name.split(':');
  const obj = BUILDERS[base](p, { hot: variant === 'hot' });
  scene.add(obj);

  /* Frame the machine: the sprite's edges are the machine's edges. */
  const bb = new THREE.Box3().setFromObject(obj);
  const c = bb.getCenter(new THREE.Vector3());
  const s = bb.getSize(new THREE.Vector3());
  const radius = Math.max(s.x, s.y, s.z) * 0.78;

  /* A shadow-only floor, so the contact shadow is part of the sprite. */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 8, radius * 8),
    new THREE.ShadowMaterial({ opacity: theme === 'light' ? 0.26 : 0.32 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = bb.min.y + 0.001;
  floor.receiveShadow = true;
  scene.add(floor);

  const yaw = 0;
  const pitch = THREE.MathUtils.degToRad(11);
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

  const pad = 1.04;
  const cam = new THREE.OrthographicCamera(
    -radius * pad, radius * pad, radius * pad, -radius * pad, 0.1, radius * 40,
  );
  cam.position.copy(c).add(dir.clone().multiplyScalar(radius * 12));
  cam.lookAt(c);

  /* One sun for every machine in the plant — high and only a little to the left and front, so
     the shadow it casts stays close under the machine: the trimmed sprite is then the machine's
     own width, and the drawing can give every machine the room it has (the user, 30 Oct 2026). */
  const key = new THREE.DirectionalLight(0xffffff, p.key);
  key.position.set(-1.1, 12, 2.4).multiplyScalar(radius * 0.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 6;
  const d = radius * 2.4;
  Object.assign(key.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 0.1, far: radius * 30 });
  key.shadow.camera.updateProjectionMatrix();
  key.target.position.copy(c);
  scene.add(key, key.target);
  scene.add(new THREE.DirectionalLight(0xbdd6ef, p.fill).translateX(-8).translateZ(-6));
  const rim = new THREE.DirectionalLight(0xffffff, p.rim);
  rim.position.set(8, 3, -8);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, theme === 'light' ? 0.32 : 0.25));

  renderer.render(scene, cam);
  const trim = trimToAlpha(renderer.domElement);

  /*
   * Project each nozzle through the camera that just drew the machine, then express it as
   * a fraction of the TRIMMED sprite — which is the only coordinate system the drawing
   * knows about.
   */
  const nozzles = {};
  /* `base`: the machine's origin on the floor. The trimmed sprite includes the shadow the
     machine casts, which reaches a different distance below the floor on each machine, so the
     drawing stands machines on this point, not on the sprite's bottom edge. */
  for (const [id, pt] of Object.entries({ base: [0, 0, 0], ...(NOZZLES[base] ?? {}) })) {
    const v = new THREE.Vector3(pt[0], pt[1], pt[2]).project(cam);
    const px = ((v.x + 1) / 2) * size;
    const py = ((1 - v.y) / 2) * size;
    nozzles[id] = [
      Number(((px - trim.x0) / trim.w).toFixed(4)),
      Number(((py - trim.y0) / trim.h).toFixed(4)),
    ];
  }

  renderer.dispose();
  pmrem.dispose();
  /* The sprite's scale: pixels per metre of machine, from the camera that framed it. The
     drawing sizes every box from this so all machines share one scale and one pass line. */
  const pxPerM = size / (2 * radius * pad);
  return { url: trim.url, w: trim.w, h: trim.h, pxPerM: Number(pxPerM.toFixed(3)), nozzles };
}

/**
 * Crop the render down to the pixels that are actually there.
 *
 * The camera frames a sphere around the machine, so a tall stand leaves most of a square
 * canvas empty and a long table leaves bands top and bottom. Trimming to the alpha bounds
 * means every sprite is exactly its own machine — including the shadow it casts — which is
 * what lets the drawing place them by their own edges.
 */
function trimToAlpha(canvas, pad = 6) {
  const w = canvas.width;
  const h = canvas.height;
  /* Read back through a 2D copy: the WebGL canvas cannot be sampled directly. */
  const flat = document.createElement('canvas');
  flat.width = w;
  flat.height = h;
  const f = flat.getContext('2d');
  f.drawImage(canvas, 0, 0);
  const { data } = f.getImageData(0, 0, w, h);

  let x0 = w; let y0 = h; let x1 = 0; let y1 = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 4) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) return { url: canvas.toDataURL('image/png'), x0: 0, y0: 0, w, h };

  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);

  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(flat, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return { url: out.toDataURL('image/png'), x0, y0, w: out.width, h: out.height };
}
