import * as THREE from 'three';
import { foliageMaterial, wireMaterial } from './bgmaterials.js';
import { GeoB, K, col, plainBoxes } from './town-geo.js';
import { townMaterial, groundMaterial, waterMaterial, mountainMaterial, TU } from './town-mat.js';
import { buildWall } from './town-wall.js';
import { placeProps } from './town-props.js';
import { house, frontExtras, clothes, planTown, planFrames, palm, cypress, WHITES, SANDS, BLUES, DOME_TOP, DOME_BASE, AWN } from './town-houses.js';
import { WALL, GATE, CANAL, STEPS, stepY, PLACES, BELL_TOWERS, COLOSSUS, wallInnerZ, wallOuterZ } from './layout.js';
import { Rng, smooth, invLerp, clamp } from './util.js';

// TOWN department: the white town, the canal and the kids' steps, the great wall and gate,
// the fields outside. Everything is static geometry except the gate / grip / house-hit states.
const sst = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hsh = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hsh(xi, yi), b = hsh(xi + 1, yi), c = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 4) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += a * vn(x, y); n += a; x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; a *= 0.5; } return s / n; }

// fields outside: flat for 400 m beyond the wall, then rolling hills, then high downs
export function outsideH(x, z) {
  const xc = Math.max(-1513, Math.min(1513, x));
  const d = wallOuterZ(xc) - z;
  if (d <= 400) return 0;
  let h = sst(400, 1300, d) * (6 + 34 * fbm(x * 0.0018 + 3, z * 0.0018, 4));
  h += sst(1200, 3600, d) * (40 + 190 * fbm(x * 0.0007 + 8, z * 0.0009 + 2, 5));
  return h;
}
const inCanal = (x, z) => z > CANAL.z - CANAL.halfW && z < CANAL.z + CANAL.halfW;
const inSteps = (x, z) => x > STEPS.x0 && x < STEPS.x1 && z > STEPS.zTop - STEPS.n * STEPS.tread && z < STEPS.zTop;

export async function buildTown(ctx) {
  const { scene } = ctx;
  const root = new THREE.Group(); root.name = 'town';
  scene.add(root);
  const mat = townMaterial({ id: 0 });
  const matInk = townMaterial({ id: 3, ink: 1 });
  const add = (g, m = mat, name = '') => { const me = new THREE.Mesh(g, m); me.frustumCulled = false; me.name = name; me.userData.noShadow = true; root.add(me); return me; };
  const extras = { pots: [], vines: [], lines: [], trees: [] };

  // ------------------------------------------------------------------ houses
  const near = new GeoB(), far = new GeoB();
  const r = new Rng(31337);
  const lots = [...planFrames(), ...planTown()];
  const onMain = (l) => Math.abs(l.x) - l.w / 2 < 8.5 && l.z < 60;
  const onSquare = (l) => l.x > -55 && l.x < 55 && l.z > -170 && l.z < -70;
  const special = [];
  for (const l of lots) {
    if (l.garden) { extras.trees.push([l.x, 0, l.z, Math.min(l.w, l.d) * 0.9, 0]); continue; }
    if (l.tree) {
      const nearT = Math.abs(l.x) < 340 && l.z < 230;
      if (l.tree === 'palm' && nearT) palm(near, l.x, l.z, l.s * 1.5 + 4, l.x * 0.13);
      else if (l.tree === 'cypress' && nearT) cypress(near, l.x, l.z, l.s * 1.3 + 5, l.x * 0.11);
      else extras.trees.push([l.x, 0, l.z, l.s, 0]);
      continue;
    }
    const detail = Math.abs(l.x) < 340 && l.z < 230 && l.z > -330;
    // heights cluster: taller knots of houses and lower quarters, plus the stair-stepped pairs
    const hf = 0.5 + 0.5 * Math.sin(l.x * 0.021 + l.z * 0.013 + 0.6) * Math.cos(l.z * 0.017 - l.x * 0.008);
    const fr = r.next() * 0.7 + hf * 0.3;
    let floors = l.floors ?? (fr < 0.2 ? 2 : fr < 0.62 ? 3 : fr < 0.88 ? 4 : 5);
    if (l.fd) floors = Math.max(1, Math.min(5, floors + l.fd));
    const fh = r.range(3.3, 3.7);
    const h = {
      x: l.x, z: l.z, w: Math.max(4, l.w - r.range(0, 0.4)), d: Math.max(4, l.d - r.range(0, 0.6)), ry: l.ry ?? 0, floors, fh,
      wall: r.next() < 0.86 ? WHITES[r.int(0, WHITES.length - 1)] : SANDS[r.int(0, SANDS.length - 1)],
      accent: BLUES[r.int(0, BLUES.length - 1)], seed: r.range(0, 100), detail,
      parapet: r.range(0.8, 1.2), corners: r.next() < 0.18, front: l.front,
    };
    if (detail) {
      if (r.next() < 0.33) { h.kiosk = [r.sign(), r.sign()]; if (r.next() < 0.2) h.kioskDome = [DOME_TOP[r.int(0, 3)], DOME_BASE[r.int(0, 2)]]; }
      if (r.next() < 0.1 && h.w > 7 && h.d > 7) h.dome = { r: Math.min(h.w, h.d) * r.range(0.22, 0.32), drum: r.range(0.8, 2.2), top: DOME_TOP[r.int(0, 3)], base: DOME_BASE[r.int(0, 2)], u: r.range(-1, 1), v: r.range(-1, 1), point: r.next() < 0.3 ? 1 : 0, hk: r.range(0.9, 1.2) };
      const nj = r.next() < 0.45 ? r.int(1, 4) : 0;
      h.jars = []; for (let k = 0; k < nj; k++) h.jars.push([r.pick([0.05, 0.95]), r.range(0.05, 0.95), r.range(0.7, 1.1), r.pick(['#d99a6a', '#c98a5e', '#e2b08a', '#3c78c0']), r.next() < 0.5]);
      if (r.next() < 0.2) { h.pergola = [0.1, 0.1, r.range(0.45, 0.7), r.range(0.45, 0.8)]; h.awnCol = AWN[r.int(0, AWN.length - 1)]; }
      else if (r.next() < 0.3) h.laundry = r.next() < 0.5 ? [0.08, r.range(0.3, 0.7), 0.92, r.range(0.3, 0.7)] : [r.range(0.3, 0.7), 0.08, r.range(0.3, 0.7), 0.92];
      if (r.next() < 0.3) { h.tanks = [[r.range(0.15, 0.85), r.range(0.15, 0.85), r.pick(['#f2efe8', '#e8e4dc', '#3c78c0', '#f2efe8'])]]; if (r.next() < 0.3) h.tanks.push([r.range(0.15, 0.85), r.range(0.15, 0.85), '#f2efe8']); }
      if (r.next() < 0.4) { h.plants = []; const np = r.int(1, 4); for (let k = 0; k < np; k++) h.plants.push([r.pick([0.04, 0.96]), r.range(0.1, 0.9), r.range(0.7, 1.2)]); }
      if (r.next() < 0.3) h.vents = [[l.x + r.range(-1, 1) * (h.w / 2 - 1), r.range(0.6, 1.4), l.z + r.range(-1, 1) * (h.d / 2 - 1)]];
      if (onMain(l) || onSquare(l)) { if (r.next() < 0.75) { h.awning = true; h.awnCol = AWN[r.int(0, AWN.length - 1)]; } }
      if (r.next() < 0.3) h.balcony = [r.int(1, Math.max(1, floors - 1)), r.range(-0.25, 0.25) * h.w, r.range(2.0, 3.4)];
      if (r.next() < 0.3) h.vine = [r.range(-0.35, 0.35) * Math.min(h.w, h.d), r.range(2, 4)];
    } else if (r.next() < 0.07 && h.w > 7 && h.d > 7) {
      h.dome = { r: Math.min(h.w, h.d) * 0.28, drum: 1, top: DOME_TOP[r.int(0, 3)], base: DOME_BASE[r.int(0, 2)], u: 0, v: 0 };
    }
    house(detail ? near : far, h, extras);
  }

  // landmark domed halls: big blue domes that punctuate the skyline
  const halls = [[-118, -36, 22], [146, 18, 24], [74, -214, 18], [-210, -190, 20], [300, -120, 26], [-330, 60, 24], [40, 160, 22], [-160, 210, 20]];
  for (const [x, z, s] of halls) {
    const hh = { x, z, w: s, d: s, ry: 0, floors: 3, fh: 4.2, wall: '#f6f1e6', accent: '#2a4fb8', seed: x * 0.1, detail: true, parapet: 1.0, corners: true, front: 'pz',
      dome: { r: s * 0.38, drum: 3.2, top: '#43c2cc', base: '#1d4cae', u: 0, v: 0, hk: 1.15, point: 1 } };
    house(near, hh, extras);
  }

  // the opening shot's house (s02): a white two-storey house with a glazed dome, in the free strip west of the alley
  house(near, { x: -85, z: -24, w: 10, d: 10, ry: 0, floors: 2, fh: 3.6, wall: '#f7f3ea', accent: '#1f5fae', seed: 2.2, detail: true, parapet: 1.1, corners: true, front: 'px',
    dome: { r: 3.3, drum: 1.6, top: '#45c4cc', base: '#1e4cae', u: 0.1, v: 0.1, hk: 1.1, point: 1 }, vine: [1.5, 3] }, extras);

  // ---------------------------------------------------- the alley (s04) and its dressing
  // lane x -63.5..-60.5, z -46..10. An arched room bridges it; laundry crosses overhead.
  {
    const A = { kind: K.WIN, c: col('#f6f1e6'), c2: col('#2a4fb8'), seed: 5.5, fh: 3.4, sp: 3 };
    near.boxMM(-63.6, 4.4, -36.5, -60.4, 8.2, -32.5, (f) => (f === 'top' ? { kind: K.ROOF, c: col('#efe7da'), seed: 1 } : f === 'bot' ? { kind: K.PLAIN, c: col('#efe7da'), seed: 2 } : A));
    near.boxMM(-63.7, 8.2, -36.6, -60.3, 8.5, -32.4, { kind: K.PLAIN, c: col('#f6f1e6'), seed: 3 });
    const rr = new Rng(77);
    for (const [z, y] of [[-25.5, 7.4], [-13, 6.6], [-3, 7.0]]) {
      const a0 = [-63.45, z], a1 = [-60.55, z + 0.4];
      extras.lines.push([[a0[0], y, a0[1]], [a1[0], y, a1[1]], 0.18]);
      clothes(near, a0, a1, y, rr, 0.18);
    }
    extras.vines.push([-63.3, 9.5, -22.5, 3.2, 5.0], [-60.7, 10.2, -8, 2.6, 6.0], [-60.7, 8.6, -39, 2.2, 3.5], [-63.3, 9.8, 4, 2.4, 4.5]);
    for (const [x, z, s] of [[-63.0, -43.5, 0.8], [-61.0, -42.0, 0.9], [-63.0, 6.0, 0.7], [-61.0, 7.5, 0.8], [-63.05, -4.5, 0.6]]) {
      near.lathe(x, 0, z, [[0.2, 0], [0.3, 0.1], [0.34, 0.45], [0.3, 0.55], [0.32, 0.6]].map(([a, b]) => [a * s * 1.3, b * s * 1.3]), 12, { kind: K.CLAY, c: col(rr.pick(['#d99a6a', '#3c78c0', '#e2b08a'])), seed: 1 });
      extras.pots.push([x, 0.75 * s * 1.3, z, 1.3 * s]);
    }
  }

  // --------------------------------------------- laundry roof (s07): top exactly y = 10.5
  const LR = PLACES.laundryRoof;   // (-70, 10.5, -64)
  {
    const h = { x: LR[0], z: LR[2], w: 14, d: 12, ry: 0, floors: 3, fh: 3.5, wall: '#f6f1e6', accent: '#2a4fb8', seed: 42.4, detail: true, parapet: 1.0, corners: false,
      kiosk: [-1, 1], front: 'px', vine: [2, 3], jars: [[0.96, 0.06, 1.0, '#d99a6a', true], [0.88, 0.04, 0.8, '#c98a5e', false], [0.04, 0.2, 0.9, '#3c78c0', true]] };
    house(near, h, extras);
    const y = 10.5 + 1.9;
    const rr = new Rng(5);
    for (const z of [-62.0, -67.0]) {
      const a0 = [-75.6, z], a1 = [-64.4, z];
      for (const [x, zz] of [a0, a1]) near.box(x, 10.5, zz, 0.12, 2.05, 0.12, 0, { kind: K.WOOD, c: col('#9e8b74'), seed: 2 });
      extras.lines.push([[a0[0], y, a0[1]], [a1[0], y, a1[1]], 0.22]);
      clothes(near, a0, a1, y, rr, 0.22, z === -62.0 ? [3.0, 8.4] : null);
    }
  }

  // --------------------------------------------- the house that gets hit (s26), facade separate
  const HH = PLACES.houseHit;      // (16, 0, -252)
  const hitFacade = new GeoB(), hitBroken = new GeoB();
  {
    const h = { x: HH[0], z: HH[2], w: 16, d: 16, ry: 0, floors: 3, fh: 3.6, wall: '#f4eee2', accent: '#1f5fae', seed: 61.6, detail: true, parapet: 1.0,
      corners: true, front: 'nx', skipFace: 'nx', awning: true, awnCol: AWN[1], balcony: [2, 2.0, 3.2], vine: [-4, 3], kiosk: [1, -1], jars: [[0.9, 0.9, 1.0, '#d99a6a', true]] };
    const hb = { ...h, front: null };
    const H = house(near, hb, extras);
    const x0 = HH[0] - 8;
    // facade wall (same painting as the rest of the house) + its awning, balcony and vine
    hitFacade.quad([x0, 0, HH[2] - 8], [x0, 0, HH[2] + 8], [x0, H, HH[2] + 8], [x0, H, HH[2] - 8], { kind: K.WIN, c: col(h.wall), c2: col(h.accent), seed: h.seed + 0.13, fh: h.fh, sp: 16 / 5 }, 0, 0, 16, H);
    hitFacade.boxMM(x0 - 0.12, H - 0.28, HH[2] - 8.12, x0 + 0.3, H, HH[2] + 8.12, { kind: K.PLAIN, c: col(h.wall), seed: 1 });
    hitFacade.boxMM(x0 - 0.0, 0, HH[2] - 8, x0 + 0.3, H, HH[2] + 8, { kind: K.PLAIN, c: col(h.wall), seed: 1 }, { skip: { nx: true, top: true, bot: true } });
    frontExtras(hitFacade, h, null, H, new Rng(3));
    // broken state: floors, painted interior walls, furniture, a torn ragged rim of the facade
    const IN = (c) => ({ kind: K.INTER, c: col(c), seed: 7 });
    for (const fy of [3.6, 7.2]) hitBroken.boxMM(x0 + 0.3, fy - 0.3, HH[2] - 7.7, HH[0] + 7.7, fy, HH[2] + 7.7, IN('#b39c82'));
    hitBroken.boxMM(x0 + 0.3, 0, HH[2] - 7.7, HH[0] + 7.7, 0.05, HH[2] + 7.7, IN('#c9b49a'));
    const paints = ['#93aab8', '#c4a882', '#a898b4'];
    for (let f = 0; f < 3; f++) {
      const y0 = f * 3.6 + (f ? 0 : 0.05), y1 = (f + 1) * 3.6 - 0.3;
      hitBroken.boxMM(HH[0] + 7.4, y0, HH[2] - 7.7, HH[0] + 7.7, y1, HH[2] + 7.7, IN(paints[f]));
      hitBroken.boxMM(x0 + 0.3, y0, HH[2] - 7.7, HH[0] + 7.7, y1, HH[2] - 7.4, IN(paints[f]));
      hitBroken.boxMM(x0 + 0.3, y0, HH[2] + 7.4, HH[0] + 7.7, y1, HH[2] + 7.7, IN(paints[f]));
      // a partition with a doorway
      hitBroken.boxMM(HH[0] + 1.5, y0, HH[2] - 7.4, HH[0] + 1.75, y1, HH[2] + 2.0, IN(paints[(f + 1) % 3]));
      // furniture: table, cupboard, bed / shelf
      const W = { kind: K.WOOD, c: col('#a8784e'), seed: f };
      hitBroken.boxMM(x0 + 2.5, y0, HH[2] - 2.5, x0 + 4.0, y0 + 0.8, HH[2] - 0.8, W);
      hitBroken.boxMM(HH[0] + 6.6, y0, HH[2] + 2.5, HH[0] + 7.4, y0 + 2.1, HH[2] + 4.5, W);
      hitBroken.boxMM(x0 + 1.0, y0, HH[2] + 4.0, x0 + 3.0, y0 + 0.55, HH[2] + 7.3, { kind: K.CLOTH, c: col('#f0e8dc'), c2: col('#2a4fb8'), seed: f });
    }
    // torn rim: jagged frame left of the facade (shape with a ragged hole), 0.3 m thick
    const sh = new THREE.Shape();
    sh.moveTo(-8, 0); sh.lineTo(8, 0); sh.lineTo(8, H); sh.lineTo(-8, H); sh.closePath();
    const hole = new THREE.Path();
    const jr = new Rng(616);
    const pts = [];
    const n = 28;
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([-7.2 + jr.range(-0.5, 0.6), t * (H - 1.4) + 0.2]); }
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([-7 + t * 14 + jr.range(-0.3, 0.3), H - 1.2 - jr.range(0, 1.4)]); }
    for (let i = n; i >= 0; i--) { const t = i / n; pts.push([7.2 + jr.range(-0.6, 0.5), t * (H - 1.4) + 0.2]); }
    pts.push([6.5, 0.05], [-6.5, 0.05]);
    hole.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) hole.lineTo(p[0], p[1]); hole.closePath();
    sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false });
    const m = new THREE.Matrix4().makeTranslation(x0, 0, HH[2]).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    hitBroken.addGeo(g, m, (v, nn) => (Math.abs(nn.x) > 0.7 && v.x < x0 + 0.05 ? { kind: K.PLAIN, c: col(h.wall), seed: 3 } : { kind: K.INTER, c: col('#d2b494'), seed: 4 }), { planar: true });
  }

  // ------------------------------------------------------------ bell towers
  for (const [bx, , bz] of BELL_TOWERS) bellTower(near, bx, bz);

  // -------------------------------------------------------- canal, quays, bridge, steps
  const stone = new GeoB();
  placeProps(stone);
  const LIMEC = col('#efe3cf');
  const QA = (seed = 1) => ({ kind: K.LIME, c: LIMEC, c2: LIMEC, seed, fh: 0.5, sp: 2 });
  const zS = CANAL.z + CANAL.halfW, zN = CANAL.z - CANAL.halfW;   // 67, 53
  // quay faces + coping (south quay broken by the steps, both broken by the bridge)
  const quay = (x0, x1, zFace, sg) => {
    // sg = +1 face looks north (south quay), -1 face looks south (north quay)
    stone.quad(sg > 0 ? [x1, -6, zFace] : [x0, -6, zFace], sg > 0 ? [x0, -6, zFace] : [x1, -6, zFace], sg > 0 ? [x0, 0, zFace] : [x1, 0, zFace], sg > 0 ? [x1, 0, zFace] : [x0, 0, zFace], { ...QA(x0), kind: K.LIME, fh: 0.5 }, 0, -6, x1 - x0, 0, [-1e5, 1e5, -1e5, 0]);
    // coping: a pale lip 0.18 m high, 0.6 m deep
    const z0 = sg > 0 ? zFace : zFace - 0.6, z1 = sg > 0 ? zFace + 0.6 : zFace;
    stone.boxMM(x0, 0, z0, x1, 0.16, z1, { ...QA(x0 + 3), c: col('#f4ead8') }, { skip: { bot: true } });
  };
  const XL = 1390;
  quay(-XL, STEPS.x0, zS, 1); quay(STEPS.x1, -6.6, zS, 1); quay(6.6, XL, zS, 1);
  quay(-XL, -6.6, zN, -1); quay(6.6, XL, zN, -1);
  // the kids' steps: six treads (exact stepY), cheek walls, worn nosings drawn by the shader
  const ST = { kind: K.LIME, c: col('#f1e6d2'), c2: col('#f1e6d2'), seed: 9, fh: 0.5, sp: 2 };
  for (let i = 0; i < STEPS.n; i++) {
    const zb = STEPS.zTop - (i + 1) * STEPS.tread, zt = STEPS.zTop - i * STEPS.tread, top = -STEPS.rise * (i + 1);
    stone.boxMM(STEPS.x0, -6, zb, STEPS.x1, top, zt, { ...ST, seed: 9 + i * 0.37 }, { vBase: -6 });
  }
  // cheeks: the quay mass on both sides of the stairwell (top at 0, faces into the well)
  stone.boxMM(STEPS.x0 - 1.2, -6, zS, STEPS.x0, 0, STEPS.zTop + 0.01, QA(4), { skip: { top: true, bot: true } });
  stone.boxMM(STEPS.x1, -6, zS, STEPS.x1 + 1.2, 0, STEPS.zTop + 0.01, QA(5), { skip: { top: true, bot: true } });
  // the riser at the top of the steps (quay edge behind tread 0)
  stone.quad([STEPS.x1, -0.5, STEPS.zTop], [STEPS.x0, -0.5, STEPS.zTop], [STEPS.x0, 0, STEPS.zTop], [STEPS.x1, 0, STEPS.zTop], ST, 0, -0.5, 16, 0);
  // mooring rings / bollards along the south quay
  for (let x = -300; x <= 300; x += 23) {
    if (x > STEPS.x0 - 3 && x < STEPS.x1 + 3) continue;
    if (Math.abs(x) < 10) continue;
    stone.lathe(x, 0.16, zS + 0.9, [[0.22, 0], [0.25, 0.1], [0.2, 0.45], [0.26, 0.55], [0.2, 0.65], [0.0, 0.68]], 10, { kind: K.METAL, c: col('#6a6a80'), seed: 1 });
  }
  // the bridge at x = 0: deck at y 0, segmental arch, parapets
  {
    const B = QA(20);
    const bx0 = -6.6, bx1 = 6.6;
    stone.boxMM(bx0, -1.0, zN - 0.6, bx1, 0.0, zS + 0.6, B, { skip: { top: false } });
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(zN, -6); sh.lineTo(zS, -6); sh.lineTo(zS, 0); sh.lineTo(zN, 0); sh.closePath();
      const hole = new THREE.Path();
      hole.moveTo(zN + 0.4, -6);
      for (let i = 0; i <= 20; i++) { const t = Math.PI - (i / 20) * Math.PI; hole.lineTo(CANAL.z + Math.cos(t) * 6.6, -3.6 + Math.sin(t) * 2.6); }
      hole.lineTo(zS - 0.4, -6); hole.closePath();
      sh.holes.push(hole);
      const g = new THREE.ShapeGeometry(sh);
      const mm = new THREE.Matrix4().makeTranslation(sx * 6.6, 0, 0).multiply(new THREE.Matrix4().makeRotationY(sx > 0 ? -Math.PI / 2 : Math.PI / 2));
      // shape x -> world z (sign handled by rotation)
      const g2 = g.clone();
      const P = g2.attributes.position;
      for (let i = 0; i < P.count; i++) { const zx = P.getX(i), yy = P.getY(i); P.setXYZ(i, sx * 6.6, yy, zx); }
      g2.computeVertexNormals();
      const N = g2.attributes.normal; for (let i = 0; i < N.count; i++) N.setXYZ(i, sx, 0, 0);
      stone.addGeo(g2, new THREE.Matrix4(), B, { planar: true });
      void mm;
      // parapet with a lit coping
      stone.boxMM(sx > 0 ? 6.0 : -6.6, 0, zN - 0.6, sx > 0 ? 6.6 : -6.0, 1.0, zS + 0.6, B);
      stone.boxMM(sx > 0 ? 5.9 : -6.7, 1.0, zN - 0.7, sx > 0 ? 6.7 : -5.9, 1.15, zS + 0.7, { ...B, c: col('#f6eedf') });
    }
    // intrados (vault under the bridge)
    let prev = null;
    for (let i = 0; i <= 20; i++) {
      const t = Math.PI - (i / 20) * Math.PI;
      const z = CANAL.z + Math.cos(t) * 6.6, y = -3.6 + Math.sin(t) * 2.6;
      if (prev) stone.quad([-6.6, prev[1], prev[0]], [6.6, prev[1], prev[0]], [6.6, y, z], [-6.6, y, z], B, 0, 0, 13.2, 1);
      prev = [z, y];
    }
  }
  // boats moored on the canal: small blue and white rowing boats
  {
    const rb = new Rng(12);
    for (const [x, z, ry] of [[-92, 64.6, 0.04], [-118, 55.6, -0.05], [38, 64.4, 0.02], [74, 55.4, 0.06], [-20, 64.9, -0.03]]) {
      const hull = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      const m = new THREE.Matrix4().makeTranslation(x, -3.3 + 0.38, z).multiply(new THREE.Matrix4().makeRotationY(ry)).multiply(new THREE.Matrix4().makeScale(2.6, 0.62, 0.85));
      stone.addGeo(hull, m, { kind: K.PLAIN, c: col(rb.pick(['#2a6fc0', '#f4efe6', '#2a9d8f'])), seed: 3 }, { planar: true });
      const m2 = new THREE.Matrix4().makeTranslation(x, -3.3 + 0.36, z).multiply(new THREE.Matrix4().makeRotationY(ry));
      stone.addGeo(new THREE.BoxGeometry(5.0, 0.06, 1.5), m2, { kind: K.WOOD, c: col('#b08a62'), seed: 2 }, { planar: true });
    }
  }

  // ------------------------------------------------------------------- wall
  const wall = buildWall(ctx, mat);
  for (const m of wall.meshes) root.add(m);

  // ------------------------------------------------------------- the ground
  const ground = buildGround();
  const gm = groundMaterial();
  const groundMesh = add(ground, gm, 'town-ground');
  void groundMesh;

  // water
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2 * XL, zS - zN, 40, 2).rotateX(-Math.PI / 2).translate(0, CANAL.waterY, CANAL.z), waterMaterial());
  water.frustumCulled = false; water.userData.noShadow = true; water.name = 'canal-water';
  root.add(water);

  // mountains: painted ranges on a band 6.4 km north (and around the sides)
  {
    const R = 6400, cx = 0, cz = -300;
    const seg = 160, a0 = -1.9, a1 = 1.9;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg;
      const x = cx + Math.sin(a) * R, z = cz - Math.cos(a) * R;
      pos.push(x, -60, z, x, 1250, z);
      uv.push(a * R, 0, a * R, 1);
      if (i < seg) { const k = i * 2; idx.push(k, k + 2, k + 3, k, k + 3, k + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const mm = new THREE.Mesh(g, mountainMaterial()); mm.frustumCulled = false; mm.userData.noShadow = true; mm.name = 'mountains';
    root.add(mm);
  }

  // ----------------------------------------------------- foliage: vines, pots, trees, grass
  const nearMesh = add(near.build(), mat, 'town-near');
  const farMesh = add(far.build(), mat, 'town-far');
  const stoneMesh = add(stone.build(), matInk, 'town-stone');
  const facadeMesh = add(hitFacade.build(), mat, 'house-hit-facade');
  const brokenMesh = add(hitBroken.build(), mat, 'house-hit-broken');
  brokenMesh.visible = false;
  // buildings and the wall cast real shadows in the town's own aerial/wide shots
  for (const m of [nearMesh, farMesh, stoneMesh, facadeMesh, brokenMesh, ...wall.meshes]) m.userData.noShadow = false;
  const SHADOW_SHOTS = new Set(['s05', 's08', 's10', 's12', 's24', 's26', 's27']);

  // outside trees + hedges + grass, the meadow foreground at (70, -420)
  const out = new Rng(808);
  const outTrees = [];
  for (let i = 0; i < 260; i++) {
    const x = out.range(-1600, 1600), z = out.range(-2600, -360);
    if (Math.abs(x - 0) < 30) continue;
    if (Math.abs(x - 70) < 60 && z > -480) continue;
    const y = outsideH(x, z);
    outTrees.push([x, y, z, out.range(9, 16), out.next() < 0.4 ? 9 : 0]);
  }
  // a line of trees along the road, small groves near the wall
  for (let z = -380; z > -1400; z -= out.range(26, 40)) {
    const d = Math.max(-314 - z, 0);
    const rx = 9 * Math.sin(d * 0.004) * sst(0, 300, d) + 30 * Math.sin(d * 0.0013 + 0.5) * sst(100, 900, d);
    outTrees.push([rx + out.pick([-9, 9]), outsideH(rx, z), z, out.range(8, 12), 0]);
  }
  for (const [x, z] of [[160, -410], [210, -470], [-140, -430], [-200, -390], [120, -560], [-90, -620], [300, -520]]) {
    for (let k = 0; k < 4; k++) outTrees.push([x + out.range(-14, 14), 0, z + out.range(-10, 10), out.range(10, 16), out.next() < 0.5 ? 9 : 0]);
  }
  const grass = [];
  for (let i = 0; i < 2600; i++) {
    const x = 70 + out.range(-60, 60), z = -420 + out.range(-60, 55);
    const big = out.next() < 0.5;
    grass.push([x, 0, z, big ? out.range(1.6, 2.8) : out.range(0.7, 1.3), big ? 20 : 2, big ? out.range(0.5, 0.9) : out.range(0.4, 0.75)]);
  }
  for (let i = 0; i < 2600; i++) {
    const x = out.range(-420, 420), z = out.range(-900, -330);
    if (Math.abs(x) < 16 && z > -380) continue;
    grass.push([x, outsideH(x, z), z, out.range(1.6, 3.2), 20, out.range(0.5, 0.9)]);
  }
  const greens = foliageMaterial(ctx.atlas, { deep: '#2d4a35', shade: '#3e6a45', mid: '#6d9a4a', light: '#b6cc6a', blossom: '#f6f0e0', blossom2: '#f2c84a' });
  const bougain = foliageMaterial(ctx.atlas, { deep: '#2b4630', shade: '#3e6638', mid: '#5f8f45', light: '#94ba5c', blossom: '#d8308c', blossom2: '#f25aa8' });
  const grassMat = foliageMaterial(ctx.atlas, { deep: '#4f7c40', shade: '#6f9a48', mid: '#9cbc58', light: '#d4de86', blossom: '#fffaf0', blossom2: '#f6d050' });
  const sprites = (list, m, name) => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const im = new THREE.InstancedMesh(geo, m, Math.max(1, list.length));
    const aVar = new Float32Array(Math.max(1, list.length) * 4);
    const M = new THREE.Matrix4();
    list.forEach(([x, y, z, w, idx, hgt], i) => {
      M.makeScale(w, hgt ?? w, 1).setPosition(x, y, z);
      im.setMatrixAt(i, M);
      aVar.set([idx, (hsh(x, z) - 0.5) * 0.3, hsh(z, x), hsh(x * 3, z) < 0.5 ? 1 : 0], i * 4);
    });
    im.count = list.length;
    geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(aVar, 4));
    im.frustumCulled = false; im.userData.noShadow = true; im.name = name;
    root.add(im);
    return im;
  };
  const tl = extras.trees.map(([x, y, z, s]) => [x, y, z, Math.min(9, s), 0]);
  sprites([...outTrees, ...tl], greens, 'trees');
  sprites(grass, grassMat, 'grass');
  sprites(extras.pots.map(([x, y, z, s]) => [x, y - 0.05, z, s, 1]), greens, 'pots');
  sprites(extras.vines.map(([x, y, z, w, h]) => [x, y - h, z, w, 17, h]), bougain, 'vines');

  // laundry lines, as inked wires
  {
    const pos = [], oth = [], side = [], idx = [];
    let n = 0;
    for (const [a, b, sag] of extras.lines) {
      const N = 12;
      const P = [];
      for (let i = 0; i <= N; i++) { const t = i / N; P.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]); }
      for (let i = 0; i < N; i++) {
        const p0 = P[i], p1 = P[i + 1];
        for (const [p, o, s] of [[p0, p1, -1], [p0, p1, 1], [p1, p0, 1], [p1, p0, -1]]) { pos.push(...p); oth.push(...o); side.push(s); }
        idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aOther', new THREE.Float32BufferAttribute(oth, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setIndex(idx);
    const wm = new THREE.Mesh(g, wireMaterial({ width: 1.1, color: '#5a5266', id: 118 }));
    wm.frustumCulled = false; wm.userData.noShadow = true; wm.name = 'lines';
    root.add(wm);
  }

  // ------------------------------------------------------------------ colliders
  const C = (name, boxes) => {
    const m = new THREE.Mesh(plainBoxes(boxes), new THREE.MeshBasicMaterial());
    m.visible = false; m.name = 'col-' + name; root.add(m);
    ctx.colliders.push({ name, dept: 'town', obj: m, kind: 'solid' });
    return m;
  };
  {
    const b = [];
    for (let i = 0; i < STEPS.n; i++) b.push([STEPS.x0, -6, STEPS.zTop - (i + 1) * STEPS.tread, STEPS.x1, -STEPS.rise * (i + 1), STEPS.zTop - i * STEPS.tread]);
    b.push([STEPS.x0 - 12, -6, zS, STEPS.x0, 0, STEPS.zTop + 8]);
    b.push([STEPS.x1, -6, zS, STEPS.x1 + 12, 0, STEPS.zTop + 8]);
    b.push([STEPS.x0, -6, STEPS.zTop, STEPS.x1, 0, STEPS.zTop + 8]);
    C('steps', b);
  }
  C('alley', [[-64.6, 0, -46, -63.5, 14, 10], [-60.5, 0, -46, -59.4, 14, 10], [-63.5, -0.5, -46, -60.5, 0, 10], [-63.6, 4.4, -36.5, -60.4, 8.5, -32.5]]);
  C('laundryRoof', [
    [-77, 0, -70, -63, 10.5, -58],
    [-77, 10.5, -58.26, -63, 11.5, -58], [-77, 10.5, -70, -63, 11.5, -69.74], [-63.26, 10.5, -69.74, -63, 11.5, -58.26], [-77, 10.5, -69.74, -76.74, 11.5, -58.26],
    [-75.66, 10.5, -62.06, -75.54, 12.55, -61.94], [-64.46, 10.5, -62.06, -64.34, 12.55, -61.94], [-75.66, 10.5, -67.06, -75.54, 12.55, -66.94], [-64.46, 10.5, -67.06, -64.34, 12.55, -66.94],
    [-76.5, 10.5, -61.1, -73.6, 13.0, -58.0],
  ]);
  C('houseHit', [[HH[0] - 7.7, 0, HH[2] - 8, HH[0] + 8, 10.8, HH[2] + 8]]);
  const facadeCol = C('houseHitFacade', [[HH[0] - 8.12, 0, HH[2] - 8.12, HH[0] - 7.7, 10.8, HH[2] + 8.12]]);
  for (const m of wall.colliders) { root.add(m); ctx.colliders.push({ name: 'wall', dept: 'town', obj: m, kind: 'solid' }); }

  // ------------------------------------------------------------------ API
  const CUES = ctx.CUES;
  const anchors = {
    gateArch: wall.gateArch,
    gripCrack: new THREE.Vector3((COLOSSUS.gripHand ?? [-33])[0], WALL.h, wallInnerZ((COLOSSUS.gripHand ?? [-33])[0])),
    houseHitFacade: new THREE.Vector3(HH[0] - 8, 5.4, HH[2]),
    bellTowerL: new THREE.Vector3(BELL_TOWERS[0][0], 24.5, BELL_TOWERS[0][2]),
    bellTowerR: new THREE.Vector3(BELL_TOWERS[1][0], 24.5, BELL_TOWERS[1][2]),
    laundryRoof: new THREE.Vector3(...PLACES.laundryRoof),
  };
  function groundY(x, z) {
    const wi = wallInnerZ(Math.max(-1499, Math.min(1499, x)));
    if (z > wi) {
      if (inSteps(x, z)) return stepY(z);
      if (inCanal(x, z) && Math.abs(x) > 6.6) return CANAL.waterY;
      return 0;
    }
    if (z > wallOuterZ(Math.max(-1513, Math.min(1513, x)))) {
      // the gate passage is open ground (floor y 0) — before and after the kick
      if (Math.abs(x) < GATE.w / 2) return 0;
      return WALL.h;   // on the wall
    }
    return outsideH(x, z);
  }
  const town = {
    root, groundY, outsideH,
    anchor(name, v = new THREE.Vector3()) { const a = anchors[name]; return a ? v.copy(a) : v.set(0, 0, 0); },
    gateBroken: (t) => t >= CUES.kick,
    update(st) {
      const t = st.t;
      // cast building shadows only in town shots that turn the shadow map on
      const want = !!st.shadow && SHADOW_SHOTS.has(st.sid);
      const i = ctx.shadowRoots.indexOf(root);
      if (want && i < 0) ctx.shadowRoots.push(root);
      if (!want && i >= 0) ctx.shadowRoots.splice(i, 1);
      // gate states
      const broken = t >= CUES.kick;
      wall.intact.visible = !broken;
      wall.broken.visible = broken;
      wall.rubble.visible = t >= CUES.kick + 0.4;
      wall.doorCol.position.y = broken ? -5000 : 0;
      // the hand crushes the parapet; cracks spread from the grip
      wall.gripMesh.visible = t < CUES.hand + 0.25;   // parapets give way just as the fingers land (38.33)
      // the fingers land at hand + 0.33 s; cracks start there and spread from under them
      TU.uCrack.value.set(anchors.gripCrack.x, anchors.gripCrack.y, anchors.gripCrack.z, 0);
      const ct = t - (CUES.hand + 0.33);
      TU.uCrack.value.w = ct <= 0 ? 0 : 1.5 + 11 * (1 - Math.exp(-ct * 1.6)) + Math.min(ct, 12) * 0.3;
      // the house facade
      const hit = t >= CUES.houseHit;
      facadeMesh.visible = !hit; brokenMesh.visible = hit;
      facadeCol.position.y = hit ? -5000 : 0;
      // wind: the shock gust, the kick gust, a breeze otherwise
      const g1 = t > CUES.shock ? Math.exp(-(t - CUES.shock) * 1.6) * smooth(invLerp(CUES.shock, CUES.shock + 0.12, t)) : 0;
      const g2 = t > CUES.kick ? Math.exp(-(t - CUES.kick) * 1.0) * smooth(invLerp(CUES.kick, CUES.kick + 0.2, t)) * 0.8 : 0;
      TU.uWind.value = Math.max(g1, g2);
      TU.uShadeDeep.value = st.sid === 's19' ? 1 : st.sid === 's24' ? 0.0 : 0;
    },
  };
  ctx.town = town;
  return town;
}

// ------------------------------------------------------------------ ground mesh
// One non-uniform grid for the paved town and the fields outside. Inside the wall it is flat;
// the canal and the stairwell are cut out of it.
function buildGround() {
  const xs = [], zs = [];
  for (let x = 0; x <= 4200; x += 6 + x * 0.045) xs.push(x);
  const XS = [...xs.slice(1).map((x) => -x).reverse(), ...xs];
  for (let z = 1000; z >= -6800; z -= (z > -360 ? 8 : 8 + (-360 - z) * 0.03)) zs.push(z);
  // force exact rows at the canal and step edges so the cut is clean
  const must = [CANAL.z - CANAL.halfW, CANAL.z + CANAL.halfW, STEPS.zTop];
  for (const m of must) zs.push(m);
  zs.sort((a, b) => b - a);
  const mx = [STEPS.x0, STEPS.x1];
  for (const m of mx) XS.push(m);
  XS.sort((a, b) => a - b);
  const pos = [], idx = [];
  const W = XS.length;
  for (const z of zs) for (const x of XS) {
    const inside = z > wallOuterZ(Math.max(-1513, Math.min(1513, x))) - 2;
    pos.push(x, inside ? 0 : outsideH(x, z), z);
  }
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < W - 1; i++) {
    const zc = (zs[j] + zs[j + 1]) / 2, xc = (XS[i] + XS[i + 1]) / 2;
    if (zc > CANAL.z - CANAL.halfW && zc < CANAL.z + CANAL.halfW) continue;   // canal (water below)
    if (inSteps(xc, zc)) continue;
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

// ------------------------------------------------------------------ bell tower
function bellTower(gb, x, z) {
  const W = '#f6f1e6', acc = '#2a4fb8';
  const s = 5.4;
  gb.box(x, 0, z, s + 0.8, 1.2, s + 0.8, 0, { kind: K.LIME, c: col('#efe3cf'), seed: 2 }, { skip: { bot: true } });
  gb.box(x, 1.2, z, s, 20, s, 0, (f) => (f === 'top' ? { kind: K.ROOF, c: col('#efe7da'), seed: 1 } : { kind: K.WIN, c: col(W), c2: col(acc), seed: x * 0.3 + 0.77, fh: 5.2, sp: s }), { vBase: 1.2, skip: { bot: true } });
  // cornice bands
  for (const y of [8.0, 14.8, 21.2]) gb.box(x, y, z, s + 0.35, 0.35, s + 0.35, 0, { kind: K.PLAIN, c: col('#fbf8f1'), seed: 3 });
  // belfry: four piers + arched panels with openings (one per side)
  const y0 = 21.55, bh = 6.4;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) gb.box(x + sx * (s / 2 - 0.55), y0, z + sz * (s / 2 - 0.55), 1.1, bh, 1.1, 0, { kind: K.PLAIN, c: col(W), seed: 4 });
  for (let k = 0; k < 4; k++) {
    const sh = new THREE.Shape();
    const hw = s / 2 - 1.1;
    sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(hw, bh); sh.lineTo(-hw, bh); sh.closePath();
    const hole = new THREE.Path();
    const ow = 2.4, jamb = 4.4;
    hole.moveTo(-ow / 2, 0.9);
    hole.lineTo(-ow / 2, jamb);
    for (let i = 1; i < 16; i++) { const t = Math.PI - (i / 16) * Math.PI; hole.lineTo(Math.cos(t) * ow / 2, jamb + Math.sin(t) * ow / 2); }
    hole.lineTo(ow / 2, jamb); hole.lineTo(ow / 2, 0.9); hole.closePath();
    sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false, curveSegments: 16 });
    const m = new THREE.Matrix4().makeTranslation(x, y0, z).multiply(new THREE.Matrix4().makeRotationY((k * Math.PI) / 2)).multiply(new THREE.Matrix4().makeTranslation(0, 0, s / 2 - 0.5));
    gb.addGeo(g, m, { kind: K.PLAIN, c: col(W), seed: 5 + k }, { planar: true });
  }
  // the bell
  gb.lathe(x, y0 + 1.6, z, [[0.0, 2.2], [0.5, 2.15], [0.75, 1.8], [0.85, 1.0], [1.1, 0.3], [1.25, 0.0], [1.05, 0.05]], 16, { kind: K.METAL, c: col('#c8963c'), seed: 1 });
  gb.box(x, y0 + 3.75, z, 2.6, 0.25, 0.3, 0, { kind: K.WOOD, c: col('#7a5a40'), seed: 1 });
  // cap: a lantern drum and a blue-tiled dome, a gilded finial
  gb.box(x, y0 + bh, z, s + 0.5, 0.5, s + 0.5, 0, { kind: K.PLAIN, c: col('#fbf8f1'), seed: 6 });
  const yc = y0 + bh + 0.5;
  gb.cyl(x, yc, z, 2.6, 0.6, 32, { kind: K.WIN, c: col(W), c2: col(acc), seed: 7, fh: 0.6, sp: 1 }, { cap: true });
  gb.dome(x, yc + 0.6, z, 2.75, 32, { kind: K.DOME, c: col('#3fbfca'), c2: col('#1d4cae'), seed: 8 }, { rows: 14, hk: 1.0, point: 1 });
  gb.lathe(x, yc + 0.6 + 2.75 + 1.3, z, [[0.22, 0], [0.3, 0.15], [0.12, 0.35], [0.2, 0.55], [0.03, 1.0]], 10, { kind: K.METAL, c: col('#e8c060'), seed: 1 });
}
