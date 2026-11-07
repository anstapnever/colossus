import * as THREE from 'three';
import { GeoB, K, col } from './town-geo.js';
import { wallInnerZ, CANAL, STEPS, PLACES, BELL_TOWERS } from './layout.js';
import { Rng } from './util.js';

// Houses of the white town: cubic stucco blocks of 2-4 storeys with flat roof terraces,
// parapets, glazed domes, stair kiosks, water jars, pergolas with striped canvas, laundry.
export const WHITES = ['#f7f3ea', '#f4eee2', '#f1e9da', '#ede2cf', '#f6f0e4', '#eadbc2', '#f3e6d0', '#efe5d8'];
export const SANDS = ['#ead6b6', '#e6cfa9', '#efdcbf', '#e9d2b0'];
export const BLUES = ['#2a4fb8', '#1f5fae', '#2f6cc0', '#1d4aa0', '#2a8fb0', '#2b8f8a', '#3a62c4'];
export const DOME_TOP = ['#45c4cc', '#3bb6d0', '#56cbd2', '#3aa6d6'];
export const DOME_BASE = ['#1e4cae', '#2259b8', '#1b44a0'];
export const AWN = [['#2a9d8f', '#f7f3ea'], ['#f2a93b', '#f7f3ea'], ['#1f8fa0', '#f7f3ea'], ['#e9962a', '#fbf1d8'], ['#2a9d8f', '#f2a93b']];
export const CLOTHS = ['#f8f6f0', '#f2c6c2', '#a9d3e8', '#f6e3a0', '#ffffff', '#c8e0c0', '#f0a8a0', '#ffffff', '#e8e2f6'];

const pick = (r, a) => a[Math.floor(r.next() * a.length) % a.length];

// h: { x, z, w, d, ry, floors, fh, wall, accent, seed, detail, kiosk, dome, jars, pergola, laundry, setback, front: 'pz'|'nz'|'px'|'nx'|null, awning, skipFace }
export function house(gb, h, extras) {
  const r = new Rng(Math.floor(h.seed * 1000) + 7);
  const H = h.floors * h.fh;
  const wallC = col(h.wall), acc = col(h.accent);
  const nU = (len) => Math.max(1, Math.round(len / (h.sp ?? 3.1)));
  const faceA = (f) => {
    if (f === 'top') return { kind: K.ROOF, c: col(h.roof ?? '#f4f2ee'), seed: h.seed };
    if (f === 'bot') return { kind: K.PLAIN, c: wallC, seed: h.seed };
    const len = f === 'px' || f === 'nx' ? h.d : h.w;
    const blank = h.blank && h.blank.includes(f);
    return { kind: blank ? K.PLAIN : K.WIN, c: wallC, c2: acc, seed: h.seed + (f.charCodeAt(1) % 7) * 0.13, fh: h.fh, sp: len / nU(len) };
  };
  const skip = { bot: true };
  if (h.skipFace) skip[h.skipFace] = true;
  gb.box(h.x, 0, h.z, h.w, H, h.d, h.ry, faceA, { skip });
  const c = Math.cos(h.ry), s = Math.sin(h.ry);
  const W = (lx, lz) => [h.x + lx * c + lz * s, h.z - lx * s + lz * c];
  if (!h.detail) {
    // far: a cornice lip + a simple parapet rim reads at distance
    gb.box(h.x, H, h.z, h.w, 0.9, h.d, h.ry, (f) => (f === 'top' ? { kind: K.ROOF, c: col(h.roof ?? '#f4f2ee'), seed: h.seed } : { kind: K.PLAIN, c: wallC, seed: h.seed }), { skip: { bot: true } });
    if (h.dome) { const [dx, dz] = domePos(W, h); gb.cyl(dx, H + 0.9, dz, h.dome.r * 1.02, h.dome.drum ?? 1, 12, { kind: K.PLAIN, c: wallC, seed: h.seed }, { cap: false }); gb.dome(dx, H + 0.9 + (h.dome.drum ?? 1), dz, h.dome.r, 12, { kind: K.DOME, c: col(h.dome.top), c2: col(h.dome.base), seed: h.seed }, { rows: 5 }); }
    return H;
  }
  // cornice: a thin projecting lip with a drawn shadow below
  const lipA = { kind: K.PLAIN, c: wallC.map((v) => Math.min(1, v * 1.02)), seed: h.seed };
  gb.box(h.x, H - 0.3, h.z, h.w + 0.24, 0.28, h.d + 0.24, h.ry, lipA, { skip: { bot: false } });
  // parapet walls
  const pt = 0.26, ph = h.parapet ?? 1.0;
  const pa = { kind: K.PLAIN, c: wallC, seed: h.seed + 0.5 };
  const hw = h.w / 2, hd = h.d / 2;
  const part = (lx, lz, w, d) => { const [x, z] = W(lx, lz); gb.box(x, H, z, w, ph, d, h.ry, pa, { skip: { bot: true }, vBase: H }); };
  part(0, hd - pt / 2, h.w, pt);
  part(0, -hd + pt / 2, h.w, pt);
  part(hw - pt / 2, 0, pt, h.d - 2 * pt);
  part(-hw + pt / 2, 0, pt, h.d - 2 * pt);
  // stepped corner merlons on some parapets
  if (h.corners) for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [x, z] = W(sx * (hw - 0.3), sz * (hd - 0.3)); gb.box(x, H + ph, z, 0.6, 0.45, 0.6, h.ry, pa, { skip: { bot: true } }); }
  // ---- roof furniture
  const roofY = H;
  const inner = (u, v) => W((u - 0.5) * (h.w - 1.4), (v - 0.5) * (h.d - 1.4));
  if (h.kiosk) {
    const kw = 2.6, kd = 2.6, kh = 2.5;
    const [x, z] = W((hw - kw / 2 - 0.3) * h.kiosk[0], (hd - kd / 2 - 0.3) * h.kiosk[1]);
    gb.box(x, roofY, z, kw, kh, kd, h.ry, (f) => (f === 'top' ? { kind: K.ROOF, c: col('#f4f2ee'), seed: h.seed + 3 } : { kind: K.WIN, c: wallC, c2: acc, seed: h.seed + 9.1 + (f === 'pz' ? 0.37 : 0), fh: 2.5, sp: 2.6 }), { skip: { bot: true } });
    gb.box(x, roofY + kh, z, kw + 0.2, 0.2, kd + 0.2, h.ry, (f) => (f === 'top' ? { kind: K.ROOF, c: col('#f4f2ee'), seed: h.seed + 3 } : lipA), { skip: { bot: false } });
    if (h.kioskDome) gb.dome(x, roofY + kh + 0.2, z, 1.15, 16, { kind: K.DOME, c: col(h.kioskDome[0]), c2: col(h.kioskDome[1]), seed: h.seed }, { rows: 7 });
  }
  if (h.dome) {
    const [x, z] = domePos(W, h);
    gb.cyl(x, roofY, z, h.dome.r * 1.02, h.dome.drum, 24, { kind: K.WIN, c: wallC, c2: acc, seed: h.seed + 4.4, fh: h.dome.drum, sp: 1.6 }, { cap: false });
    gb.cyl(x, roofY + h.dome.drum, z, h.dome.r * 1.08, 0.22, 24, lipA, { cap: true });
    gb.dome(x, roofY + h.dome.drum + 0.2, z, h.dome.r, 28, { kind: K.DOME, c: col(h.dome.top), c2: col(h.dome.base), seed: h.seed }, { rows: 12, hk: h.dome.hk ?? 1, point: h.dome.point ?? 0 });
    const tipY = roofY + h.dome.drum + 0.2 + h.dome.r * (h.dome.hk ?? 1) + (h.dome.point ? h.dome.r * 0.5 : 0);
    gb.lathe(x, tipY - 0.05, z, [[0.18, 0], [0.24, 0.2], [0.1, 0.45], [0.16, 0.65], [0.02, 1.1]], 10, { kind: K.METAL, c: col('#e8c060'), seed: 1 });
  }
  for (const j of h.jars || []) {
    const [x, z] = inner(j[0], j[1]);
    const sc = j[2];
    gb.lathe(x, roofY, z, [[0.16, 0], [0.3, 0.12], [0.38, 0.38], [0.33, 0.66], [0.17, 0.85], [0.15, 0.95], [0.21, 1.0]].map(([a, b]) => [a * sc, b * sc]), 12, { kind: K.CLAY, c: col(j[3] ?? '#d99a6a'), seed: h.seed });
    if (extras && j[4]) extras.pots.push([x, roofY + sc * 0.9, z, sc * 1.6]);
  }
  if (h.pergola) {
    // 4 posts + striped canvas sloping toward the street side
    const [u0, v0, u1, v1] = h.pergola;
    const P = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => inner(u, v));
    const postH = 2.3;
    for (const [x, z] of P) gb.box(x, roofY, z, 0.14, postH, 0.14, h.ry, { kind: K.WOOD, c: col('#b9a48a'), seed: 2 });
    const [a, b2] = h.awnCol;
    const AW = { kind: K.AWN, c: col(a), c2: col(b2), seed: h.seed };
    const L = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), Dd = Math.hypot(P[3][0] - P[0][0], P[3][1] - P[0][1]);
    gb.quad([P[0][0], roofY + postH, P[0][1]], [P[1][0], roofY + postH, P[1][1]], [P[2][0], roofY + postH - 0.25, P[2][1]], [P[3][0], roofY + postH - 0.25, P[3][1]], AW, 0, 0, L, Dd);
    // valance
    gb.quad([P[3][0], roofY + postH - 0.6, P[3][1]], [P[2][0], roofY + postH - 0.6, P[2][1]], [P[2][0], roofY + postH - 0.25, P[2][1]], [P[3][0], roofY + postH - 0.25, P[3][1]], AW, 0, 0, L, 0.35);
  }
  if (h.laundry && extras) {
    const [u0, v0, u1, v1] = h.laundry;
    const a0 = inner(u0, v0), a1 = inner(u1, v1);
    const y = roofY + 1.9;
    for (const [x, z] of [a0, a1]) gb.box(x, roofY, z, 0.1, 2.0, 0.1, h.ry, { kind: K.WOOD, c: col('#9e8b74'), seed: 2 });
    extras.lines.push([[a0[0], y, a0[1]], [a1[0], y, a1[1]], 0.25]);
    clothes(gb, a0, a1, y, r, 0.25);
  }
  for (const [x, y, z] of h.vents || []) gb.box(x, roofY, z, 0.7, y, 0.7, h.ry, pa, { skip: { bot: true } });
  // water tanks on little stands (white or blue), roof planters
  for (const [u, v, tc] of h.tanks || []) {
    const [x, z] = inner(u, v);
    const TK = { kind: K.METAL, c: col(tc), seed: h.seed };
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) gb.box(x + sx * 0.42, roofY, z + sz * 0.42, 0.1, 0.8, 0.1, 0, { kind: K.METAL, c: col('#8a8f9a'), seed: 1 });
    gb.box(x, roofY + 0.8, z, 1.2, 0.08, 1.2, 0, { kind: K.METAL, c: col('#8a8f9a'), seed: 1 });
    gb.cyl(x, roofY + 0.88, z, 0.6, 1.15, 14, TK, { cap: true });
  }
  if (extras) for (const [u, v, s] of h.plants || []) { const [x, z] = inner(u, v); gb.box(x, roofY, z, s * 0.8, 0.45, s * 0.8, h.ry, { kind: K.CLAY, c: col('#c98a5e'), seed: h.seed }); extras.pots.push([x, roofY + 0.4 + s * 0.45, z, s * 1.4]); }
  if (h.front) frontExtras(gb, h, extras, H, r);
  return H;
}


// a date palm: a gently curved ringed trunk and a crown of drooping fronds
export function palm(gb, x, z, ht, seed) {
  const r = new Rng(Math.floor(seed * 977) + 3);
  const lean = r.range(0, Math.PI * 2), lk = r.range(0.04, 0.12);
  const TR = { kind: K.WOOD, c: col('#9a7a58'), seed };
  const segs = 7;
  let px = x, pz = z;
  for (let i = 0; i < segs; i++) {
    const t = i / segs, y = t * ht;
    const off = lk * ht * t * t;
    const cx = x + Math.cos(lean) * off, cz = z + Math.sin(lean) * off;
    gb.cyl(cx, y, cz, 0.26 - 0.06 * t, ht / segs + 0.05, 8, TR, { cap: false });
    px = cx; pz = cz;
  }
  const top = ht;
  const LF = { kind: K.FOLI, c: col('#4f8f3e'), c2: col('#2f5f34'), seed };
  const nf = 11;
  for (let k = 0; k < nf; k++) {
    const a = (k / nf) * Math.PI * 2 + r.range(-0.2, 0.2);
    const len = r.range(3.2, 4.4);
    let pitch = r.range(-0.55, 0.15) + (k % 3 === 0 ? 0.35 : 0);
    let fx = px, fy = top, fz = pz;
    for (let j = 0; j < 4; j++) {
      const sl = len / 4, wd = 0.95 - j * 0.18;
      const g = new THREE.BoxGeometry(wd, 0.06, sl);
      const m = new THREE.Matrix4().makeRotationY(-a + Math.PI / 2).multiply(new THREE.Matrix4().makeRotationX(-pitch)).multiply(new THREE.Matrix4().makeTranslation(0, 0, sl / 2));
      const mm = new THREE.Matrix4().makeTranslation(fx, fy, fz).multiply(m);
      gb.addGeo(g, mm, LF, { planar: true });
      const dir = new THREE.Vector3(0, 0, sl).applyMatrix4(m);
      fx += dir.x; fy += dir.y; fz += dir.z;
      pitch -= 0.32;
    }
  }
  gb.lathe(px, top - 0.6, pz, [[0.3, 0], [0.42, 0.3], [0.3, 0.7], [0.05, 0.9]], 8, { kind: K.FOLI, c: col('#7a6a3a'), seed });
}
// an Italian cypress: a tall dark-green flame
export function cypress(gb, x, z, ht, seed) {
  const w = ht * 0.13;
  gb.lathe(x, 0, z, [[0.0, 0], [w * 0.75, 0.04 * ht], [w, 0.28 * ht], [w * 0.88, 0.55 * ht], [w * 0.55, 0.8 * ht], [w * 0.18, 0.96 * ht], [0.0, ht]], 12, { kind: K.FOLI, c: col('#3c6e44'), c2: col('#24452e'), seed });
}

// street-front extras: shop awning, balcony with railing, bougainvillea from the parapet
export function frontExtras(gb, h, extras, H, r) {
  const wallC = col(h.wall), acc = col(h.accent);
    const F = frontFrame(h);
    if (h.awning) {
      // shop awning: sloped striped canvas over the ground floor + scalloped valance
      const [a, b2] = h.awnCol;
      const AW = { kind: K.AWN, c: col(a), c2: col(b2), seed: h.seed };
      const y0 = h.fh * 0.86, out = 1.7, drop = 0.7;
      const L = F.len - 0.8;
      const p0 = F.at(-L / 2, 0.02, y0), p1 = F.at(L / 2, 0.02, y0), p2 = F.at(L / 2, out, y0 - drop), p3 = F.at(-L / 2, out, y0 - drop);
      gb.quad(p3, p2, p1, p0, AW, 0, out + 0.0, L, 0.0);
      gb.quad(F.at(-L / 2, out, y0 - drop - 0.35), F.at(L / 2, out, y0 - drop - 0.35), p2, p3, AW, 0, 0, L, 0.35);
      for (const sx of [-1, 1]) {
        const q0 = F.at(sx * L / 2, 0.02, y0), q1 = F.at(sx * L / 2, out, y0 - drop), q2 = F.at(sx * L / 2, out, y0 - drop - 0.35);
        gb.quad(q0, q1, q2, q0, AW, 0, 0, out, 0.35);
      }
    }
    if (h.balcony) {
      const [fl, u, bw] = h.balcony;
      const y = fl * h.fh;
      const B = { kind: K.PLAIN, c: wallC, seed: h.seed + 1.1 };
      const ctr = F.at(u, 0.55, y);
      gb.box(ctr[0], y - 0.18, ctr[2], bw, 0.18, 1.1, F.ry, B, { skip: { bot: false } });
      // iron railing: top rail + bars (cobalt painted)
      const RA = { kind: K.METAL, c: acc.map((v) => v * 0.8), seed: 1 };
      const rf = F.at(u, 1.05, y);
      gb.box(rf[0], y + 0.95, rf[2], bw, 0.06, 0.06, F.ry, RA);
      const nb = Math.round(bw / 0.16);
      for (let k = 0; k <= nb; k++) { const bp = F.at(u - bw / 2 + (k / nb) * bw, 1.05, y); gb.box(bp[0], y, bp[2], 0.035, 0.95, 0.035, F.ry, RA, { skip: { top: true, bot: true } }); }
      for (const sx of [-1, 1]) { const sp = F.at(u + sx * bw / 2, 0.55, y); gb.box(sp[0], y + 0.95, sp[2], 0.06, 0.06, 1.0, F.ry, RA); }
      if (extras) extras.pots.push([ctr[0], y + 0.15, ctr[2], 0.9]);
    }
    if (extras && h.vine) {
      // bougainvillea spilling from the parapet / over a door
      const [u, w2] = h.vine;
      const p = F.at(u, 0.25, H - 0.2);
      extras.vines.push([p[0], H + 0.6, p[2], w2, h.fh * (0.9 + r.next() * 1.2)]);
    }
  }

function domePos(W, h) {
  const [x, z] = W(h.dome.u * (h.w / 2 - h.dome.r - 0.4), h.dome.v * (h.d / 2 - h.dome.r - 0.4));
  return [x, z];
}

// local frame on the street-facing face: at(u along, out from face, y)
function frontFrame(h) {
  const c = Math.cos(h.ry), s = Math.sin(h.ry);
  const hw = h.w / 2, hd = h.d / 2;
  let ox, oz, tx, tz, nx, nz, len;
  // in local coords: pz face at lz=+hd, normal +z, u along +x
  if (h.front === 'pz') { ox = 0; oz = hd; tx = 1; tz = 0; nx = 0; nz = 1; len = h.w; }
  else if (h.front === 'nz') { ox = 0; oz = -hd; tx = -1; tz = 0; nx = 0; nz = -1; len = h.w; }
  else if (h.front === 'px') { ox = hw; oz = 0; tx = 0; tz = -1; nx = 1; nz = 0; len = h.d; }
  else { ox = -hw; oz = 0; tx = 0; tz = 1; nx = -1; nz = 0; len = h.d; }
  const L = (lx, lz) => [h.x + lx * c + lz * s, h.z - lx * s + lz * c];
  const ry = h.ry + (h.front === 'px' || h.front === 'nx' ? Math.PI / 2 : 0);
  return {
    len, ry,
    at(u, out, y) { const [x, z] = L(ox + tx * u + nx * out, oz + tz * u + nz * out); return [x, y, z]; },
  };
}

// cloth hanging on a line between two points at height y
export function clothes(gb, a0, a1, y, r, sag = 0.25, skipRange = null) {
  const dx = a1[0] - a0[0], dz = a1[1] - a0[1];
  const L = Math.hypot(dx, dz);
  const tx = dx / L, tz = dz / L;
  let u = 0.4 + r.next() * 0.4;
  while (u < L - 0.8) {
    const w = 0.5 + r.next() * 1.1, hgt = 0.5 + r.next() * 0.9;
    if (u + w > L - 0.3) break;
    if (skipRange && u + w > skipRange[0] && u < skipRange[1]) { u = skipRange[1] + 0.2; continue; }
    const f0 = u / L, f1 = (u + w) / L;
    const y0 = y - sag * 4 * f0 * (1 - f0), y1 = y - sag * 4 * f1 * (1 - f1);
    const p0 = [a0[0] + tx * u, a0[1] + tz * u], p1 = [a0[0] + tx * (u + w), a0[1] + tz * (u + w)];
    const A = { kind: K.CLOTH, c: col(pick(r, CLOTHS)), c2: col(pick(r, ['#2a4fb8', '#e04a5a', '#2a9d8f', '#f2a93b'])), seed: r.next() };
    // v measured downward from the line: negative v = hang distance (vertex sway uses it)
    gb.quad([p0[0], y0 - hgt, p0[1]], [p1[0], y1 - hgt, p1[1]], [p1[0], y1, p1[1]], [p0[0], y0, p0[1]], A, 0, -hgt, w, 0);
    u += w + 0.15 + r.next() * 0.5;
  }
}

// --------------------------------------------------------------------- layout
// Reserved rectangles where generic blocks may not put houses: [x0, z0, x1, z1]
export const RESERVED = [
  [-60, -340, 60, -262],          // gate plaza
  [-52, -166, 52, -74],           // the square and its frame
  [-9, -400, 9, 2000],            // main street + its continuation to the bridge and south
  [-1e4, 44, 1e4, 82],            // canal with both promenades
  [-92, -88, -42, 12],            // alley + laundry house block
  [6, -264, 30, -238],            // the house that gets hit
];
const inRes = (x0, z0, x1, z1, list = RESERVED) => list.some(([a, b, c, d]) => x1 > a && x0 < c && z1 > b && z0 < d);

// a smooth domain warp bends the street plan into winding lanes; it fades out near the
// reserved straight places (main street, square, plaza, alley) so their framing stays exact
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dRes = (x, z) => Math.min(...RESERVED.map(([a, b, c, d]) => Math.hypot(Math.max(a - x, 0, x - c), Math.max(b - z, 0, z - d))));
const warpRaw = (x, z) => [16 * Math.sin(z * 0.011 + 1.3) + 7 * Math.sin(z * 0.027 + x * 0.006 + 2.1), 10 * Math.sin(x * 0.012 + 0.4) + 5 * Math.sin(x * 0.031 - z * 0.008 + 0.7)];
export function warpPt(x, z) {
  const f = sst(6, 46, dRes(x, z));
  const [dx, dz] = warpRaw(x, z);
  return [x + dx * f, z + dz * f];
}
const warpRy = (x, z) => {
  const a = warpPt(x - 1, z), b = warpPt(x + 1, z);
  return Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
};

export function planTown(seed = 11) {
  const r = new Rng(seed);
  const lots = [];
  // N-S streets (x), jittered; every column strip gets its OWN cross streets so
  // junctions stagger into T's and the blocks vary in length (no continuous grid lines)
  const xs = [];
  for (let x = -900; x <= 900; x += 0) {
    xs.push([x, r.range(3.8, 6.2)]);
    x += r.range(32, 58);
    if (Math.abs(x) < 30) x = x < 0 ? -30 : 30;
  }
  xs.push([0, 12]);
  xs.sort((a, b) => a[0] - b[0]);
  const push = (l) => {
    // bend the lot into the winding plan, re-check the reserved places and the wall
    const [wx, wz] = warpPt(l.x, l.z);
    const ry = warpRy(l.x, l.z);
    const hx = (Math.abs(Math.cos(ry)) * l.w + Math.abs(Math.sin(ry)) * l.d) / 2, hz = (Math.abs(Math.sin(ry)) * l.w + Math.abs(Math.cos(ry)) * l.d) / 2;
    if (inRes(wx - hx, wz - hz, wx + hx, wz + hz)) return;
    if (wz - hz < Math.max(wallInnerZ(wx - hx), wallInnerZ(wx + hx)) + 24) return;
    if (BELL_TOWERS.some(([bx, , bz]) => Math.abs(wx - bx) < 6 + hx && Math.abs(wz - bz) < 6 + hz)) return;
    lots.push({ ...l, x: wx, z: wz, ry });
  };
  for (let i = 0; i < xs.length - 1; i++) {
    const bx0 = xs[i][0] + xs[i][1] / 2, bx1 = xs[i + 1][0] - xs[i + 1][1] / 2;
    if (bx1 - bx0 < 8) continue;
    const zs = [];
    for (let z = -340 + r.range(-12, 12); z <= 700; z += 0) { zs.push([z, r.range(3.6, 6.0)]); z += r.next() < 0.18 ? r.range(60, 80) : r.range(24, 46); }
    zs.push([63, 38]);
    zs.sort((a, b) => a[0] - b[0]);
    for (let j = 0; j < zs.length - 1; j++) {
      const bz0 = zs[j][0] + zs[j][1] / 2, bz1 = zs[j + 1][0] - zs[j + 1][1] / 2;
      if (bz1 - bz0 < 8) continue;
      const depth = bz1 - bz0;
      // deep blocks keep an inner courtyard with trees between the two rows
      const court = depth > 30 && r.next() < 0.75;
      const rows = depth > 20 ? 2 : 1;
      const rd = court ? depth * r.range(0.33, 0.4) : depth / rows;
      for (let row = 0; row < rows; row++) {
        const rz0 = row === 0 ? bz0 : bz1 - rd, rz1 = row === 0 ? bz0 + rd : bz1;
        let x = bx0;
        while (x < bx1 - 4) {
          let w = r.range(5.5, 13);
          if (bx1 - (x + w) < 5) w = bx1 - x;
          const lx0 = x, lx1 = x + w;
          x += w;
          const setF = r.next() < 0.3 ? r.range(0.3, 1.8) : 0;
          const back = r.next() < 0.4 ? r.range(0.5, Math.min(5, rd * 0.35)) : 0;
          const z0 = row === 0 ? rz0 + setF : rz0 + back, z1 = row === 0 ? rz1 - back : rz1 - setF;
          const cx = (lx0 + lx1) / 2, cz = (z0 + z1) / 2;
          if (Math.abs(cx) > 1250) continue;
          if (r.next() < 0.04) { lots.push({ garden: true, x: warpPt(cx, cz)[0], z: warpPt(cx, cz)[1], w: lx1 - lx0, d: z1 - z0 }); continue; }
          const front = row === 0 ? 'nz' : 'pz';
          if (w > 9 && r.next() < 0.35) {
            // stair-stepped pair: a taller block and a lower terrace beside it
            const sp = w * r.range(0.4, 0.6), lo = r.next() < 0.5;
            push({ x: lx0 + sp / 2, z: cz, w: sp - 0.02, d: z1 - z0, front, fd: lo ? -1 : 1 });
            const dd = (z1 - z0) * r.range(0.7, 1.0);
            push({ x: lx0 + sp + (w - sp) / 2, z: row === 0 ? z0 + dd / 2 : z1 - dd / 2, w: w - sp - 0.02, d: dd, front, fd: lo ? 1 : -1 });
          } else push({ x: cx, z: cz, w: lx1 - lx0 - 0.02, d: z1 - z0, front });
        }
      }
      if (court) {
        // the courtyard: a tree or two, sometimes a palm or a cypress
        const cz0 = bz0 + rd, cz1 = bz1 - rd;
        for (let x = bx0 + r.range(3, 9); x < bx1 - 3; x += r.range(9, 18)) {
          const [wx, wz] = warpPt(x, (cz0 + cz1) / 2 + r.range(-1, 1) * (cz1 - cz0) * 0.2);
          if (inRes(wx - 3, wz - 3, wx + 3, wz + 3)) continue;
          if (wz < wallInnerZ(wx) + 26) continue;
          const t = r.next();
          lots.push({ tree: t < 0.25 ? 'palm' : t < 0.42 ? 'cypress' : 'round', x: wx, z: wz, s: r.range(0.8, 1.2) * Math.min(9, cz1 - cz0 + 4) });
        }
      }
    }
  }
  return lots;
}

// lots fronting the square, the plaza, and the main street ends (facing inward), plus the alley and special houses
export function planFrames(seed = 23) {
  const r = new Rng(seed);
  const out = [];
  const rowX = (x0, x1, z0, z1, front) => {
    let x = x0;
    while (x < x1 - 3) { let w = r.range(7, 11.5); if (x1 - (x + w) < 5) w = x1 - x; out.push({ x: x + w / 2, z: (z0 + z1) / 2, w: w - 0.02, d: z1 - z0, front }); x += w; }
  };
  const rowZ = (z0, z1, x0, x1, front) => {
    let z = z0;
    while (z < z1 - 3) { let d = r.range(7, 11.5); if (z1 - (z + d) < 5) d = z1 - z; out.push({ x: (x0 + x1) / 2, z: z + d / 2, w: x1 - x0, d: d - 0.02, front }); z += d; }
  };
  // square frame (the square is x -36..36, z -150..-90); bell towers at (+-30, -156) stand in the north row
  rowX(-52, -34, -166, -151, 'pz'); rowX(-26, -7, -166, -151, 'pz'); rowX(7, 26, -166, -151, 'pz'); rowX(34, 52, -166, -151, 'pz');
  rowX(-52, -7, -89, -74, 'nz'); rowX(7, 52, -89, -74, 'nz');
  rowZ(-150, -90, -52, -37, 'px'); rowZ(-150, -90, 37, 52, 'nx');
  // main street fronts between the plaza and the square: z -262..-166, both sides
  rowZ(-262, -166, -24, -7, 'px');
  rowZ(-243.9, -166, 7, 24, 'nx');
  // gate plaza sides (plaza x -34..34): houses at |x| 34..60 facing the plaza, back to the wall
  rowZ(-286, -262, -60, -34, 'px'); rowZ(-286, -262, 34, 60, 'nx');

  // the alley: two rows of tall houses with a 3 m lane between (x -63.5 .. -60.5)
  rowZ(-46, 10, -78, -63.5, 'px');
  rowZ(-46, 10, -60.5, -46, 'nx');
  // around the laundry house
  out.push({ x: -84, z: -64, w: 12, d: 12, front: 'px', floors: 2 });
  out.push({ x: -56, z: -66, w: 12, d: 15, front: 'nx', floors: 2 });
  out.push({ x: -70, z: -79, w: 14, d: 13, front: 'nz', floors: 2 });
  out.push({ x: -54.5, z: -53, w: 12, d: 10, front: 'nx', floors: 3 });
  return out.filter((l) => l.w > 3 && l.d > 3);
}

export { inRes };
