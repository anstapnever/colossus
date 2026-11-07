import * as THREE from 'three';
import { GeoB, K, col, plainBoxes } from './town-geo.js';
import { WALL, GATE, COLOSSUS, wallInnerZ, wallOuterZ } from './layout.js';
import { Rng } from './util.js';

// The great wall: a 50 m sandstone arc with string courses, a battered foot, crenellations,
// round towers every 130 m, and the gate between two round towers. Intact and broken gate
// states are separate meshes; the parapet over the grip is its own mesh (removed at the hand cue).
const SAND = col('#eedcc6');      // pale ochre-pink sandstone
const SAND2 = col('#e8d0b6');
const LIME = col('#efe0c8');
const BAND = col('#ecd2b4');
const BRONZE = col('#b07a3a');
const R0 = WALL.rIn, R1 = WALL.rIn + WALL.thick, CZ = WALL.c[1];
const TH0 = -1.18, TH1 = 1.18;      // arc extent (x ~ +-1390)
const GRIP = [-46, -24];             // x range of the parapet the hand crushes (hand at x ~ -33)

const pt = (r, th) => [r * Math.sin(th), CZ - r * Math.cos(th)];
const thOf = (x, r = R0) => Math.asin(x / r);

export function buildWall(ctx, mat) {
  const gb = new GeoB();         // static wall
  const gp = new GeoB();         // parapet over the grip (hidden from CUES.hand)
  const rng = new Rng(707);
  const H = WALL.h;
  const a = (kind, c, extra = {}) => ({ kind, c, c2: c, seed: rng.next() * 100, fh: 1.4, sp: 2, ...extra });
  const sand = () => a(K.SAND, SAND, { fh: 1.4 });
  const gateX = 12.5;            // faces between the gate towers are built by the gate section

  // ---- the main arc, in segments
  const segLen = 8;
  const nSeg = Math.ceil(((TH1 - TH0) * R0) / segLen);
  const bandsY = [[13.2, 14.6], [33.0, 34.4], [47.0, 48.2]];
  for (let i = 0; i < nSeg; i++) {
    const t0 = TH0 + ((TH1 - TH0) * i) / nSeg, t1 = TH0 + ((TH1 - TH0) * (i + 1)) / nSeg;
    const s0 = t0 * R0, s1 = t1 * R0;
    const [xi0, zi0] = pt(R0, t0), [xi1, zi1] = pt(R0, t1);
    const [xo0, zo0] = pt(R1, t0), [xo1, zo1] = pt(R1, t1);
    const xm = (xi0 + xi1) / 2;
    const inGate = Math.abs(xm) < gateX;
    const seed = rng.next() * 100;
    const A = { kind: K.SAND, c: SAND, c2: SAND2, seed: 3.3, fh: 1.4, sp: 2 };
    if (!inGate) {
      // inner face (toward the town, +z), outer face
      gb.quad([xi0, 0, zi0], [xi1, 0, zi1], [xi1, H, zi1], [xi0, H, zi0], A, s0, 0, s1, H, [-1e5, 1e5, -1e5, H]);
      gb.quad([xo1, 0, zo1], [xo0, 0, zo0], [xo0, H, zo0], [xo1, H, zo1], A, -s1, 0, -s0, H, [-1e5, 1e5, -1e5, H]);
      // battered foot (talus): 5 m tall, 1.6 m proud, inside and out
      const [xa0, za0] = pt(R0 - 1.6, t0), [xa1, za1] = pt(R0 - 1.6, t1);
      gb.quad([xa0, 0, za0], [xa1, 0, za1], [xi1, 5, zi1], [xi0, 5, zi0], A, s0, 0, s1, 5.3, [-1e5, 1e5, -1e5, 5.3]);
      const [xb0, zb0] = pt(R1 + 1.6, t0), [xb1, zb1] = pt(R1 + 1.6, t1);
      gb.quad([xb1, 0, zb1], [xb0, 0, zb0], [xo0, 5, zo0], [xo1, 5, zo1], A, -s1, 0, -s0, 5.3, [-1e5, 1e5, -1e5, 5.3]);
      // carved string courses, proud by 0.45 m (inner and outer)
      for (const [y0, y1] of bandsY) {
        for (const [r, sg] of [[R0, -1], [R1, 1]]) {
          const [p0x, p0z] = pt(r + sg * 0.45, t0), [p1x, p1z] = pt(r + sg * 0.45, t1);
          const [q0x, q0z] = pt(r, t0), [q1x, q1z] = pt(r, t1);
          const B = { kind: K.BAND, c: BAND, seed, fh: 1, sp: 2 };
          const e = [-1e5, 1e5, y0, y1];
          if (sg < 0) gb.quad([p0x, y0, p0z], [p1x, y0, p1z], [p1x, y1, p1z], [p0x, y1, p0z], B, s0, y0, s1, y1, e);
          else gb.quad([p1x, y0, p1z], [p0x, y0, p0z], [p0x, y1, p0z], [p1x, y1, p1z], B, -s1, y0, -s0, y1, e);
          gb.quad([q0x, y1, q0z], [q1x, y1, q1z], [p1x, y1, p1z], [p0x, y1, p0z], { ...B, kind: K.LIME, c: LIME }, s0, 0, s1, 0.45);
          gb.quad([p0x, y0, p0z], [p1x, y0, p1z], [q1x, y0, q1z], [q0x, y0, q0z], { ...B, kind: K.LIME, c: LIME }, s0, 0, s1, 0.45);
        }
      }
    }
    // walkway on top
    gb.quad([xi0, H, zi0], [xi1, H, zi1], [xo1, H, zo1], [xo0, H, zo0], { kind: K.LIME, c: LIME, seed, fh: 0.9, sp: 2 }, s0, 0, s1, 14);
    // crenellated parapets on both edges
    const gripSeg = xm > GRIP[0] && xm < GRIP[1];
    const pb = gripSeg ? gp : gb;
    for (const [rA, rB] of [[R0, R0 + 0.9], [R1 - 0.9, R1]]) {
      const [a0x, a0z] = pt(rA, t0), [a1x, a1z] = pt(rA, t1), [b0x, b0z] = pt(rB, t0), [b1x, b1z] = pt(rB, t1);
      const ph = 1.2;
      const P = { kind: K.SAND, c: SAND, c2: SAND2, seed, fh: 1.4, sp: 2 };
      pb.quad([a0x, H, a0z], [a1x, H, a1z], [a1x, H + ph, a1z], [a0x, H + ph, a0z], P, s0, H, s1, H + ph, [-1e5, 1e5, -1e5, H + ph]);
      pb.quad([b1x, H, b1z], [b0x, H, b0z], [b0x, H + ph, b0z], [b1x, H + ph, b1z], P, -s1, H, -s0, H + ph, [-1e5, 1e5, -1e5, H + ph]);
      pb.quad([a0x, H + ph, a0z], [a1x, H + ph, a1z], [b1x, H + ph, b1z], [b0x, H + ph, b0z], { ...P, kind: K.LIME, c: LIME }, s0, 0, s1, 0.9);
      // merlons: 1.7 m wide every 3.2 m
      const n = Math.max(1, Math.round((s1 - s0) / 3.2));
      for (let k = 0; k < n; k++) {
        const u0 = t0 + ((t1 - t0) * (k + 0.22)) / n, u1 = t0 + ((t1 - t0) * (k + 0.78)) / n;
        const [c0x, c0z] = pt(rA, u0), [c1x, c1z] = pt(rA, u1), [d0x, d0z] = pt(rB, u0), [d1x, d1z] = pt(rB, u1);
        const y0 = H + ph, y1 = H + WALL.parapet + (rng.next() < 0.06 ? -0.5 : 0);
        const su0 = u0 * R0, su1 = u1 * R0;
        pb.quad([c0x, y0, c0z], [c1x, y0, c1z], [c1x, y1, c1z], [c0x, y1, c0z], P, su0, y0, su1, y1);
        pb.quad([d1x, y0, d1z], [d0x, y0, d0z], [d0x, y1, d0z], [d1x, y1, d1z], P, -su1, y0, -su0, y1);
        pb.quad([d0x, y0, d0z], [c0x, y0, c0z], [c0x, y1, c0z], [d0x, y1, d0z], P, 0, y0, 0.9, y1);
        pb.quad([c1x, y0, c1z], [d1x, y0, d1z], [d1x, y1, d1z], [c1x, y1, c1z], P, 0, y0, 0.9, y1);
        pb.quad([c0x, y1, c0z], [c1x, y1, c1z], [d1x, y1, d1z], [d0x, y1, d0z], { ...P, kind: K.LIME, c: LIME }, 0, 0, su1 - su0, 0.9);
      }
    }
  }

  // ---- round towers, protruding inward, every ~130 m
  const towers = [];
  for (let s = -1500; s <= 1500; s += WALL.towerEvery) {
    const th = (s + 65) / R0;
    if (th < TH0 + 0.01 || th > TH1 - 0.01) continue;
    const [x, z] = pt(R0 - 3, th);
    if (Math.abs(x) < 60) continue;
    towers.push([x, z, 9, 60]);
  }
  // the gate towers
  // the gate towers: each a bastion of two round drums, one bulging into the town, one into the fields
  const gz = wallInnerZ(GATE.towerX) - 1, gzo = wallOuterZ(GATE.towerX) + 1;
  towers.push([-GATE.towerX, gzo, GATE.towerR, GATE.towerH - 0.01, false], [GATE.towerX, gzo, GATE.towerR, GATE.towerH - 0.01, false]);
  towers.push([-GATE.towerX, gz, GATE.towerR, GATE.towerH, true], [GATE.towerX, gz, GATE.towerR, GATE.towerH, true]);
  for (const [x, z, r, h, isGate] of towers) tower(gb, x, z, r, h, rng, isGate);

  // ---- gate section (faces between the gate towers), intact + broken
  const gate = buildGate(ctx, rng);

  const wallMesh = new THREE.Mesh(gb.build(), mat);
  const gripMesh = new THREE.Mesh(gp.build(), mat);
  const intact = new THREE.Mesh(gate.intact.build(), mat);
  const broken = new THREE.Mesh(gate.broken.build(), mat);
  const rubble = new THREE.Mesh(gate.rubble.build(), mat);
  for (const m of [wallMesh, gripMesh, intact, broken, rubble]) { m.frustumCulled = false; m.userData.noShadow = true; }
  wallMesh.name = 'town-wall'; gripMesh.name = 'town-wall-grip'; intact.name = 'gate-intact'; broken.name = 'gate-broken'; rubble.name = 'gate-rubble';

  // ---- QA colliders: the wall body near the gate and grip (|x| < 260), the gate towers, the doors
  const cl = [];
  const step = 6;
  for (let x = -260; x < 260; x += step) {
    const xa = x, xb = x + step;
    const zi0 = wallInnerZ(xa), zi1 = wallInnerZ(xb), zo0 = wallOuterZ(xa), zo1 = wallOuterZ(xb);
    // skip the gate opening: build jambs/lintel around it
    if (xb > -8.5 && xa < 8.5) continue;
    cl.push({ corners: [[xa, 0, zo0], [xb, 0, zo1], [xb, H, zo1], [xa, H, zo0], [xa, 0, zi0], [xb, 0, zi1], [xb, H, zi1], [xa, H, zi0]] });
    if (!(xb > GRIP[0] && xa < GRIP[1])) {
      cl.push({ corners: [[xa, H, zi0 - 0.9], [xb, H, zi1 - 0.9], [xb, H + WALL.parapet, zi1 - 0.9], [xa, H + WALL.parapet, zi0 - 0.9], [xa, H, zi0], [xb, H, zi1], [xb, H + WALL.parapet, zi1], [xa, H + WALL.parapet, zi0]] });
      cl.push({ corners: [[xa, H, zo0], [xb, H, zo1], [xb, H + WALL.parapet, zo1], [xa, H + WALL.parapet, zo0], [xa, H, zo0 + 0.9], [xb, H, zo1 + 0.9], [xb, H + WALL.parapet, zo1 + 0.9], [xa, H + WALL.parapet, zo0 + 0.9]] });
    }
  }
  // lintel over the gate (above the broken opening's top, so it is valid in both states)
  cl.push([-8.5, 37, -314, 8.5, H, -300]);
  const wallCol = new THREE.Mesh(plainBoxes(cl), new THREE.MeshBasicMaterial());
  wallCol.name = 'col-wall'; wallCol.visible = false;
  const twCol = new THREE.Mesh(mergeCyl([[-GATE.towerX, gz, GATE.towerR + 0.2, GATE.towerH], [GATE.towerX, gz, GATE.towerR + 0.2, GATE.towerH], [-GATE.towerX, gzo, GATE.towerR + 0.2, GATE.towerH], [GATE.towerX, gzo, GATE.towerR + 0.2, GATE.towerH]]), new THREE.MeshBasicMaterial());
  twCol.name = 'col-gatetowers'; twCol.visible = false;
  const doorCol = new THREE.Mesh(plainBoxes([[-8, 0, -308.2, 8, 24, -306.0]]), new THREE.MeshBasicMaterial());
  doorCol.name = 'col-gatedoors'; doorCol.visible = false;

  return {
    meshes: [wallMesh, gripMesh, intact, broken, rubble],
    wallMesh, gripMesh, intact, broken, rubble,
    colliders: [wallCol, twCol, doorCol], doorCol,
    gateArch: new THREE.Vector3(0, 23.2, wallInnerZ(0) + 0.6),
  };
}

function mergeCyl(list) {
  const geos = list.map(([x, z, r, h]) => { const g = new THREE.CylinderGeometry(r, r, h, 24, 1, false); g.translate(x, h / 2, z); return g; });
  // merge manually (position + index)
  const pos = [], idx = [];
  let base = 0;
  for (const g of geos) {
    const p = g.attributes.position.array; for (const v of p) pos.push(v);
    for (const i of g.index.array) idx.push(base + i);
    base += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function tower(gb, x, z, r, h, rng, isGate) {
  const seed = rng.next() * 100;
  const A = { kind: K.SAND, c: SAND, c2: SAND2, seed, fh: 1.4, sp: 2 };
  // battered foot
  gb.cyl(x, 0, z, r + 1.4, 5, 40, A, { rTop: r, cap: false });
  gb.cyl(x, 5, z, r, h - 5, 40, A, { vBase: 5, cap: true, capA: { kind: K.LIME, c: LIME, seed, fh: 1, sp: 2 } });
  // string courses
  for (const [y0, y1] of [[13.2, 14.6], [33.0, 34.4], [47.0, 48.2], [h - 3.2, h - 2.0]]) {
    gb.cyl(x, y0, z, r + 0.45, y1 - y0, 40, { kind: K.BAND, c: BAND, seed, fh: 1, sp: 2 }, { vBase: y0, cap: true, capA: { kind: K.LIME, c: LIME, seed, fh: 1, sp: 2 } });
  }
  // corbelled crown: a wider ring on corbels, then merlons
  const crown = h;
  gb.cyl(x, crown - 1.2, z, r + 0.8, 1.2, 40, { kind: K.LIME, c: LIME, seed, fh: 1, sp: 2 }, { vBase: crown - 1.2, cap: true });
  const nc = Math.round((2 * Math.PI * r) / 1.6);
  for (let k = 0; k < nc; k++) {
    const t = (k / nc) * Math.PI * 2;
    gb.box(x + Math.cos(t) * (r + 0.4), crown - 2.6, z + Math.sin(t) * (r + 0.4), 0.55, 1.4, 0.7, -t, { kind: K.LIME, c: LIME, seed, fh: 1, sp: 2 }, { skip: { bot: false } });
  }
  const nm = Math.round((2 * Math.PI * (r + 0.4)) / 3.0);
  gb.cyl(x, crown, z, r + 0.8, 1.1, 40, A, { vBase: crown, cap: false });
  for (let k = 0; k < nm; k++) {
    const t = ((k + 0.5) / nm) * Math.PI * 2;
    gb.box(x + Math.cos(t) * (r + 0.35), crown + 1.1, z + Math.sin(t) * (r + 0.35), 1.6, 1.3, 0.9, -t + Math.PI / 2, A, { vBase: crown + 1.1 });
  }
  // arrow slits facing the town (dark voids, slightly proud with a pale frame)
  for (const y of [9, 20, 27, 40, 53]) {
    for (const da of [-0.5, 0, 0.5]) {
      const t = Math.PI / 2 + da + (isGate ? 0 : 0);
      const px = x + Math.cos(t) * (r + 0.05), pz = z + Math.sin(t) * (r + 0.05);
      if (y > h - 4) continue;
      gb.box(px, y - 0.2, pz, 1.0, 2.6, 0.12, -t + Math.PI / 2, { kind: K.LIME, c: LIME, seed, fh: 1, sp: 2 });
      gb.box(px + Math.cos(t) * 0.07, y, pz + Math.sin(t) * 0.07, 0.36, 2.2, 0.06, -t + Math.PI / 2, { kind: K.VOID, c: [0.2, 0.2, 0.3], seed });
    }
  }
  if (isGate) {
    // the gate towers wear a glazed blue cap on a lantern
    gb.cyl(x, crown + 2.4, z, r * 0.45, 3.0, 24, { kind: K.WIN, c: col('#f2e6d2'), c2: col('#2a4fb8'), seed, fh: 3.0, sp: 2.2 }, { cap: true });
    gb.dome(x, crown + 5.4, z, r * 0.5, 24, { kind: K.DOME, c: col('#3cbfc6'), c2: col('#1d4cae'), seed }, { hk: 1.25, point: 1 });
  }
}

// --------------------------------------------------------------------------- gate
function archOutline(w, jamb, n = 24) {
  // from bottom-left up, around the arch, down to bottom-right
  const r = w / 2, pts = [[-r, 0], [-r, jamb]];
  for (let i = 1; i < n; i++) { const t = Math.PI - (i / n) * Math.PI; pts.push([Math.cos(t) * r, jamb + Math.sin(t) * r]); }
  pts.push([r, jamb], [r, 0]);
  return pts;
}
const RAGGED = [[-8, 0], [-8, 6], [-8.4, 10], [-8.9, 14.5], [-8.2, 18], [-8.9, 22], [-7.4, 25.5], [-8.6, 28], [-6.2, 30.8], [-4.4, 33.4], [-2.6, 32.6], [-1.0, 35.8], [1.2, 34.0], [2.8, 36.2], [4.6, 33.0], [6.8, 33.6], [7.6, 30.0], [8.9, 27.2], [8.1, 24.0], [8.9, 19.5], [8.3, 15.0], [8.8, 11.0], [8.0, 6.0], [8, 0]];

function faceWithHole(gb, hole, zf, outward, A, xr = 12.5, H = 50) {
  const shape = new THREE.Shape();
  shape.moveTo(-xr, 0); shape.lineTo(xr, 0); shape.lineTo(xr, H); shape.lineTo(-xr, H); shape.closePath();
  const hp = new THREE.Path();
  hp.moveTo(hole[0][0], hole[0][1]);
  for (let i = 1; i < hole.length; i++) hp.lineTo(hole[i][0], hole[i][1]);
  hp.closePath();
  shape.holes.push(hp);
  const g = new THREE.ShapeGeometry(shape);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i);
    P.setXYZ(i, x, y, zf(x));
  }
  g.computeVertexNormals();
  const N = g.attributes.normal;
  for (let i = 0; i < N.count; i++) N.setXYZ(i, 0, 0, outward);
  const m = new THREE.Matrix4();
  gb.addGeo(g, m, A, { planar: true, e: [-1e5, 1e5, -1e5, H] });
  // flip uv.x for the outer face so blocks read left-right correctly (planar uses x)
}

function tunnel(gb, outline, zIn, zOut, A, jit = null) {
  let acc = 0;
  for (let i = 0; i < outline.length - 1; i++) {
    const [x0, y0] = outline[i], [x1, y1] = outline[i + 1];
    const L = Math.hypot(x1 - x0, y1 - y0);
    const ji0 = jit ? jit(i) : 0, ji1 = jit ? jit(i + 1) : 0;
    // quad from inner face to outer face; normal toward the opening axis
    gb.quad([x1, y1, zIn(x1) - ji1], [x0, y0, zIn(x0) - ji0], [x0, y0, zOut(x0) + ji0 * 0.5], [x1, y1, zOut(x1) + ji1 * 0.5], A, acc + L, 0, acc, 14, [-1e5, 1e5, -1e5, 1e5]);
    acc += L;
  }
}

function buildGate(ctx, rng) {
  const intact = new GeoB(), broken = new GeoB(), rubble = new GeoB();
  const A = { kind: K.SAND, c: SAND, c2: SAND2, seed: 3.3, fh: 1.4, sp: 2 };
  const zi = (x) => wallInnerZ(x), zo = (x) => wallOuterZ(x);
  const arch = archOutline(GATE.w, GATE.h - GATE.w / 2);
  // intact faces + vault
  faceWithHole(intact, arch, zi, 1, A);
  faceWithHole(intact, arch, zo, -1, A);
  tunnel(intact, arch, zi, zo, { ...A, kind: K.LIME, c: LIME });
  // bands across the gate section (inner + outer), broken by the arch only below 24 m
  for (const [y0, y1] of [[33.0, 34.4], [47.0, 48.2]]) {
    for (const g of [intact, broken]) {
      g.boxMM(-12.5, y0, zi(0), 12.5, y1, zi(0) + 0.45, { kind: K.BAND, c: BAND, seed: 1 }, { vBase: y0 });
      g.boxMM(-12.5, y0, zo(0) - 0.45, 12.5, y1, zo(0), { kind: K.BAND, c: BAND, seed: 1 }, { vBase: y0 });
    }
  }
  // voussoirs: a ring of pale wedge blocks around the arch, keystone proud, on both faces
  const r = GATE.w / 2, jamb = GATE.h - r;
  const nV = 15;
  for (const [zf, sg] of [[zi(0), 1], [zo(0), -1]]) {
    for (let k = 0; k < nV; k++) {
      const ta = Math.PI - (k / nV) * Math.PI, tb = Math.PI - ((k + 1) / nV) * Math.PI;
      const key = k === (nV >> 1);
      const ro = r + (key ? 2.6 : 1.9);
      const sh = new THREE.Shape();
      sh.moveTo(Math.cos(ta) * r, jamb + Math.sin(ta) * r);
      sh.lineTo(Math.cos(ta) * ro, jamb + Math.sin(ta) * ro);
      sh.lineTo(Math.cos(tb) * ro, jamb + Math.sin(tb) * ro);
      sh.lineTo(Math.cos(tb) * r, jamb + Math.sin(tb) * r);
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: key ? 0.75 : 0.45, bevelEnabled: false });
      const m = new THREE.Matrix4().makeTranslation(0, 0, zf + (sg > 0 ? 0 : 0));
      if (sg < 0) m.multiply(new THREE.Matrix4().makeScale(1, 1, -1));
      intact.addGeo(g, m, { kind: K.LIME, c: k % 2 ? LIME : col('#f4e8d6'), seed: k, fh: 0.9, sp: 2 }, { planar: true });
    }
    // jamb blocks (impost) at the springing line
    for (const sx of [-1, 1]) intact.boxMM(sx * r - (sx > 0 ? 0 : 1.6) + (sx > 0 ? 0 : 0), jamb - 1.0, sg > 0 ? zf : zf - 0.5, sx * r + (sx > 0 ? 1.6 : 0), jamb, sg > 0 ? zf + 0.5 : zf, { kind: K.LIME, c: LIME, seed: 2 });
  }
  // bronze doors: two leaves in the middle of the passage
  const doorZ = -307.1;
  for (const sx of [-1, 1]) {
    const sh = new THREE.Shape();
    const pts = arch.filter(([x]) => (sx < 0 ? x <= 0.001 : x >= -0.001));
    if (sx < 0) { sh.moveTo(0, 0); for (const [x, y] of pts) sh.lineTo(x, y); sh.lineTo(0, GATE.h); } else { sh.moveTo(0, GATE.h); for (const [x, y] of pts) sh.lineTo(x, y); sh.lineTo(0, 0); }
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false, curveSegments: 12 });
    const m = new THREE.Matrix4().makeTranslation(0, 0, doorZ - 0.6);
    // uv: u 0..16 across both leaves, v = y (planar on the face, computed below)
    intact.addGeo(g, m, { kind: K.BRONZE, c: BRONZE, c2: BRONZE, seed: 1 }, { planar: true });
  }
  // fix bronze uv offset: planar gives u = x; the shader wants 0..16
  {
    const U = intact.uv, Pp = intact.p;
    for (let i = 0; i < U.length / 2; i++) if (Pp[i * 4] === K.BRONZE) U[i * 2] += 8;
  }
  // heavy hinge posts and a threshold
  intact.boxMM(-9.0, 0, doorZ - 1.2, -8.0, 16, doorZ + 1.2, { kind: K.METAL, c: col('#8a5e34'), seed: 3 });
  intact.boxMM(8.0, 0, doorZ - 1.2, 9.0, 16, doorZ + 1.2, { kind: K.METAL, c: col('#8a5e34'), seed: 3 });
  // a carved sun medallion over the arch on the town side
  intact.cyl(0, 31.0, zi(0) + 0.3, 1.6, 0.5, 24, { kind: K.LIME, c: col('#f6ead8'), seed: 4 }, { cap: true });

  // ---- broken state: ragged hole, ragged vault, a few hanging blocks
  faceWithHole(broken, RAGGED, zi, 1, A);
  faceWithHole(broken, RAGGED, zo, -1, A);
  const jr = new Rng(91);
  const jit = RAGGED.map(() => jr.range(-0.6, 1.4));
  tunnel(broken, RAGGED, zi, zo, { ...A, kind: K.INTER, c: col('#cfa284') }, (i) => jit[i]);
  // broken hinge stubs
  broken.boxMM(-9.0, 0, doorZ - 1.2, -8.0, 9, doorZ + 1.2, { kind: K.METAL, c: col('#8a5e34'), seed: 3 });
  broken.boxMM(8.0, 0, doorZ - 1.2, 9.0, 6.5, doorZ + 1.2, { kind: K.METAL, c: col('#8a5e34'), seed: 3 });

  // ---- rubble heap inside the gate (from ~59.4): sandstone blocks and chunks
  const rr = new Rng(4040);
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < 150; i++) {
    const big = i < 26;
    const ang = rr.range(-Math.PI, Math.PI);
    const dist = Math.pow(rr.next(), big ? 0.9 : 0.6) * (big ? 16 : 26);
    let x = Math.sin(ang) * dist * 0.9, z = -299 + Math.abs(Math.cos(ang)) * dist;
    if (i < 40) { x = rr.range(-9, 9); z = rr.range(-306, -296); }
    const heapH = Math.max(0, 5.5 * Math.exp(-((x * x) / 90 + ((z + 299) ** 2) / 110)));
    const sz = big ? rr.range(1.2, 2.6) : rr.range(0.35, 1.1);
    const y = heapH * rr.range(0.5, 0.95);
    e.set(rr.range(0, 3), rr.range(0, 3), rr.range(0, 3));
    q.setFromEuler(e);
    const kind = K.SAND;
    if (rr.next() < 0.55) {
      s.set(sz * rr.range(1.0, 1.8), sz * rr.range(0.6, 1.0), sz * rr.range(0.7, 1.2));
      p.set(x, y + s.y * 0.3, z);
      tmp.compose(p, q, s);
      rubble.addGeo(new THREE.BoxGeometry(1, 1, 1), tmp, { kind, c: rr.next() < 0.5 ? SAND : SAND2, c2: SAND2, seed: i, fh: 1.4, sp: 2 }, { planar: true });
    } else {
      s.set(sz, sz * 0.75, sz);
      p.set(x, y, z);
      tmp.compose(p, q, s);
      rubble.addGeo(ico, tmp, { kind: K.INTER, c: rr.next() < 0.5 ? col('#d9b090') : col('#caa080'), seed: i }, { planar: true });
    }
  }
  return { intact, broken, rubble };
}

export const GRIP_X = GRIP;
