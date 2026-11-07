import * as THREE from 'three';
import { K, col } from './town-geo.js';
import { Rng } from './util.js';
import { palm, cypress, AWN } from './town-houses.js';

// Street furniture near the town's cameras: crates, barrels, jars, carts, wall lanterns,
// hanging shop signs (pictograms only, no lettering), benches. Everything sits against the
// facades or the plaza edges so the walking lanes stay clear.

const WOOD = (c = '#a07a52') => ({ kind: K.WOOD, c: col(c), seed: 3 });

export function crate(gb, x, z, s, ry, c) {
  gb.box(x, 0, z, s, s * 0.8, s, ry, WOOD(c ?? '#b08a5c'));
  // slats: darker bands on the faces
  gb.box(x, s * 0.36, z, s + 0.04, 0.07, s + 0.04, ry, WOOD('#7d5c3e'));
}

export function barrel(gb, x, z, s) {
  gb.lathe(x, 0, z, [[0.0, 0], [0.32, 0], [0.38, 0.12], [0.42, 0.45], [0.38, 0.8], [0.32, 0.92], [0.0, 0.92]].map(([a, b]) => [a * s, b * s]), 14, WOOD('#9a6e46'));
  for (const y of [0.18, 0.74]) gb.cyl(x, y * s, z, 0.4 * s + 0.01, 0.05 * s, 14, { kind: K.METAL, c: col('#5a5660'), seed: 1 }, { cap: false });
}

export function jars(gb, x, z, r) {
  const n = r.int(2, 4);
  for (let k = 0; k < n; k++) {
    const sc = r.range(0.55, 0.95);
    gb.lathe(x + r.range(-0.4, 0.4), 0, z + r.range(-0.4, 0.4), [[0.16, 0], [0.3, 0.12], [0.38, 0.38], [0.33, 0.66], [0.17, 0.85], [0.15, 0.95], [0.21, 1.0]].map(([a, b]) => [a * sc, b * sc]), 12, { kind: K.CLAY, c: col(r.pick(['#d99a6a', '#c98a5e', '#e2b08a', '#3c78c0'])), seed: k });
  }
}

// a hand cart: bed, low sides, two spoked wheels, shafts resting on the ground, a load
export function cart(gb, x, z, ry, r) {
  const M = (lx, ly, lz) => new THREE.Matrix4().makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeRotationY(ry)).multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz));
  const box = (lx, ly, lz, w, h, d, a, rx = 0) => gb.addGeo(new THREE.BoxGeometry(w, h, d), M(lx, ly, lz).multiply(new THREE.Matrix4().makeRotationX(rx)), a, { planar: true });
  const W = WOOD('#9c7650');
  box(0, 0.72, 0, 1.5, 0.1, 2.3, W);
  box(-0.72, 0.92, 0, 0.06, 0.32, 2.3, W); box(0.72, 0.92, 0, 0.06, 0.32, 2.3, W);
  box(0, 0.92, 1.12, 1.5, 0.32, 0.06, W);
  // shafts slope from the bed to the ground in front
  for (const sx of [-0.55, 0.55]) box(sx, 0.4, -1.75, 0.08, 0.08, 1.7, WOOD('#7d5c3e'), -0.42);
  for (const sx of [-0.84, 0.84]) {
    const wh = new THREE.CylinderGeometry(0.55, 0.55, 0.09, 18);
    gb.addGeo(wh, M(sx, 0.55, 0.25).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), WOOD('#6e5038'), { planar: true });
    const hub = new THREE.CylinderGeometry(0.13, 0.13, 0.16, 10);
    gb.addGeo(hub, M(sx, 0.55, 0.25).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), { kind: K.METAL, c: col('#4a4650'), seed: 1 }, { planar: true });
  }
  // load: sacks, a crate, melons
  const sack = (lx, lz, s, c) => {
    const p = new THREE.Vector3(lx, 0.77, lz).applyMatrix4(M(0, 0, 0));
    gb.lathe(p.x, p.y, p.z, [[0.0, 0], [0.32, 0.02], [0.38, 0.18], [0.3, 0.42], [0.12, 0.52], [0.0, 0.55]].map(([a, b]) => [a * s, b * s]), 10, { kind: K.CLAY, c: col(c), seed: 2 });
  };
  sack(-0.35, -0.5, 1.0, '#e2cfa2'); sack(0.35, -0.45, 0.9, '#d8c49a'); sack(0.0, 0.1, 1.05, '#e8d8b0');
  if (r.next() < 0.6) { const p = new THREE.Vector3(0.3, 0.77, 0.6).applyMatrix4(M(0, 0, 0)); gb.box(p.x, p.y, p.z, 0.6, 0.45, 0.6, ry, WOOD('#b08a5c')); }
  else for (let k = 0; k < 4; k++) { const p = new THREE.Vector3(r.range(-0.4, 0.4), 0.92, r.range(0.3, 0.9)).applyMatrix4(M(0, 0, 0)); gb.dome(p.x, p.y - 0.15, p.z, 0.22, 10, { kind: K.CLAY, c: col('#7fae4a'), seed: k }, { rows: 4 }); }
}

// a wall lantern: iron bracket out of the wall, a lantern with warm glass and a little cap
// (nx, nz) = outward normal of the wall
export function lantern(gb, x, y, z, nx, nz) {
  const ry = Math.atan2(nx, nz);
  const out = 0.55;
  const IRON = { kind: K.METAL, c: col('#3e3a46'), seed: 1 };
  gb.box(x + nx * out / 2, y + 0.55, z + nz * out / 2, Math.abs(nz) > 0.5 ? 0.05 : out, 0.05, Math.abs(nz) > 0.5 ? out : 0.05, 0, IRON);
  const lx = x + nx * out, lz = z + nz * out;
  gb.box(lx, y - 0.05, lz, 0.32, 0.06, 0.32, ry, IRON);
  gb.box(lx, y, lz, 0.26, 0.42, 0.26, ry, { kind: K.CLAY, c: col('#ffe2a0'), seed: 5 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) gb.box(lx + sx * 0.13, y, lz + sz * 0.13, 0.04, 0.42, 0.04, 0, IRON);
  gb.lathe(lx, y + 0.42, lz, [[0.22, 0], [0.18, 0.06], [0.04, 0.2], [0.0, 0.24]], 4, IRON);
}

// a hanging shop sign perpendicular to the wall: a painted board with a simple pictogram
// (fish, jar, key, loaf, cup) as coloured shapes — no lettering
export function shopSign(gb, x, y, z, nx, nz, r) {
  const IRON = { kind: K.METAL, c: col('#3e3a46'), seed: 1 };
  const along = Math.abs(nz) > 0.5;
  const arm = 1.25;
  gb.box(x + nx * arm / 2, y + 0.04, z + nz * arm / 2, along ? 0.05 : arm, 0.05, along ? arm : 0.05, 0, IRON);
  const bx = x + nx * (arm * 0.55), bz = z + nz * (arm * 0.55);
  const ry = along ? Math.PI / 2 : 0;   // the board's face looks along the street
  const bg = r.pick(['#2a9d8f', '#f2a93b', '#1f5fae', '#e8e0cc', '#c8503c']);
  const fg = bg === '#e8e0cc' || bg === '#f2a93b' ? '#1f3f8e' : '#f7f1e2';
  const bw = 0.82, bh = 0.6;
  gb.box(bx, y - 0.1 - bh, bz, bw + 0.08, bh + 0.08, 0.06, ry, WOOD('#5e4632'));
  gb.box(bx, y - 0.06 - bh, bz, bw, bh, 0.1, ry, { kind: K.METAL, c: col(bg), seed: 2 });
  // pictogram on both faces: small inset shapes
  const P = (dx, dy, w, h) => { for (const s of [-1, 1]) { const ox = along ? s * 0.06 : dx, oz = along ? dx : s * 0.06; gb.box(bx + ox, y - 0.06 - bh + dy, bz + oz, along ? 0.02 : w, h, along ? w : 0.02, 0, { kind: K.METAL, c: col(fg), seed: 3 }); } };
  const kind = r.int(0, 3);
  if (kind === 0) { P(0, 0.22, 0.42, 0.16); P(0.26, 0.2, 0.1, 0.2); }                  // fish
  else if (kind === 1) { P(0, 0.12, 0.24, 0.3); P(0, 0.42, 0.12, 0.08); }               // jar
  else if (kind === 2) { P(-0.12, 0.3, 0.16, 0.16); P(0.08, 0.3, 0.3, 0.05); P(0.2, 0.25, 0.04, 0.1); }   // key
  else { P(0, 0.14, 0.32, 0.18); P(0.17, 0.2, 0.08, 0.1); }                             // cup
  // two chains
  for (const s of [-0.32, 0.32]) gb.box(bx + (along ? 0 : s), y - 0.1, bz + (along ? s : 0), 0.025, 0.2, 0.025, 0, IRON);
}

// a market stall: four poles, a striped canvas roof, a trestle table heaped with produce
export function stall(gb, x, z, ry, r, awn) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const W = WOOD('#8a6a4a');
  const w = 3.2, d = 2.0, h = 2.4;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [px, pz] = P(sx * w / 2, sz * d / 2); gb.box(px, 0, pz, 0.1, h + (sz < 0 ? 0.3 : 0), 0.1, ry, W); }
  const AW = { kind: K.AWN, c: col(awn[0]), c2: col(awn[1]), seed: x };
  const q = (lx, ly, lz) => { const [px, pz] = P(lx, lz); return [px, ly, pz]; };
  gb.quad(q(-w / 2 - 0.2, h - 0.05, d / 2 + 0.3), q(w / 2 + 0.2, h - 0.05, d / 2 + 0.3), q(w / 2 + 0.2, h + 0.35, -d / 2 - 0.1), q(-w / 2 - 0.2, h + 0.35, -d / 2 - 0.1), AW, 0, 0, w + 0.4, d + 0.4);
  gb.quad(q(-w / 2 - 0.2, h - 0.4, d / 2 + 0.3), q(w / 2 + 0.2, h - 0.4, d / 2 + 0.3), q(w / 2 + 0.2, h - 0.05, d / 2 + 0.3), q(-w / 2 - 0.2, h - 0.05, d / 2 + 0.3), AW, 0, 0, w + 0.4, 0.35);
  const [tx, tz] = P(0, 0.2);
  gb.box(tx, 0.82, tz, w - 0.3, 0.08, 1.0, ry, W);
  for (const sx of [-1, 1]) { const [lx, lz] = P(sx * (w / 2 - 0.4), 0.2); gb.box(lx, 0, lz, 0.08, 0.82, 0.9, ry, W); }
  // produce: baskets of oranges, lemons, aubergines, a pile of melons
  const fruit = ['#f29a2e', '#f2d23a', '#6a3a8a', '#e04a3a', '#8fbf4a'];
  for (let k = 0; k < 5; k++) {
    const [bx, bz] = P(-w / 2 + 0.55 + k * 0.52, 0.2 + r.range(-0.2, 0.2));
    gb.cyl(bx, 0.9, bz, 0.22, 0.14, 10, WOOD('#c8a070'), { cap: true });
    gb.dome(bx, 1.02, bz, 0.2, 10, { kind: K.CLAY, c: col(fruit[k % fruit.length]), seed: k }, { rows: 4 });
  }
}

// a stone well with a wooden frame, a pulley beam and a bucket
export function well(gb, x, z) {
  const S = { kind: K.LIME, c: col('#efe0c8'), seed: 6 };
  gb.lathe(x, 0, z, [[1.15, 0], [1.2, 0.1], [1.15, 0.85], [1.25, 0.9], [1.25, 1.0], [0.95, 1.0], [0.95, 0.2]], 20, S);
  gb.disc(x, 0.25, z, 0.95, 20, { kind: K.VOID, c: col('#2a2a3a'), seed: 1 }, 1);
  for (const sx of [-1, 1]) gb.box(x + sx * 1.0, 1.0, z, 0.14, 1.6, 0.14, 0, WOOD('#7d5c3e'));
  gb.box(x, 2.55, z, 2.3, 0.14, 0.14, 0, WOOD('#7d5c3e'));
  gb.lathe(x + 0.6, 1.2, z + 0.4, [[0.0, 0], [0.18, 0], [0.22, 0.3], [0.0, 0.3]], 10, WOOD('#9a6e46'));
}

export function bench(gb, x, z, ry) {
  const S = { kind: K.LIME, c: col('#efe0c8'), seed: 4 };
  gb.box(x, 0, z, 1.8, 0.42, 0.5, ry, S);
}

// place the furniture of the main street (west wall x = -7, east wall x = 7), the gate plaza,
// and around the hit house. Returns nothing; adds to the GeoB.
export function placeProps(gb, seed = 77) {
  const r = new Rng(seed);
  // main street from the plaza to the square: alternate sides, every 5-9 m
  for (const side of [-1, 1]) {
    const z0 = side < 0 ? -258 : -242, z1 = -170;
    const wx = side * 7;            // the facade plane
    for (let z = z0 + r.range(1, 4); z < z1; z += r.range(5, 9)) {
      const px = wx - side * 0.55;  // just in front of the wall
      const t = r.next();
      if (t < 0.22) { crate(gb, px, z, r.range(0.65, 0.85), r.range(-0.2, 0.2)); if (r.next() < 0.5) crate(gb, px, z + 0.9, 0.6, 0.3); }
      else if (t < 0.38) jars(gb, px, z, r);
      else if (t < 0.5) barrel(gb, px, z, r.range(0.9, 1.1));
      else if (t < 0.6) bench(gb, wx - side * 0.3, z, Math.PI / 2);
      // above: lanterns and signs on the facade (clear of the awnings)
      const u = r.next();
      if (u < 0.45) lantern(gb, wx, 3.5, z + 1.6, -side, 0);
      else if (u < 0.8) shopSign(gb, wx, 4.3, z + 1.2, -side, 0, r);
    }
  }
  // gate plaza (x -34..34, z -296..-262): carts, crates and barrels along its sides
  cart(gb, -24, -270, 0.5, r);
  cart(gb, 25, -287, -2.4, r);
  for (const [x, z] of [[-30, -278], [-28.6, -279.2], [29, -272], [-27, -266], [30.5, -266.5]]) crate(gb, x, z, r.range(0.7, 0.95), r.range(-0.4, 0.4));
  for (const [x, z] of [[-31, -284], [-30, -285.2], [31, -280], [28, -293]]) barrel(gb, x, z, r.range(0.9, 1.1));
  jars(gb, 27, -264.5, r); jars(gb, -32, -290, r);
  // a stall and a well for the plaza's life; two palms and a cypress at its corners
  stall(gb, -29.5, -288.5, Math.PI / 2 + 0.1, r, AWN[1]);
  stall(gb, 29.5, -283, -Math.PI / 2, r, AWN[0]);
  well(gb, 22, -268);
  palm(gb, -32.5, -271.5, 8.5, 1.3); palm(gb, 32.5, -272.5, 7.6, 2.1); cypress(gb, -31.5, -295.5, 9, 0.4);
  // around the hit house's street front (facade at x = 8, z -260..-244): crates by the door, a jar group
  crate(gb, 7.45, -258.5, 0.8, 0.1); crate(gb, 7.5, -257.6, 0.6, -0.2);
  jars(gb, 7.3, -246, r);
}
