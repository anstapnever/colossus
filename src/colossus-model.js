import * as THREE from 'three';
import { v3, hull, cbox, superPts, cyl, cylZ, cylX, ring, ball, ribs, extrude, tube, patch, solid, Kit } from './colossus-geo.js';
import { deg } from './util.js';

// COLOSSUS dept: the bronze automaton. One unit = 10 m. +Y up, +Z the way it faces, +X its LEFT.
// Rigid parts merged per joint (Kit) under a pivot hierarchy. Limb modelling kit adapted from the
// Leviathan archer (MIT); proportions, head, collar, skirt and the whole look are ours.
export const STY = {
  VERD: { col: '#72a39e', metal: 0.42, detail: 1, tone: 0.05 },        // verdigris main plates
  VERDL: { col: '#a6c8c1', metal: 0.36, detail: 1, tone: 0.05 },       // pale crusted patina
  VERDD: { col: '#467878', metal: 0.5, detail: 0.9, tone: 0.06 },      // deep teal
  BRONZE: { col: '#b5906a', metal: 0.8, detail: 0.6, tone: 0.07, wear: 0.7 },   // bare warm bronze
  GOLD: { col: '#dcc690', metal: 0.92, detail: 0.25, tone: 0.04, wear: 0.4 },   // gold trim
  DARK: { col: '#2b4144', metal: 0.3, detail: 0.5, tone: 0.08, wear: 0.5 },      // joints, inner frame
  GUN: { col: '#3e6460', metal: 0.45, detail: 0.8, tone: 0.07 },
  RECESS: { col: '#1a2a2e', metal: 0.1, detail: 0.1, tone: 0.02, wear: 0 },     // the eye well
  VISOR: { col: '#e8ffff', metal: 0, detail: 0, emis: 2, tone: 0, wear: 0 },
  CORE: { col: '#bff2ff', metal: 0, detail: 0, emis: 1, tone: 0, wear: 0 },
  VENT: { col: '#bff2ff', metal: 0, detail: 0, emis: 3, tone: 0, wear: 0 },
};

// skeleton numbers (units) shared with the pose code
export const SK = {
  pelvisY: 4.12, hipX: 0.74, hipY: -0.24,
  thigh: 1.74, shin: 1.6, ankleY: 0.69,
  shX: 1.95, shY: 1.74, armScale: 1.12,
  waist: 0.5, chest: 0.78, neck: 2.0, head: 0.36, headScale: 1.46,
};

export function buildColossus(material) {
  const j = {};
  const root = new THREE.Group(); root.name = 'colossus'; j.root = root;
  const J = (name, parent, pos) => { const g = new THREE.Group(); g.name = name; g.position.set(...pos); parent.add(g); j[name] = g; return g; };
  const k = new Kit(23);

  const pelvis = J('pelvis', root, [0, SK.pelvisY, 0]);
  const waist = J('waist', pelvis, [0, SK.waist, 0]);
  const chest = J('chest', waist, [0, SK.chest, 0]);
  const neck = J('neck', chest, [0, SK.neck, 0.05]);
  J('head', neck, [0, SK.head, 0.04]);
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
    const hip = J('hip' + L, pelvis, [s * SK.hipX, SK.hipY, 0]);
    const knee = J('knee' + L, hip, [0, -SK.thigh, 0]);
    J('cap' + L, knee, [0, 0, 0]);
    J('ank' + L, knee, [0, -SK.shin, 0]);
    J('tas' + L, pelvis, [s * 0.95, 0.05, 0.0]);
    const sh = J('sh' + L, chest, [s * SK.shX, SK.shY, 0]);
    J('pd' + L, sh, [0, 0, 0]);
    const arm = J('arm' + L, sh, [0, 0, 0]);
    arm.scale.setScalar(SK.armScale);
    const el = J('el' + L, arm, [0, -1.85, 0]);
    J('wr' + L, el, [0, -1.95, 0]);
  }

  buildHead(k);
  buildCollar(k);
  buildTorso(k);
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) { buildArm(k, s, L); buildHand(k, J, j, s, L); buildLeg(k, s, L); buildSkirt(k, s, L); }
  // proportions: a broad heavy torso on short columns of legs
  k.scaleBin('chest', 1.6, 1.14, 1.4);
  k.scaleBin('hipL', 1.3, 1, 1.28); k.scaleBin('hipR', 1.3, 1, 1.28);
  k.scaleBin('kneeL', 1.26, 1, 1.24); k.scaleBin('kneeR', 1.26, 1, 1.24);
  k.scaleBin('ankL', 1.2, 1.0, 0.84); k.scaleBin('ankR', 1.2, 1.0, 0.84);
  k.scaleBin('pelvis', 1.3, 1.0, 1.22);
  k.scaleBin('waist', 1.32, 1.0, 1.24);
  // heavier limbs: a bronze titan, not a thin robot
  for (const L of ['L', 'R']) { k.scaleBin('arm' + L, 1.26, 1, 1.26); k.scaleBin('el' + L, 1.24, 1, 1.24); k.scaleBin('tas' + L, 1.22, 1.05, 1.2); }
  const meshes = k.finish(j, material);
  return { root, j, meshes, tris: k.tris };
}

// ------------------------------------------------------------------- head
// Round bronze mask with a single vertical slit; deep shadowed well around the slit,
// heavy brow, cheek vents, sun-disc ear bosses, a gold crest from brow to nape.
function buildHead(k) {
  const { VERD, VERDL, VERDD, BRONZE, GOLD, DARK, GUN, RECESS, VISOR, VENT } = STY;
  const b = 'head';
  const H = tube([[-0.04, 0.36, 0.36, -0.02, 2.2], [0.12, 0.5, 0.5, 0.0, 2.3], [0.44, 0.6, 0.6, 0.0, 2.3], [0.76, 0.56, 0.56, -0.02, 2.2], [0.98, 0.38, 0.38, -0.04, 2.1], [1.1, 0.08, 0.08, -0.05, 2]]);
  k.add(b, solid(H, { nu: 32, nv: 12, crease: 50 }), { ...VERDD, detail: 0.5 });
  // mask surface (front of the dish): z of the face at (x, y)
  const FY = 0.44, FR = 0.52, FZ = 0.42, FD = 0.21;
  const faceZ = (x, y) => { const q = 1 - (x / 0.5) ** 2 - ((y - FY) / FR) ** 2; return FZ + FD * Math.sqrt(Math.max(q, 0)); };
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    // helm plates over crown and nape
    k.add(b, patch(H, [[0.06, 0.66], [0.24, 0.62], [0.26, 0.97], [0.04, 0.99]], { nu: 4, nv: 4, t: 0.04, crown: 0.02 }), VERD, undefined, undefined, M);
    k.add(b, patch(H, [[0.24, 0.5], [0.4, 0.48], [0.42, 0.94], [0.26, 0.96]], { nu: 4, nv: 4, t: 0.04, crown: 0.02 }), VERDD, undefined, undefined, M);
    k.add(b, patch(H, [[0.4, 0.3], [0.49, 0.3], [0.49, 0.95], [0.42, 0.95]], { nu: 3, nv: 4, t: 0.035 }), VERD, undefined, undefined, M);
    k.add(b, patch(H, [[0.22, 0.04], [0.44, 0.04], [0.44, 0.5], [0.24, 0.52]], { nu: 4, nv: 4, t: 0.045, crown: 0.02 }), VERD, undefined, undefined, M);
    // ear boss: a sun disc with rays
    k.add(b, cylX(0.21, 0.06, 32), GOLD, [0.6, 0.42, -0.04], undefined, M);
    k.add(b, cylX(0.16, 0.08, 28), BRONZE, [0.61, 0.42, -0.04], undefined, M);
    k.add(b, cylX(0.07, 0.12, 16), GOLD, [0.62, 0.42, -0.04], undefined, M);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      k.add(b, hull([v3(0, -0.025, 0.21), v3(0, 0.025, 0.21), v3(0, 0, 0.3), v3(0.04, -0.02, 0.21), v3(0.04, 0.02, 0.21), v3(0.03, 0, 0.29)], 20), GOLD, [0.58, 0.42, -0.04], [a * 57.2958, 0, 0], M);
    }
    // the mask half: a convex round dish split down the middle
    const pts = superPts(0.5, FR, FD, 2.2, 14).filter((p) => p.x > 0.045).map((p) => p.add(v3(0, FY, FZ)));
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 10; const y = FY + Math.sin(a) * FR * 0.98; pts.push(v3(0.045, y, faceZ(0.045, y) - 0.002)); pts.push(v3(0.045, y, FZ - 0.08)); }
    k.add(b, hull(pts, 22), { ...VERDL, detail: 0.7 }, undefined, undefined, M);
    // cheek gills: four slots cut flush into the lower cheek, dark throats with a faint inner glow
    for (let i = 0; i < 4; i++) {
      const x = 0.33 - i * 0.012, y = 0.27 - i * 0.055;
      const z = faceZ(x, y);
      const n = new THREE.Vector3(x / 0.25, (y - FY) / (FR * FR), (z - FZ) / (FD * FD)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.12));
      const e = new THREE.Euler().setFromQuaternion(q);
      const r = [e.x * 57.2958, e.y * 57.2958, e.z * 57.2958];
      k.add(b, cbox(0.13 - i * 0.012, 0.024, 0.06, 0.006), RECESS, [x, y, z - 0.014], r, M);
      k.add(b, cbox(0.09, 0.008, 0.04, 0.002), VENT, [x + n.x * 0.006, y + n.y * 0.006, z - 0.004], r, M);
    }
    // heavy brow over the eye well, raked down to the centre: a scowl
    const B = (x, y, dz) => v3(x, y, faceZ(x, y) + dz);
    k.add(b, hull([B(0.0, 0.73, 0.11), B(0.16, 0.8, 0.09), B(0.34, 0.86, 0.03), B(0.36, 0.8, 0.0), B(0.16, 0.74, 0.08), B(0.0, 0.67, 0.1), B(0.0, 0.9, -0.03), B(0.26, 0.96, -0.05), B(0.0, 0.78, -0.07), B(0.32, 0.86, -0.06)], 16), GOLD, undefined, undefined, M);
    // rivets around the face rim
    for (let i = 1; i < 12; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 12; const x = Math.cos(a) * 0.44, y = FY + Math.sin(a) * FR * 0.9; k.add(b, ball(0.022, 8, 6), GOLD, [x, y, faceZ(x, y) - 0.004], undefined, M); }
  }
  // gold rim around the whole face
  k.add(b, new THREE.TorusGeometry(0.5, 0.032, 8, 64).scale(1, FR / 0.5, 1), GOLD, [0, FY, FZ + 0.005]);
  // the eye well: a dark almond following the face down the middle
  const alm = [];
  for (let i = 0; i <= 14; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 14, y = FY - 0.02 + Math.sin(a) * 0.36, w = 0.09 * Math.pow(Math.cos(a), 0.7) + 0.01;
    for (const x of [w, -w]) { alm.push(v3(x, y, faceZ(x, y) + 0.012)); alm.push(v3(x * 0.7, y, faceZ(x, y) - 0.1)); }
  }
  k.add(b, hull(alm, 30), RECESS);
  // the slit: white-hot, lens-shaped, a hair proud of the dark well
  const slit = [];
  for (let i = 0; i <= 14; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 14, y = FY - 0.02 + Math.sin(a) * 0.3, w = 0.017 * Math.pow(Math.cos(a), 1.2) + 0.002;
    for (const x of [w, -w]) { slit.push(v3(x, y, faceZ(0, y) + 0.02)); slit.push(v3(x, y, faceZ(0, y) - 0.04)); }
  }
  k.add(b, hull(slit, 40), VISOR);
  // chin keel
  k.add(b, hull([v3(0, -0.07, faceZ(0, -0.07) + 0.05), v3(0.13, -0.02, 0.56), v3(-0.13, -0.02, 0.56), v3(0, -0.2, 0.5), v3(0.1, -0.14, 0.34), v3(-0.1, -0.14, 0.34), v3(0, 0.02, 0.4)], 14), GOLD);
  // crest from brow to nape
  k.add(b, patch(H, [[-0.022, 0.6], [0.022, 0.6], [0.018, 1.0], [-0.018, 1.0]], { nu: 2, nv: 7, t: 0.06, lift: 0.02, ridge: 0.04 }), GOLD);
  k.add(b, patch(H, [[0.47, 0.25], [0.53, 0.25], [0.515, 0.98], [0.485, 0.98]], { nu: 2, nv: 7, t: 0.05, lift: 0.02, ridge: 0.03 }), GOLD);
  // neck: ribbed dark column with bronze rings
  k.add('neck', ribs(null, 0.34, 0.38, 0.5, 4, 20), DARK, [0, 0.12, 0]);
  k.add('neck', ring(0.38, 0.04, 28), BRONZE, [0, 0.36, 0]);
  void GUN; void VISOR;
}

// --------------------------------------------------------------- collar
// A gorget of overlapping bronze petals around the neck, two rows, gold edged.
function buildCollar(k) {
  const { VERD, VERDL, VERDD, GOLD, BRONZE, DARK } = STY;
  const petal = (w, h, t) => hull([v3(-w * 0.5, 0, 0), v3(w * 0.5, 0, 0), v3(-w * 0.62, h * 0.7, t * 0.6), v3(w * 0.62, h * 0.7, t * 0.6), v3(0, h, t), v3(-w * 0.45, 0, -t), v3(w * 0.45, 0, -t), v3(0, h * 0.95, 0)], 16);
  const n = 14;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < n; i++) {
      const a = ((i + row * 0.5) / n) * Math.PI * 2;
      const r = row ? 0.52 : 0.62, y = row ? 1.96 : 1.82;
      const st = row ? (i % 2 ? VERDL : VERD) : (i % 2 ? VERD : VERDD);
      k.add('chest', petal(row ? 0.3 : 0.36, row ? 0.36 : 0.32, 0.05), st, [Math.sin(a) * r / 1.42, y / 1.1, Math.cos(a) * r / 1.22], [-(row ? 28 : 46), a * 57.2958, 0]);
    }
  }
  k.add('chest', ring(0.5 / 1.3, 0.04, 36), GOLD, [0, 2.12 / 1.1, 0]);
  void BRONZE; void DARK;
}

// ------------------------------------------------------------------ torso
function buildTorso(k) {
  const { VERD, VERDL, VERDD, BRONZE, GOLD, DARK, GUN, CORE } = STY;
  const C = tube([[-0.15, 0.62, 0.44, 0, 2.6], [0.25, 0.86, 0.58, 0.03, 2.6], [0.75, 1.12, 0.72, 0.06, 2.6], [1.25, 1.2, 0.72, 0.04, 2.8], [1.62, 1.04, 0.62, 0, 2.6], [1.86, 0.56, 0.4, 0, 2.2]]);
  k.add('chest', solid(C, { k: 0.97, nu: 24, nv: 10 }), GUN);
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    const add = (c, o, st) => k.add('chest', patch(C, c, o), st, undefined, undefined, M);
    add([[0.03, 0.5], [0.205, 0.44], [0.225, 0.8], [0.04, 0.88]], { nu: 4, nv: 5, t: 0.09, ridge: 0.06, crown: 0.06, crease: 12 }, VERDL);
    add([[0.03, 0.27], [0.19, 0.22], [0.205, 0.45], [0.03, 0.5]], { nu: 4, nv: 3, t: 0.07, ridge: 0.04 }, VERD);
    add([[0.03, 0.87], [0.23, 0.8], [0.26, 0.97], [0.05, 1.0]], { nu: 4, nv: 3, t: 0.07, crown: 0.03 }, VERD);
    add([[0.215, 0.32], [0.355, 0.3], [0.385, 0.82], [0.235, 0.8]], { nu: 3, nv: 6, t: 0.08, ridge: 0.05 }, VERD);
    for (let i = 0; i < 3; i++) add([[0.2, 0.02 + i * 0.1], [0.36, 0.02 + i * 0.1], [0.37, 0.14 + i * 0.1], [0.205, 0.14 + i * 0.1]], { nu: 3, nv: 2, t: 0.05, flare: 0.03 }, i % 2 ? VERDD : VERD);
    add([[0.385, 0.14], [0.482, 0.14], [0.482, 0.95], [0.4, 0.92]], { nu: 3, nv: 6, t: 0.07, ridge: 0.04 }, VERDD);
    add([[0.27, 0.86], [0.4, 0.86], [0.46, 1.0], [0.3, 1.0]], { nu: 3, nv: 3, t: 0.07 }, VERD);
    // back vent stacks (steam ports) between the shoulder blades
    k.add('chest', cbox(0.16, 0.5, 0.2, 0.03), BRONZE, [0.28, 1.5, -0.66], [-14, 0, 0], M);
    k.add('chest', cbox(0.1, 0.4, 0.06, 0.01), STY.VENT, [0.28, 1.52, -0.75], [-14, 0, 0], M);
    const MU = { ...M, scale: [1 / 1.42, 1 / 1.1, 1 / 1.22] };
    k.add('chest', ball(0.5, 16, 12), DARK, [1.28, 1.62, 0], undefined, MU);
    k.add('chest', cylX(0.5, 0.14, 24), BRONZE, [1.1, 1.62, 0], undefined, MU);
    // trapezius mass rising to the collar
    k.add('chest', hull([v3(0.2, 1.72, 0.26), v3(0.2, 1.72, -0.3), v3(1.0, 1.62, 0.3), v3(1.0, 1.62, -0.34), v3(0.3, 1.98, 0.14), v3(0.3, 1.98, -0.18), v3(0.74, 1.84, 0.12), v3(0.74, 1.84, -0.16)], 22), VERD, undefined, undefined, M);
  }
  // sternum keel and the sun boss with the core light
  k.add('chest', patch(C, [[-0.04, 0.46], [0.04, 0.46], [0.045, 0.96], [-0.045, 0.96]], { nu: 2, nv: 4, t: 0.05, ridge: 0.0 }), VERDD);
  k.add('chest', patch(C, [[-0.026, 0.08], [0.026, 0.08], [0.03, 0.46], [-0.03, 0.46]], { nu: 2, nv: 4, t: 0.11, ridge: 0.05 }), VERDD);
  const cy = 1.04, cz = 0.84;
  const U = { scale: [1 / 1.42, 1 / 1.1, 1 / 1.22] };   // keep round parts round inside the scaled chest bin
  k.add('chest', cylZ(0.3, 0.12, 32), GOLD, [0, cy, cz], [8, 0, 0], U);
  k.add('chest', cylZ(0.24, 0.16, 32), VERDD, [0, cy, cz + 0.02], [8, 0, 0], U);
  k.add('chest', cylZ(0.09, 0.2, 24), CORE, [0, cy, cz + 0.02], [8, 0, 0], U);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.add('chest', hull([v3(-0.025, 0.31, 0), v3(0.025, 0.31, 0), v3(0, 0.44, 0), v3(-0.025, 0.31, 0.05), v3(0.025, 0.31, 0.05), v3(0, 0.44, 0.03)], 20), GOLD, [0, cy, cz - 0.04], [8, 0, -a * 57.2958]);
  }

  // ------- waist: dark ribbed column with lames
  k.add('waist', ribs(null, 0.62, 0.76, 1.1, 7, 18).map((g) => g.scale(1, 1, 0.72)), DARK, [0, 0.36, 0]);
  const W = tube([[-0.22, 0.74, 0.5, 0.04, 2.6], [0.2, 0.62, 0.46, 0.05, 2.6], [0.55, 0.6, 0.44, 0.05, 2.6], [0.9, 0.72, 0.5, 0.05, 2.6]]);
  for (let i = 0; i < 4; i++) {
    const v0 = 0.02 + i * 0.235, v1 = v0 + 0.27;
    k.add('waist', patch(W, [[-0.115, v0], [0.115, v0], [0.125, v1], [-0.125, v1]], { nu: 4, nv: 2, t: 0.06, flare: 0.05, ridge: 0.03 }), i % 2 ? VERD : VERDL);
    for (const s of [1, -1]) k.add('waist', patch(W, [[0.13, v0 + 0.02], [0.27, v0 + 0.02], [0.27, v1 - 0.01], [0.135, v1 - 0.01]], { nu: 3, nv: 2, t: 0.05, flare: 0.04 }), i % 2 ? VERDD : VERD, undefined, undefined, { mirror: s < 0 });
    k.add('waist', patch(W, [[0.3, v0 + 0.02], [0.7, v0 + 0.02], [0.7, v1 - 0.01], [0.3, v1 - 0.01]], { nu: 6, nv: 2, t: 0.05, flare: 0.04 }), i % 2 ? VERD : VERDD);
  }
  // ------- pelvis
  const P = tube([[-0.82, 0.32, 0.3, 0.05, 2.6], [-0.42, 0.84, 0.52, 0.04, 2.6], [-0.02, 1.0, 0.62, 0, 2.7], [0.34, 0.84, 0.54, 0, 2.6], [0.5, 0.7, 0.46, 0, 2.5]]);
  k.add('pelvis', solid(P, { k: 0.96, nu: 20, nv: 8 }), GUN);
  k.add('pelvis', patch(P, [[-0.13, 0.62], [0.13, 0.62], [0.14, 1.0], [-0.14, 1.0]], { nu: 4, nv: 2, t: 0.08, flare: 0.03 }), GOLD);
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    k.add('pelvis', ball(0.56, 14, 10), DARK, [0.64, -0.22, 0], undefined, M);
    k.add('pelvis', cylX(0.46, 0.1, 22), BRONZE, [0.98, -0.22, 0], undefined, M);
  }
}

// a skirt of hanging bronze lames on each hip (rigid, follows the thigh part way)
function buildSkirt(k, s, L) {
  const { VERD, VERDL, VERDD, GOLD } = STY;
  const M = { mirror: s < 0 };
  const lame = (len, w, t) => hull([v3(-w * 0.5, 0, t), v3(w * 0.5, 0, t), v3(w * 0.5, 0, -t), v3(-w * 0.5, 0, -t), v3(-w * 0.56, -len, t * 0.8), v3(w * 0.56, -len, t * 0.8), v3(-w * 0.56, -len, -t * 0.8), v3(w * 0.56, -len, -t * 0.8), v3(0, -len - w * 0.18, t)], 16);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = -70 + (i * 150) / (n - 1);   // around the hip from front to back
    const ar = deg(a);
    const r = 0.62;
    const st = [VERDL, VERD, VERDD, VERD, VERDL][i];
    k.add('tas' + L, lame(1.25 - Math.abs(i - 1.5) * 0.08, 0.42, 0.05), st, [0.22 + Math.cos(ar) * r * 0.55, 0.05, Math.sin(-ar) * r], [6, 90 - a, 10], M);
    k.add('tas' + L, cbox(0.44, 0.06, 0.12, 0.01), GOLD, [0.22 + Math.cos(ar) * r * 0.55, 0.05, Math.sin(-ar) * r], [6, 90 - a, 10], M);
  }
}

// --------------------------------------------------------------------- arm
function buildArm(k, s, L) {
  const { VERD, VERDL, VERDD, BRONZE, GOLD, DARK, GUN } = STY;
  const M = { mirror: s < 0 };
  const arm = 'arm' + L, el = 'el' + L, pd = 'pd' + L;
  const A = tube([[0.1, 0.38, 0.4], [-0.35, 0.45, 0.47], [-0.9, 0.41, 0.43], [-1.5, 0.33, 0.35], [-1.85, 0.29, 0.31]]);
  k.add(arm, solid(A, { k: 0.95, nu: 18, nv: 6 }), DARK, undefined, undefined, M);
  const addA = (c, o, st) => k.add(arm, patch(A, c, o), st, undefined, undefined, M);
  addA([[-0.13, 0.2], [0.13, 0.2], [0.14, 0.88], [-0.14, 0.88]], { nu: 4, nv: 5, t: 0.07, ridge: 0.05 }, VERDL);
  addA([[0.15, 0.1], [0.37, 0.1], [0.38, 0.92], [0.16, 0.9]], { nu: 4, nv: 5, t: 0.07, ridge: 0.05 }, VERD);
  addA([[0.39, 0.1], [0.61, 0.1], [0.62, 0.9], [0.4, 0.92]], { nu: 4, nv: 5, t: 0.06 }, VERDD);
  addA([[-0.37, 0.1], [-0.15, 0.1], [-0.16, 0.9], [-0.38, 0.92]], { nu: 4, nv: 5, t: 0.05 }, VERD);
  k.add(arm, cylX(0.32, 0.54, 20), DARK, [0, -1.85, 0], undefined, M);
  k.add(arm, cylX(0.23, 0.6, 16), BRONZE, [0, -1.85, 0], undefined, M);
  k.add(arm, cylX(0.12, 0.66, 12), GOLD, [0, -1.85, 0], undefined, M);
  // elbow vent
  k.add(arm, cbox(0.1, 0.06, 0.2, 0.01), STY.VENT, [0, -1.72, -0.36], undefined, M);
  // pauldron: stacked round shells
  const D = tube([[0.72, 0.1, 0.12, 0, 2.3, 0.1], [0.56, 0.62, 0.7, 0, 2.3, 0.18], [0.24, 0.94, 1.0, 0, 2.5, 0.2], [-0.16, 1.02, 1.08, 0, 2.6, 0.2], [-0.62, 0.94, 1.0, 0, 2.6, 0.16]]);
  const c = 0.25, w0 = 0.48;
  const lame = (v0, v1, w, o, st) => k.add(pd, patch(D, [[c - w, v0], [c + w, v0], [c + w * 1.02, v1], [c - w * 1.02, v1]], { nu: 8, nv: 3, ...o }), st, undefined, undefined, M);
  lame(0.0, 0.42, w0, { t: 0.09, crown: 0.06, lift: 0.0, crease: 14 }, VERDL);
  lame(0.38, 0.6, w0, { t: 0.08, flare: 0.1, lift: 0.0 }, VERD);
  lame(0.56, 0.78, w0 * 0.98, { t: 0.08, flare: 0.1, lift: 0.02 }, VERDD);
  lame(0.74, 1.0, w0 * 0.96, { t: 0.09, flare: 0.14, lift: 0.04 }, VERD);
  k.add(pd, patch(D, [[c - 0.03, 0.05], [c + 0.03, 0.05], [c + 0.035, 0.42], [c - 0.035, 0.42]], { nu: 2, nv: 4, t: 0.05, lift: 0.1, ridge: 0.03 }), GOLD, undefined, undefined, M);
  k.add(pd, solid(tube([[0.5, 0.5, 0.56, 0, 2.3, 0.14], [0.2, 0.84, 0.9, 0, 2.4, 0.2], [-0.5, 0.8, 0.86, 0, 2.4, 0.16]]), { nu: 20, nv: 5, caps: false }), DARK, undefined, undefined, M);
  // shoulder vent on top of the pauldron
  k.add(pd, cbox(0.22, 0.08, 0.3, 0.02), BRONZE, [s * 0.0 + 0.3, 0.62, -0.25], [0, 0, -20], M);
  k.add(pd, cbox(0.16, 0.06, 0.22, 0.01), STY.VENT, [0.3, 0.66, -0.25], [0, 0, -20], M);

  const F = tube([[0.05, 0.31, 0.31, 0, 2.6], [-0.42, 0.44, 0.47, 0.03, 2.9], [-0.95, 0.46, 0.48, 0.03, 3.1], [-1.45, 0.35, 0.35, 0.01, 2.8], [-1.8, 0.27, 0.27, 0, 2.5], [-1.95, 0.25, 0.25, 0, 2.4]]);
  k.add(el, solid(F, { k: 0.94, nu: 18, nv: 7 }), DARK, undefined, undefined, M);
  const addF = (c2, o, st) => k.add(el, patch(F, c2, o), st, undefined, undefined, M);
  addF([[-0.115, 0.04], [0.115, 0.04], [0.09, 0.9], [-0.09, 0.9]], { nu: 2, nv: 6, t: 0.08, ridge: 0.06, crease: 12 }, VERDL);
  addF([[0.13, 0.03], [0.37, 0.03], [0.34, 0.88], [0.105, 0.88]], { nu: 2, nv: 6, t: 0.08, ridge: 0.07, crease: 12 }, VERD);
  addF([[0.385, 0.03], [0.615, 0.03], [0.59, 0.88], [0.41, 0.88]], { nu: 2, nv: 6, t: 0.08, ridge: 0.06, crease: 12 }, VERDD);
  addF([[-0.37, 0.03], [-0.13, 0.03], [-0.105, 0.88], [-0.34, 0.88]], { nu: 2, nv: 6, t: 0.08, ridge: 0.07, crease: 12 }, VERD);
  addF([[-0.05, -0.0], [0.5, -0.0], [0.42, 0.3], [0.02, 0.3]], { nu: 5, nv: 3, t: 0.07, lift: 0.08, flare: 0.05 }, VERDL);
  for (let i = 0; i < 2; i++) addF([[-0.5, 0.86 + i * 0.055], [0.5, 0.86 + i * 0.055], [0.5, 0.92 + i * 0.055], [-0.5, 0.92 + i * 0.055]], { nu: 16, nv: 1, t: 0.04, lift: 0.03 - i * 0.015 }, i ? GOLD : VERD);
  k.add(el, ring(0.3, 0.045, 28), GOLD, [0, -1.88, 0]);
  // wrist cuff: a flared bronze bell with a gold lip and a band of louvres the pistons ride over
  const CF = tube([[-1.5, 0.31, 0.31, 0, 2.2], [-1.72, 0.33, 0.33, 0, 2.2], [-1.88, 0.345, 0.345, 0, 2.2], [-1.95, 0.35, 0.35, 0, 2.2]]);
  k.add(el, solid(CF, { nu: 24, nv: 3 }), DARK, undefined, undefined, M);
  k.add(el, patch(CF, [[-0.5, 0.05], [0.5, 0.05], [0.5, 0.72], [-0.5, 0.72]], { nu: 18, nv: 3, t: 0.035, ch: 0.012 }), { ...VERDL, detail: 0.7 }, undefined, undefined, M);
  k.add(el, patch(CF, [[-0.5, 0.76], [0.5, 0.76], [0.5, 1.0], [-0.5, 1.0]], { nu: 18, nv: 1, t: 0.045, ch: 0.01 }), GOLD, undefined, undefined, M);
  for (let i = 0; i < 6; i++) k.add(el, cbox(0.03, 0.11, 0.12, 0.01), STY.RECESS, [Math.sin((i / 6) * Math.PI * 2 + 0.3) * 0.325, -1.62, Math.cos((i / 6) * Math.PI * 2 + 0.3) * 0.325], [0, 90 - ((i / 6) * 360 + 17.2), 0], M);
  k.add(el, ribs(null, 0.26, 0.24, 0.34, 4, 18), DARK, [0, -2.02, 0]);
  void GUN;
}

// -------------------------------------------------------------------- hand
// Segmented fingers with knuckle plates; back of the hand +X for the left hand, -X for the right.
function buildHand(k, J, j, s, L) {
  const { VERD, VERDL, VERDD, BRONZE, GOLD, DARK, GUN } = STY;
  const M = { mirror: s < 0 };
  // the hand hangs from the wrist pivot on its back side (a gauntlet): the forearm rides above the palm
  const hd = J('hd' + L, j['wr' + L], [-s * 0.15, 0, 0]);
  const wr = hd.name;
  // Local frame (left hand; the right one is mirrored): back of the hand +X, palm -X, fingers along -Y, index at +Z.
  // ---- palm: a rounded cast block
  const P = tube([[-0.0, 0.11, 0.25, 0, 3], [-0.1, 0.15, 0.36, 0, 3.2], [-0.38, 0.165, 0.44, 0, 3.4], [-0.64, 0.155, 0.46, 0, 3.4], [-0.8, 0.12, 0.44, 0, 3]]);
  k.add(wr, solid(P, { nu: 22, nv: 6 }), DARK, undefined, undefined, M);
  // ---- the broad back-of-hand plate: gold underlay showing as a trim, the verdigris shield inset on it
  k.add(wr, patch(P, [[0.055, 0.06], [0.445, 0.06], [0.445, 0.98], [0.055, 0.98]], { nu: 8, nv: 6, t: 0.03, ch: 0.01 }), { ...GOLD, detail: 0.25 }, undefined, undefined, M);
  k.add(wr, patch(P, [[0.075, 0.1], [0.425, 0.1], [0.425, 0.93], [0.075, 0.93]], { nu: 10, nv: 7, t: 0.045, lift: 0.012, crown: 0.03, ch: 0.012 }), { ...VERDL, detail: 0.85 }, undefined, undefined, M);
  // gold-inlaid tendon lines over each metacarpal, an engraved cross-band near the wrist, a raised boss plate
  for (const u of [0.17, 0.238, 0.262, 0.33]) k.add(wr, patch(P, [[u - 0.007, 0.3], [u + 0.007, 0.3], [u + 0.007, 0.9], [u - 0.007, 0.9]], { nu: 1, nv: 5, t: 0.03, lift: 0.07, ch: 0.004, ridge: 0.008 }), GOLD, undefined, undefined, M);
  k.add(wr, patch(P, [[0.1, 0.2], [0.4, 0.2], [0.4, 0.235], [0.1, 0.235]], { nu: 8, nv: 1, t: 0.02, lift: 0.075, ch: 0.004 }), { ...GOLD, detail: 0.2 }, undefined, undefined, M);
  k.add(wr, patch(P, [[0.16, 0.36], [0.34, 0.36], [0.32, 0.62], [0.18, 0.62]], { nu: 4, nv: 3, t: 0.02, lift: 0.08, crown: 0.02, ch: 0.006 }), { ...VERD, detail: 0.6 }, undefined, undefined, M);
  // palm side: heavy pads (the hand presses on stone)
  k.add(wr, patch(P, [[0.57, 0.12], [0.93, 0.12], [0.93, 0.95], [0.57, 0.95]], { nu: 6, nv: 5, t: 0.03, ch: 0.012 }), { ...VERDD, detail: 0.4 }, undefined, undefined, M);
  // wrist band at the top of the hand: a gold-rimmed collar the cuff slides over
  k.add(wr, solid(tube([[0.06, 0.15, 0.27, 0, 3], [-0.08, 0.17, 0.33, 0, 3.2]]), { nu: 20, nv: 2 }), GUN, undefined, undefined, M);
  k.add(wr, solid(tube([[-0.06, 0.18, 0.35, 0, 3.2], [-0.1, 0.185, 0.37, 0, 3.2]]), { nu: 20, nv: 1 }), GOLD, undefined, undefined, M);

  const segLen = [[0.4, 0.32, 0.27], [0.43, 0.34, 0.28], [0.4, 0.32, 0.27], [0.33, 0.27, 0.23]];
  const fingers = [];
  let fi = 0;
  // one phalanx of a gauntlet finger: an oval cast core (wider than deep) tapering rA → rB, two shingled armour
  // plates on the back (the proximal one laps over the distal one, the last one runs past the joint onto the next
  // segment), a thin gold edge only on each plate's trailing lip, a domed knuckle guard bulging over the bend at
  // the segment's root, and on the tip a long gold talon hooking toward the palm.
  const DX = 0.72;   // depth / width of the finger section
  const phal = (bin, len, rA, rB, tip, guard = true) => {
    fi++;
    // hinge: a dark pin hidden inside the section, gold pin heads just proud of the sides
    k.add(bin, cylZ(rA * DX * 0.92, rA * 1.86, 16), { ...GUN, metal: 0.5 }, [0, 0, 0], undefined, M);
    k.add(bin, cylZ(rA * 0.2, rA * 2.04, 10), GOLD, [0, 0, 0], undefined, M);
    const L0 = len * (tip ? 0.8 : 0.9);
    const y0 = -len * 0.04, y1 = y0 - L0;
    const r = (f) => rA + (rB - rA) * f;
    const T = tube([[y0, r(0) * DX * 0.86, r(0) * 0.9, 0, 2.2], [y0 - L0 * 0.12, r(0.1) * DX, r(0.1), 0, 2.3], [y0 - L0 * 0.5, r(0.5) * DX * 1.04, r(0.5), 0, 2.3], [y1 + L0 * 0.12, r(0.92) * DX, r(0.92), 0, 2.3], [y1, rB * DX * 0.84, rB * 0.88, 0, 2.2]]);
    k.add(bin, solid(T, { nu: 16, nv: 6, crease: 40 }), { ...DARK, detail: 0.2 }, undefined, undefined, M);
    // shingled back plates on an outer shell: the distal plate first (lower), the proximal one laps over it
    const ov = tip ? 0.0 : len * 0.17;
    const sh = (k1, k2) => tube([[y0 - L0 * 0.02, rA * DX * k1, rA * k2, 0, 2.3], [y0 - L0 * 0.5, r(0.5) * DX * k1 * 1.04, r(0.5) * k2, 0, 2.3], [y1 - ov, rB * DX * (tip ? k1 : k1 * 1.06), rB * (tip ? k2 : k2 * 1.04), 0, 2.3]]);
    const S1 = sh(1.05, 0.98), S2 = sh(1.13, 1.0);
    const sc = fi % 2 ? VERDL : VERD, sc2 = fi % 2 ? VERD : VERDL;
    const vSplit = tip ? 0.5 : 0.46;
    k.add(bin, patch(S1, [[0.1, vSplit - 0.06], [0.4, vSplit - 0.06], [0.38, 1.0], [0.12, 1.0]], { nu: 6, nv: 3, t: rA * 0.09, ch: rA * 0.05, crown: rA * 0.05, ridge: rA * 0.09 }), { ...sc2, detail: 0.5 }, undefined, undefined, M);
    k.add(bin, patch(S2, [[0.08, 0.0], [0.42, 0.0], [0.41, vSplit], [0.09, vSplit]], { nu: 6, nv: 3, t: rA * 0.1, ch: rA * 0.05, crown: rA * 0.06, ridge: rA * 0.1, flare: rA * 0.07 }), { ...sc, detail: 0.5 }, undefined, undefined, M);
    // a thin gold lip only on the lapping plate's trailing edge (never all round)
    k.add(bin, patch(S2, [[0.12, vSplit - 0.05], [0.38, vSplit - 0.05], [0.37, vSplit], [0.13, vSplit]], { nu: 5, nv: 1, t: rA * 0.17, ch: rA * 0.025, flare: rA * 0.05 }), GOLD, undefined, undefined, M);
    // side splints and the under-plates (palm side, they press on the stone)
    k.add(bin, patch(T, [[-0.06, 0.12], [0.05, 0.12], [0.05, 0.86], [-0.06, 0.86]], { nu: 2, nv: 3, t: rA * 0.08, ch: rA * 0.05 }), { ...VERDD, detail: 0.3 }, undefined, undefined, M);
    k.add(bin, patch(T, [[0.45, 0.12], [0.56, 0.12], [0.56, 0.86], [0.45, 0.86]], { nu: 2, nv: 3, t: rA * 0.08, ch: rA * 0.05 }), { ...VERDD, detail: 0.3 }, undefined, undefined, M);
    k.add(bin, patch(T, [[0.6, 0.14], [0.9, 0.14], [0.9, 0.84], [0.6, 0.84]], { nu: 3, nv: 3, t: rA * 0.07, ch: rA * 0.04, crown: rA * 0.05 }), { ...GUN, detail: 0.3 }, undefined, undefined, M);
    // rivets at the plate seam
    for (const zz of [0.42, -0.42]) k.add(bin, ball(rA * 0.1, 8, 6), GOLD, [r(0.3) * DX * 1.2, y0 - L0 * 0.3, r(0.3) * zz], undefined, M);
    // knuckle guard: a domed boss over the bend (back side), gold-rimmed, bulging when the joint closes
    if (guard) {
      k.add(bin, hull(superPts(rA * 0.5, rA * 0.62, rA * 0.95, 2.4, 7).map((q) => q.add(v3(rA * DX * 0.82, -rA * 0.1, 0))), 22), { ...GOLD, detail: 0.2 }, undefined, undefined, M);
      k.add(bin, hull(superPts(rA * 0.48, rA * 0.56, rA * 0.84, 2.4, 7).map((q) => q.add(v3(rA * DX * 0.92, -rA * 0.14, 0))), 22), { ...(fi % 2 ? VERD : VERDL), detail: 0.5, wear: 1.5 }, undefined, undefined, M);
    }
    if (tip) {
      // talon: a gold sheath over the last third, drawn out into a point that hooks toward the palm (-X)
      const yc = y1 + L0 * 0.34;
      const pts = [];
      for (let a = 0; a < 12; a++) { const q = (a / 12) * Math.PI * 2; pts.push(v3(Math.sin(q) * rB * DX * 1.18, yc, Math.cos(q) * rB * 1.1)); }
      for (let a = 0; a < 8; a++) { const q = (a / 8) * Math.PI * 2; pts.push(v3(-rB * 0.15 + Math.sin(q) * rB * DX * 0.95, y1 - rB * 0.35, Math.cos(q) * rB * 0.8)); }
      pts.push(v3(-rB * 0.55, y1 - rB * 1.2, rB * 0.22), v3(-rB * 0.55, y1 - rB * 1.2, -rB * 0.22));
      pts.push(v3(-rB * 1.05, y1 - rB * 1.75, 0.0));
      k.add(bin, hull(pts, 22), { ...GOLD, detail: 0.2, wear: 1.3 }, undefined, undefined, M);
      // the hooked point itself: a thin blade curling further toward the palm
      k.add(bin, hull([v3(-rB * 0.7, y1 - rB * 1.45, rB * 0.14), v3(-rB * 0.7, y1 - rB * 1.45, -rB * 0.14), v3(-rB * 1.0, y1 - rB * 1.7, rB * 0.08), v3(-rB * 1.0, y1 - rB * 1.7, -rB * 0.08), v3(-rB * 1.55, y1 - rB * 1.95, 0), v3(-rB * 0.55, y1 - rB * 1.25, 0)], 22), { ...GOLD, detail: 0.15, wear: 1.6 }, undefined, undefined, M);
    }
  };
  // finger root widths (index .. little) and the taper along the finger: tip = 55% of the root
  const R0 = [0.084, 0.088, 0.083, 0.073];
  const TAP = [1, 0.86, 0.82, 0.68, 0.66, 0.5];
  for (let i = 0; i < 4; i++) {
    const z = 0.285 - i * 0.19;
    const [l0, l1, l2] = segLen[i];
    const rw = R0[i];
    const fa = J(`f${L}${i}a`, hd, [0, -0.8, z]);
    const fb = J(`f${L}${i}b`, fa, [0, -l0, 0]);
    const fc = J(`f${L}${i}c`, fb, [0, -l1, 0]);
    phal(fa.name, l0, rw * TAP[0], rw * TAP[1], false, false);
    phal(fb.name, l1, rw * TAP[2], rw * TAP[3], false);
    phal(fc.name, l2, rw * TAP[4], rw * TAP[5], true);
    // base knuckle guard over the metacarpal head, overlapping the first phalanx, gold-rimmed
    k.add(wr, hull(superPts(0.075, 0.12, rw * 1.08, 2.3, 7).map((q) => q.add(v3(0.15, -0.74, z))), 22), { ...GOLD, detail: 0.2 }, undefined, undefined, M);
    k.add(wr, hull(superPts(0.07, 0.11, rw * 0.96, 2.3, 7).map((q) => q.add(v3(0.175, -0.745, z))), 22), { ...(i % 2 ? VERD : VERDL), detail: 0.5, wear: 1.4 }, undefined, undefined, M);
    k.add(wr, hull([v3(0.12, -0.64, z + 0.085), v3(0.12, -0.64, z - 0.085), v3(-0.12, -0.66, z + 0.085), v3(-0.12, -0.66, z - 0.085), v3(0.12, -0.86, z + 0.08), v3(0.12, -0.86, z - 0.08), v3(-0.1, -0.86, z + 0.08), v3(-0.1, -0.86, z - 0.08)], 14), GUN, undefined, undefined, M);
    fingers.push([fa, fb, fc]);
  }
  j['fingers' + L] = fingers;
  // thumb: a heavy three-segment digit on a gold-rimmed mount, set low on the index side so it can wrap under
  k.add(wr, hull(superPts(0.12, 0.17, 0.12, 2.4, 7).map((q) => q.add(v3(-0.02, -0.38, 0.42))), 22), { ...VERD, detail: 0.5 }, undefined, undefined, M);
  k.add(wr, ring(0.12, 0.02, 20), GOLD, [-0.03, -0.44, 0.46], undefined, M);
  const th = J('th' + L, hd, [-s * 0.03, -0.46, 0.47]);
  const th2 = J('th2' + L, th, [0, -0.38, 0]);
  const th3 = J('th3' + L, th2, [0, -0.32, 0]);
  phal(th.name, 0.38, 0.104, 0.092, false, false);
  phal(th2.name, 0.32, 0.09, 0.077, false);
  phal(th3.name, 0.27, 0.075, 0.058, true);

  // wrist pistons: sleeves ride on the forearm, rods on the back of the hand; aimed at each other every frame
  // (children of the root in base units, x arm scale). Both are built along -Y from their pivot.
  const AS = SK.armScale;
  j['pistons' + L] = [];
  for (const side of [1, -1]) {
    const sl = J(`pisS${L}${side > 0 ? 'a' : 'b'}`, j.root, [0, 0, 0]);
    const rd = J(`pisR${L}${side > 0 ? 'a' : 'b'}`, j.root, [0, 0, 0]);
    k.add(sl.name, cyl(0.055 * AS, 0.06 * AS, 0.5 * AS, 14), GUN, [0, -0.25 * AS, 0]);
    k.add(sl.name, cyl(0.07 * AS, 0.07 * AS, 0.06 * AS, 14), GOLD, [0, -0.47 * AS, 0]);
    k.add(sl.name, cyl(0.075 * AS, 0.075 * AS, 0.08 * AS, 14), BRONZE, [0, -0.02 * AS, 0]);
    k.add(rd.name, cyl(0.03 * AS, 0.03 * AS, 0.62 * AS, 10), { ...BRONZE, metal: 0.9 }, [0, -0.31 * AS, 0]);
    k.add(rd.name, ball(0.06 * AS, 12, 8), GOLD, [0, 0, 0]);
    j['pistons' + L].push({ sl, rd, side });
  }
}

// --------------------------------------------------------------------- leg
// Modelled at the archer's lengths (thigh 2.75, shin 2.7) and fitted with Kit.scaleBin.
function buildLeg(k, s, L) {
  const { VERD, VERDL, VERDD, BRONZE, GOLD, DARK, GUN } = STY;
  const M = { mirror: s < 0 };
  const hip = 'hip' + L, knee = 'knee' + L, ank = 'ank' + L, cap = 'cap' + L;
  const ty = SK.thigh / 2.75, ny = SK.shin / 2.7;
  const T = tube([[0.4, 0.46, 0.52, 0, 2.6], [-0.15, 0.6, 0.66, 0.03, 2.7], [-0.9, 0.6, 0.66, 0.05, 2.8], [-1.7, 0.5, 0.56, 0.03, 2.7], [-2.3, 0.42, 0.46, 0, 2.6], [-2.75, 0.36, 0.4, 0, 2.4]].map((q) => [q[0] * ty, ...q.slice(1)]));
  k.add(hip, solid(T, { k: 0.95, nu: 22, nv: 9 }), DARK, undefined, undefined, M);
  const addT = (c, o, st) => k.add(hip, patch(T, c, o), st, undefined, undefined, M);
  addT([[-0.125, 0.08], [0.125, 0.08], [0.1, 0.74], [-0.1, 0.74]], { nu: 2, nv: 6, t: 0.09, ridge: 0.07, crease: 11 }, VERDL);
  addT([[0.135, 0.06], [0.31, 0.06], [0.28, 0.78], [0.11, 0.76]], { nu: 3, nv: 6, t: 0.08, ridge: 0.06, crease: 11 }, VERD);
  addT([[0.325, 0.08], [0.47, 0.08], [0.47, 0.82], [0.295, 0.8]], { nu: 3, nv: 6, t: 0.08, ridge: 0.05 }, VERDD);
  addT([[-0.31, 0.06], [-0.135, 0.06], [-0.11, 0.76], [-0.28, 0.78]], { nu: 3, nv: 6, t: 0.08, ridge: 0.06, crease: 11 }, VERD);
  addT([[-0.47, 0.08], [-0.325, 0.08], [-0.295, 0.8], [-0.47, 0.82]], { nu: 3, nv: 6, t: 0.07 }, VERDD);
  addT([[-0.5, 0.0], [0.5, 0.0], [0.5, 0.14], [-0.5, 0.14]], { nu: 16, nv: 2, t: 0.06, flare: 0.04, lift: 0.04 }, GOLD);
  addT([[-0.2, 0.74], [0.2, 0.74], [0.2, 0.88], [-0.2, 0.88]], { nu: 6, nv: 2, t: 0.07, flare: 0.05, lift: 0.02 }, VERD);
  addT([[-0.17, 0.86], [0.17, 0.86], [0.15, 0.98], [-0.15, 0.98]], { nu: 6, nv: 2, t: 0.06, flare: 0.05, lift: 0.02 }, VERDD);

  k.add(knee, cylX(0.4, 0.7, 24), DARK, undefined, undefined, M);
  k.add(knee, cylX(0.32, 0.84, 20), BRONZE, undefined, undefined, M);
  k.add(knee, cylX(0.18, 0.9, 14), GOLD, undefined, undefined, M);
  const KN = tube([[-0.62, 0.32, 0.2, 0.44, 2.4], [-0.3, 0.48, 0.3, 0.48, 2.5], [0.1, 0.52, 0.33, 0.49, 2.5], [0.46, 0.44, 0.27, 0.44, 2.4], [0.64, 0.26, 0.14, 0.38, 2.2]]);
  k.add(cap, solid(KN, { nu: 20, nv: 8, crease: 42 }), VERD, undefined, undefined, M);
  k.add(cap, patch(KN, [[-0.07, 0.12], [0.07, 0.12], [0.05, 0.86], [-0.05, 0.86]], { nu: 2, nv: 5, t: 0.04, ridge: 0.05, crease: 12 }), GOLD, undefined, undefined, M);
  k.add(cap, cylZ(0.12, 0.08, 18), BRONZE, [0, 0.0, 0.84], undefined, M);

  const N = tube([[-0.1, 0.38, 0.4, 0, 2.4], [-0.7, 0.5, 0.55, -0.06, 2.7], [-1.35, 0.48, 0.54, -0.1, 2.8], [-2.0, 0.4, 0.45, -0.06, 2.6], [-2.5, 0.33, 0.36, -0.02, 2.4], [-2.72, 0.32, 0.35, 0, 2.4]].map((q) => [q[0] * ny, ...q.slice(1)]));
  k.add(knee, solid(N, { k: 0.95, nu: 18, nv: 8 }), DARK, undefined, undefined, M);
  const addN = (c, o, st) => k.add(knee, patch(N, c, o), st, undefined, undefined, M);
  addN([[-0.145, 0.08], [0.145, 0.08], [0.11, 0.6], [-0.11, 0.6]], { nu: 2, nv: 5, t: 0.09, ridge: 0.08, crease: 11 }, VERDL);
  addN([[-0.12, 0.58], [0.12, 0.58], [0.1, 0.9], [-0.1, 0.9]], { nu: 2, nv: 4, t: 0.09, ridge: 0.06, lift: 0.02, crease: 11 }, VERD);
  addN([[0.155, 0.06], [0.33, 0.06], [0.3, 0.92], [0.13, 0.9]], { nu: 3, nv: 6, t: 0.08, ridge: 0.06, crease: 11 }, VERD);
  addN([[-0.33, 0.06], [-0.155, 0.06], [-0.13, 0.9], [-0.3, 0.92]], { nu: 3, nv: 6, t: 0.08, ridge: 0.06, crease: 11 }, VERDD);
  addN([[0.345, 0.1], [0.5, 0.1], [0.5, 0.86], [0.32, 0.86]], { nu: 3, nv: 5, t: 0.08, ridge: 0.05 }, VERDD);
  addN([[-0.5, 0.1], [-0.345, 0.1], [-0.32, 0.86], [-0.5, 0.86]], { nu: 3, nv: 5, t: 0.07 }, VERD);
  for (let i = 0; i < 3; i++) addN([[-0.5, 0.86 + i * 0.05], [0.5, 0.86 + i * 0.05], [0.5, 0.92 + i * 0.05], [-0.5, 0.92 + i * 0.05]], { nu: 16, nv: 1, t: 0.05, lift: 0.05 - i * 0.012 }, i === 1 ? GOLD : VERD);
  // knee vents at the back
  k.add(knee, cbox(0.3, 0.08, 0.1, 0.01), STY.VENT, [0, -0.25, -0.5], undefined, M);

  // foot: a heavy sabaton, broad and flat
  k.add(ank, ball(0.4, 14, 10), DARK, undefined, undefined, M);
  k.add(ank, cylX(0.28, 0.9, 18), BRONZE, undefined, undefined, M);
  k.add(ank, hull([v3(0.5, 0.26, 0.2), v3(0.5, 0.26, -0.5), v3(0.6, -0.3, 0.5), v3(0.6, -0.34, -0.66), v3(0.32, 0.34, 0.1), v3(0.34, 0.3, -0.44), v3(0.32, -0.34, 0.66), v3(0.32, -0.34, -0.66)], 18), VERD, undefined, undefined, M);
  k.add(ank, hull([v3(-0.5, 0.26, 0.2), v3(-0.5, 0.26, -0.5), v3(-0.6, -0.3, 0.5), v3(-0.6, -0.34, -0.66), v3(-0.32, 0.34, 0.1), v3(-0.34, 0.3, -0.44), v3(-0.32, -0.34, 0.66), v3(-0.32, -0.34, -0.66)], 18), VERDD, undefined, undefined, M);
  k.add(ank, hull([v3(0.34, 0.22, 0.38), v3(-0.34, 0.22, 0.38), v3(0.42, -0.28, 0.8), v3(-0.42, -0.28, 0.8), v3(0.3, 0.28, 0.1), v3(-0.3, 0.28, 0.1), v3(0, 0.34, 0.4)], 16), GOLD, undefined, undefined, M);
  k.add(ank, hull([v3(0.44, 0.1, -0.5), v3(-0.44, 0.1, -0.5), v3(0.4, -0.5, -0.86), v3(-0.4, -0.5, -0.86), v3(0.3, 0.26, -0.3), v3(-0.3, 0.26, -0.3), v3(0.46, -0.56, -0.4), v3(-0.46, -0.56, -0.4)], 18), VERD, undefined, undefined, M);
  const Ft = tube([[-0.05, 0.52, 0.46, 0.0, 2.8], [0.42, 0.56, 0.42, 0.04, 2.9], [0.95, 0.52, 0.33, 0.1, 2.9], [1.5, 0.42, 0.22, 0.2, 2.7], [1.75, 0.3, 0.12, 0.25, 2.4], [1.9, 0.1, 0.05, 0.28, 2]]);
  const rot = [90, 0, 0], at = [0, -0.34, 0.1];
  const nL = 5;
  for (let i = 0; i < nL; i++) {
    const v0 = (i / nL) * 0.97, v1 = ((i + 1.28) / nL) * 0.97;
    const w = 0.24 - i * 0.008;
    k.add(ank, patch(Ft, [[0.5 - w, v0], [0.5 + w, v0], [0.5 + w * 0.98, Math.min(v1, 1)], [0.5 - w * 0.98, Math.min(v1, 1)]], { nu: 6, nv: 2, t: 0.07, flare: 0.07, lift: 0.03, ridge: 0.03, crease: 13 }), i % 2 ? VERDD : VERD, at, rot, M);
  }
  k.add(ank, patch(Ft, [[0.5 - 0.02, 0.5], [0.5 + 0.02, 0.5], [0.5 + 0.02, 1.0], [0.5 - 0.02, 1.0]], { nu: 2, nv: 4, t: 0.06, lift: 0.11 }), GOLD, at, rot, M);
  k.add(ank, solid(Ft, { k: 0.97, nu: 16, nv: 8 }), DARK, at, rot, M);
  k.add(ank, cbox(1.06, 0.1, 2.6, 0.04, { wt: 0.92, dt: 2.5 }), DARK, [0, -0.64, 0.52], undefined, M);
  for (const q of [-1, 1]) k.add(ank, hull([v3(q * 0.26, -0.3, 0.9), v3(q * 0.5, -0.32, 0.9), v3(q * 0.36, -0.62, 1.62), v3(q * 0.2, -0.62, 1.45), v3(q * 0.52, -0.62, 1.0), v3(q * 0.3, -0.62, 0.9)], 18), GOLD, undefined, undefined, M);
  void GUN;
}
