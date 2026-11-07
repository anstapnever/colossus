import * as THREE from 'three';
import { v3, hull, cbox, superPts, cyl, cylZ, cylX, ring, ball, ribs, tube, patch, solid, Kit } from './colossus-geo.js';
import { bronzeMaterial, bronzeAtlas } from './colossus-mat.js';
import { deg, clamp, lerp, smooth, noise1, onTwos, Rng } from './util.js';
import { CUES } from './shots.js';

// COLOSSUS dept: the walkers — smaller automatons of the same bronze family (6–15 m), clumsy and varied,
// trudging across the fields toward the breach. Modelled ~10 units tall (1 unit ≈ 1 m at scale 1),
// each root scaled to its own height. Procedural gait with planted feet (no sliding): stance feet are
// fixed in world space at footprints along the path; the swing foot arcs to the next footprint.

const V = THREE.Vector3, Q = THREE.Quaternion, M4 = THREE.Matrix4;

const PAL = {
  VERD: { col: '#5aa894', metal: 0.4, detail: 1, tone: 0.06 },
  VERDL: { col: '#8acbb2', metal: 0.35, detail: 1, tone: 0.06 },
  VERDD: { col: '#3c7f74', metal: 0.5, detail: 0.9, tone: 0.06 },
  OLD: { col: '#7f9c86', metal: 0.3, detail: 1, tone: 0.08 },        // dull, heavily crusted
  BRONZE: { col: '#bb8a50', metal: 0.8, detail: 0.6, tone: 0.07, wear: 0.7 },
  GOLD: { col: '#dcb256', metal: 0.9, detail: 0.25, tone: 0.05, wear: 0.4 },
  DARK: { col: '#2b4144', metal: 0.3, detail: 0.5, tone: 0.08, wear: 0.5 },
  RECESS: { col: '#16262a', metal: 0.1, detail: 0.1, tone: 0.02, wear: 0 },
  VISOR: { col: '#e8ffff', metal: 0, detail: 0, emis: 2, tone: 0, wear: 0 },
  VENT: { col: '#bff2ff', metal: 0, detail: 0, emis: 3, tone: 0, wear: 0 },
};

// variant: proportions in model units (a 10-unit-tall reference body)
const VARIANTS = [
  // name, height m, start [x,z], speed m/s, params
  { name: 'longarm', H: 14, start: [78, -488], speed: 3.0, p: { thigh: 2.2, shin: 2.1, torso: 3.0, shW: 1.5, upper: 2.6, fore: 2.6, headR: 1.2, stoop: 36, lean: 6, slit: 'one', body: 'VERD', limp: 0.0, sway: 1.0 } },
  { name: 'squat', H: 7, start: [36, -470], speed: 2.0, p: { thigh: 1.5, shin: 1.4, torso: 3.4, shW: 1.9, upper: 1.6, fore: 1.5, headR: 1.85, stoop: 24, lean: 2, slit: 'one', body: 'VERDL', limp: 0.0, sway: 1.8 } },
  { name: 'cracked', H: 11, start: [14, -452], speed: 2.6, p: { thigh: 2.0, shin: 1.9, torso: 3.1, shW: 1.6, upper: 2.0, fore: 2.0, headR: 1.55, stoop: 30, lean: 4, slit: 'cracked', body: 'OLD', limp: 0.35, sway: 1.3 } },
  { name: 'lanky', H: 15, start: [44, -514], speed: 3.2, p: { thigh: 2.7, shin: 2.6, torso: 2.6, shW: 1.25, upper: 2.2, fore: 2.2, headR: 1.1, stoop: 30, lean: 3, slit: 'two', body: 'VERDD', limp: 0.0, sway: 0.9 } },
  { name: 'barrel', H: 9, start: [-14, -472], speed: 2.3, p: { thigh: 1.7, shin: 1.6, torso: 3.6, shW: 1.8, upper: 1.9, fore: 1.8, headR: 1.4, stoop: 26, lean: 3, slit: 'one', body: 'VERD', limp: 0.0, sway: 1.5 } },
  { name: 'tilthead', H: 12, start: [100, -462], speed: 2.8, p: { thigh: 2.1, shin: 2.0, torso: 3.0, shW: 1.5, upper: 2.1, fore: 1.7, headR: 1.45, stoop: 32, lean: 5, slit: 'one', body: 'VERDL', limp: 0.2, sway: 1.2, tilt: 18 } },
  { name: 'far', H: 13, start: [-42, -432], speed: 2.9, p: { thigh: 2.3, shin: 2.2, torso: 2.9, shW: 1.5, upper: 2.2, fore: 2.1, headR: 1.35, stoop: 28, lean: 4, slit: 'one', body: 'OLD', limp: 0.0, sway: 1.0 } },
];
const GOAL = [0, -322];   // the breach

function buildWalker(v, seed) {
  const p = v.p;
  const j = {};
  const root = new THREE.Group(); root.name = 'walker:' + v.name; j.root = root;
  const J = (name, parent, pos) => { const g = new THREE.Group(); g.name = name; g.position.set(...pos); parent.add(g); j[name] = g; return g; };
  const k = new Kit(seed);
  const B = PAL[p.body], { BRONZE, GOLD, DARK, RECESS, VISOR, VENT, VERDD, VERDL } = PAL;
  const ankH = 0.55;
  const pelvisY = ankH + p.thigh + p.shin;
  const pelvis = J('pelvis', root, [0, pelvisY, 0]);
  const chest = J('chest', pelvis, [0, 0.35, 0]);
  const neck = J('neck', chest, [0, p.torso, 0.1]);
  const head = J('head', neck, [0, 0.25, 0.1]);
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
    const hip = J('hip' + L, pelvis, [s * p.shW * 0.42, -0.15, 0]);
    const knee = J('knee' + L, hip, [0, -p.thigh, 0]);
    J('ank' + L, knee, [0, -p.shin, 0]);
    const arm = J('arm' + L, chest, [s * p.shW, p.torso * 0.86, 0]);
    const el = J('el' + L, arm, [0, -p.upper, 0]);
    J('wr' + L, el, [0, -p.fore, 0]);
  }
  // ---- torso: a barrel of plates
  const w = p.shW, d = p.shW * 0.68, th = p.torso;
  const T = tube([[-0.2, w * 0.55, d * 0.7, 0, 2.5], [th * 0.3, w * 0.7, d * 0.85, 0.05, 2.6], [th * 0.65, w * 0.95, d, 0.08, 2.7], [th * 0.9, w * 0.9, d * 0.92, 0.04, 2.6], [th * 1.02, w * 0.5, d * 0.6, 0, 2.3]]);
  k.add('chest', solid(T, { k: 0.97, nu: 18, nv: 8 }), DARK);
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    k.add('chest', patch(T, [[0.02, 0.45], [0.22, 0.42], [0.24, 0.85], [0.03, 0.9]], { nu: 4, nv: 4, t: 0.12, crown: 0.08, ridge: 0.05 }), B, undefined, undefined, M);
    k.add('chest', patch(T, [[0.02, 0.08], [0.2, 0.06], [0.22, 0.44], [0.02, 0.46]], { nu: 4, nv: 3, t: 0.1, flare: 0.04 }), VERDD, undefined, undefined, M);
    k.add('chest', patch(T, [[0.23, 0.12], [0.4, 0.12], [0.42, 0.88], [0.25, 0.86]], { nu: 3, nv: 5, t: 0.1, ridge: 0.05 }), B, undefined, undefined, M);
    k.add('chest', patch(T, [[0.41, 0.1], [0.5, 0.1], [0.5, 0.9], [0.43, 0.9]], { nu: 2, nv: 5, t: 0.09 }), VERDL, undefined, undefined, M);
    k.add('chest', ball(w * 0.36, 12, 9), DARK, [w, th * 0.86, 0], undefined, M);
    // pauldron cap
    k.add('chest', hull(superPts(w * 0.5, w * 0.34, w * 0.46, 2.4, 8).map((q) => q.add(v3(w * 1.02, th * 0.92, 0))), 24), B, undefined, undefined, M);
    k.add('chest', cbox(w * 0.5, 0.08, w * 0.7, 0.02), GOLD, [w * 1.02, th * 0.92 - w * 0.3, 0], undefined, M);
  }
  k.add('chest', cylZ(w * 0.22, 0.2, 24), GOLD, [0, th * 0.62, d * 1.02]);
  k.add('chest', cylZ(w * 0.12, 0.26, 18), VENT, [0, th * 0.62, d * 1.04]);
  k.add('chest', cbox(w * 0.3, 0.6, 0.2, 0.04), BRONZE, [0, th * 0.75, -d * 0.95]);
  k.add('chest', cbox(w * 0.2, 0.45, 0.06, 0.02), VENT, [0, th * 0.75, -d * 1.06]);
  // pelvis block + skirt lames
  k.add('pelvis', cbox(w * 1.25, 0.9, d * 1.5, 0.12, { wt: w * 1.1, dt: d * 1.3 }), DARK, [0, 0.1, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (-0.42 + i * 0.17) * Math.PI;
    k.add('pelvis', cbox(w * 0.42, 1.4, 0.1, 0.03, { wt: w * 0.38 }), i % 2 ? B : VERDD, [Math.sin(a) * w * 0.66, -0.3, Math.cos(a) * d * 0.8], [8, a * 57.3, 0]);
  }
  // ---- head: round mask, slit variants
  const hr = p.headR;
  k.add('neck', cyl(hr * 0.45, hr * 0.5, 0.5, 14), DARK, [0, 0.1, 0]);
  k.add('head', hull(superPts(hr, hr * 1.05, hr, 2.3, 12).map((q) => q.add(v3(0, hr, 0))), 40), VERDD);
  const dishPts = (side) => superPts(hr * 0.86, hr * 0.92, hr * 0.32, 2.2, 10).filter((q) => q.x * side > hr * 0.07).map((q) => q.add(v3(0, hr, hr * 0.72)));
  for (const s of [1, -1]) {
    const pts = dishPts(s);
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 6; pts.push(v3(s * hr * 0.07, hr + Math.sin(a) * hr * 0.85, hr * 0.7)); }
    if (p.slit === 'cracked' && s > 0) {
      // a chunk missing from the left cheek: the dish only reaches part way, a jagged edge
      const cut = pts.filter((q) => !(q.y < hr * 0.85 && q.x > hr * 0.35));
      k.add('head', hull(cut, 18), B);
    } else k.add('head', hull(pts, 18), p.slit === 'cracked' ? PAL.OLD : VERDL);
    k.add('head', cylX(hr * 0.26, 0.12, 18), GOLD, [s * hr * 0.98, hr, 0]);
    k.add('head', cbox(0.08, 0.06, hr * 0.5, 0.01), VENT, [s * hr * 0.72, hr * 0.62, hr * 0.62], [0, s * 30, 0]);
  }
  k.add('head', cbox(hr * 0.16, hr * 1.5, hr * 0.3, 0.02), RECESS, [0, hr, hr * 0.86]);
  if (p.slit === 'two') {
    for (const s of [1, -1]) k.add('head', cbox(hr * 0.06, hr * 0.7, 0.1, 0.01), VISOR, [s * hr * 0.3, hr * 1.1, hr * 1.02]);
  } else {
    k.add('head', cbox(hr * 0.07, hr * (p.slit === 'cracked' ? 0.6 : 1.0), 0.14, 0.01), VISOR, [0, hr * (p.slit === 'cracked' ? 1.2 : 1.0), hr * 1.0]);
  }
  k.add('head', hull([v3(-hr * 0.5, hr * 1.62, hr * 0.8), v3(hr * 0.5, hr * 1.62, hr * 0.8), v3(0, hr * 1.55, hr * 1.06), v3(-hr * 0.4, hr * 1.8, hr * 0.5), v3(hr * 0.4, hr * 1.8, hr * 0.5)], 16), GOLD);
  if (p.slit === 'cracked') {
    // a jagged crack across the forehead: thin dark wedge
    k.add('head', hull([v3(-hr * 0.1, hr * 1.5, hr * 1.0), v3(hr * 0.05, hr * 1.42, hr * 1.02), v3(hr * 0.5, hr * 1.1, hr * 0.92), v3(hr * 0.55, hr * 1.08, hr * 0.9), v3(hr * 0.06, hr * 1.45, hr * 0.98)], 30), RECESS);
  }
  // ---- arms
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
    const M = { mirror: s < 0 };
    const r0 = w * 0.3;
    const A = tube([[0.1, r0, r0], [-p.upper * 0.3, r0 * 1.15, r0 * 1.15], [-p.upper * 0.8, r0 * 0.95, r0 * 0.95], [-p.upper, r0 * 0.8, r0 * 0.8]]);
    k.add('arm' + L, solid(A, { nu: 12, nv: 5 }), DARK, undefined, undefined, M);
    k.add('arm' + L, patch(A, [[-0.2, 0.1], [0.2, 0.1], [0.2, 0.85], [-0.2, 0.85]], { nu: 4, nv: 4, t: 0.1, ridge: 0.06 }), B, undefined, undefined, M);
    k.add('arm' + L, patch(A, [[0.3, 0.1], [0.7, 0.1], [0.7, 0.85], [0.3, 0.85]], { nu: 4, nv: 4, t: 0.08 }), VERDD, undefined, undefined, M);
    k.add('arm' + L, cylX(r0 * 0.9, r0 * 2.1, 14), BRONZE, [0, -p.upper, 0], undefined, M);
    const F = tube([[0, r0 * 0.85, r0 * 0.85], [-p.fore * 0.35, r0 * 1.1, r0 * 1.15], [-p.fore * 0.85, r0 * 0.9, r0 * 0.9], [-p.fore, r0 * 0.7, r0 * 0.7]]);
    k.add('el' + L, solid(F, { nu: 12, nv: 5 }), DARK, undefined, undefined, M);
    k.add('el' + L, patch(F, [[-0.22, 0.05], [0.22, 0.05], [0.2, 0.9], [-0.2, 0.9]], { nu: 4, nv: 4, t: 0.1, ridge: 0.08 }), VERDL, undefined, undefined, M);
    k.add('el' + L, patch(F, [[0.28, 0.05], [0.72, 0.05], [0.7, 0.9], [0.3, 0.9]], { nu: 4, nv: 4, t: 0.09 }), B, undefined, undefined, M);
    k.add('el' + L, ring(r0 * 0.75, 0.06, 16), GOLD, [0, -p.fore * 0.95, 0]);
    // mitten hand: palm block + 3 thick fingers
    k.add('wr' + L, cbox(r0 * 1.2, r0 * 2.2, r0 * 1.9, 0.08), VERDD, [0, -r0 * 1.1, 0]);
    for (let f = 0; f < 3; f++) k.add('wr' + L, cbox(r0 * 0.5, r0 * 1.6, r0 * 0.55, 0.06, { wt: r0 * 0.4, dt: r0 * 0.45 }), f % 2 ? B : GOLD, [r0 * 0.15, -r0 * 2.9, (f - 1) * r0 * 0.62], [0, 0, 12 * s]);
  }
  // ---- legs
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
    const M = { mirror: s < 0 };
    const r0 = w * 0.36;
    const T2 = tube([[0.2, r0, r0 * 1.05], [-p.thigh * 0.3, r0 * 1.2, r0 * 1.25], [-p.thigh * 0.85, r0 * 0.95, r0], [-p.thigh, r0 * 0.85, r0 * 0.9]]);
    k.add('hip' + L, solid(T2, { nu: 14, nv: 5 }), DARK, undefined, undefined, M);
    k.add('hip' + L, patch(T2, [[-0.22, 0.05], [0.22, 0.05], [0.2, 0.85], [-0.2, 0.85]], { nu: 4, nv: 4, t: 0.12, ridge: 0.08 }), B, undefined, undefined, M);
    k.add('hip' + L, patch(T2, [[0.28, 0.1], [0.5, 0.1], [0.5, 0.85], [0.3, 0.85]], { nu: 3, nv: 4, t: 0.1 }), VERDD, undefined, undefined, M);
    k.add('knee' + L, cylX(r0 * 0.95, r0 * 2.2, 16), BRONZE, undefined, undefined, M);
    k.add('knee' + L, hull(superPts(r0 * 0.7, r0 * 0.8, r0 * 0.4, 2.4, 8).map((q) => q.add(v3(0, 0, r0 * 0.9))), 24), GOLD, undefined, undefined, M);
    const S = tube([[0, r0 * 0.9, r0 * 0.95], [-p.shin * 0.35, r0 * 1.1, r0 * 1.2, -0.05], [-p.shin * 0.85, r0 * 0.85, r0 * 0.9], [-p.shin, r0 * 0.8, r0 * 0.8]]);
    k.add('knee' + L, solid(S, { nu: 14, nv: 5 }), DARK, undefined, undefined, M);
    k.add('knee' + L, patch(S, [[-0.24, 0.05], [0.24, 0.05], [0.2, 0.9], [-0.2, 0.9]], { nu: 4, nv: 4, t: 0.12, ridge: 0.1 }), VERDL, undefined, undefined, M);
    k.add('knee' + L, patch(S, [[0.3, 0.1], [0.7, 0.1], [0.7, 0.9], [0.3, 0.9]], { nu: 4, nv: 4, t: 0.09 }), B, undefined, undefined, M);
    // foot: broad sabaton, sole at ankle-local y = -ankH
    k.add('ank' + L, ball(r0 * 0.8, 12, 9), DARK, undefined, undefined, M);
    k.add('ank' + L, cbox(r0 * 2.2, ankH * 0.7, r0 * 4.2, 0.1, { wt: r0 * 1.8, dt: r0 * 3.2, zt: -r0 * 0.3 }), B, [0, -ankH * 0.62, r0 * 0.7], undefined, M);
    k.add('ank' + L, cbox(r0 * 2.3, 0.12, r0 * 4.4, 0.03), DARK, [0, -ankH + 0.06, r0 * 0.7], undefined, M);
    k.add('ank' + L, cbox(r0 * 1.0, ankH * 0.5, r0 * 1.2, 0.05), GOLD, [0, -ankH * 0.5, r0 * 2.7], [20, 0, 0], M);
  }
  return { root, j, k, pelvisY, ankH };
}

// Two-bone IK, same convention as colossus.js
function solve2(a, b, c, T, P, bend) {
  a.parent.updateWorldMatrix(true, false);
  const S = a.parent.localToWorld(new V().copy(a.position));
  const ks = a.parent.matrixWorld.getMaxScaleOnAxis() * a.scale.x;
  const L1 = b.position.length() * ks, L2 = c.position.length() * ks;
  const D = T.clone().sub(S);
  const d = Math.min(Math.max(D.length(), Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  const dd = D.normalize();
  const h0 = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(L1 * L1 - h0 * h0, 0));
  const p = P.clone().sub(S);
  p.addScaledVector(dd, -p.dot(dd)).normalize();
  const E = S.clone().addScaledVector(dd, h0).addScaledVector(p, h);
  const Tc = S.clone().addScaledVector(dd, d);
  const u = E.clone().sub(S).normalize();
  const f = Tc.clone().sub(E).normalize();
  const z = f.clone().addScaledVector(u, -f.dot(u));
  if (z.lengthSq() < 1e-6) z.copy(p);
  z.normalize().multiplyScalar(bend);
  const y = u.clone().negate();
  const x = new V().crossVectors(y, z);
  const qW = new Q().setFromRotationMatrix(new M4().makeBasis(x, y, z));
  const qP = a.parent.getWorldQuaternion(new Q());
  a.quaternion.copy(qP.invert().multiply(qW));
  const ang = Math.acos(clamp(u.dot(f), -1, 1));
  b.rotation.set(-bend * ang, 0, 0);
  a.updateWorldMatrix(false, true);
  return ang;
}
function setWorldBasis(o, x, y, z) {
  const qW = new Q().setFromRotationMatrix(new M4().makeBasis(x, y, z));
  o.quaternion.copy(o.parent.getWorldQuaternion(new Q()).invert().multiply(qW));
}

export async function createWalkers(ctx) {
  const tex = bronzeAtlas();
  const mat = bronzeMaterial(tex, { visor: 0.8, patina: 0.22, wear: 0.3 });
  mat.uniforms.uVisor.value = 0.8; mat.uniforms.uVent.value = 0.6; mat.uniforms.uCore.value = 0.4;
  const group = new THREE.Group(); group.name = 'walkers'; group.visible = false;
  ctx.scene.add(group);
  const ground = (x, z) => (ctx.town && typeof ctx.town.groundY === 'function' ? ctx.town.groundY(x, z) : 0);
  const list = VARIANTS.map((v, i) => {
    const w = buildWalker(v, 300 + i * 17);
    w.k.finish(w.j, mat);
    const sc = v.H / 10;
    w.root.scale.setScalar(sc);
    group.add(w.root);
    w.v = v; w.sc = sc;
    const dir = new V(GOAL[0] - v.start[0], 0, GOAL[1] - v.start[1]).normalize();
    w.dir = dir; w.side = new V(dir.z, 0, -dir.x);   // to the walker's left... (perp)
    w.yaw = Math.atan2(dir.x, dir.z);
    // gait: stride ~ 0.7 * leg length (world m), step period from speed
    const leg = (v.p.thigh + v.p.shin) * sc;
    w.stride = leg * 1.15; w.speed = v.speed;
    w.gaitP = (w.stride / v.speed) * (1.6 + 0.35 * (i % 3)); w.gaitPh = i * 1.9;
    w.hipW = v.p.shW * 0.42 * sc;
    ctx.colliders.push({ name: 'walkerFoot' + i + 'L', dept: 'colossus', obj: w.j.ankL, kind: 'body', contact: ['ground', 'terrain', 'field'] });
    ctx.colliders.push({ name: 'walkerFoot' + i + 'R', dept: 'colossus', obj: w.j.ankR, kind: 'body', contact: ['ground', 'terrain', 'field'] });
    return w;
  });
  ctx.shadowRoots.push(group);

  const T0 = CUES.breach;   // they are out there from the breach on (seen through the gap in s29)
  function poseWalker(w, t) {
    const v = w.v, p = v.p, sc = w.sc;
    const q = onTwos(t);
    // distance walked along the path (m). Uneven: each walker surges and hitches on its own rhythm; footprints
    // are fixed along the path (plant(k) depends only on k), so a varying pace never slides a planted foot.
    const per = w.gaitP, amp = Math.min(0.32 * w.stride, 0.85 * w.speed * per / (Math.PI * 2));
    const tau = q - T0;
    const s = w.speed * tau + 6 + amp * (Math.sin((tau / per) * Math.PI * 2 + w.gaitPh) - Math.sin(w.gaitPh));
    const S = w.stride;
    const duty = 0.62;
    const limp = p.limp || 0;
    const base = new V(v.start[0], 0, v.start[1]);
    const at = (dist, lat) => base.clone().addScaledVector(w.dir, dist).addScaledVector(w.side, lat);
    const feet = {};
    let bob = 0, swayL = 0;
    for (const [L, off, sgn] of [['L', 0, 1], ['R', 0.5, -1]]) {
      const c = s / S + off;
      const kk = Math.floor(c), f = c - kk;
      const d = duty + (L === 'R' ? limp * 0.12 : 0);
      const plant = (k2) => (k2 + d / 2 - off) * S;
      let dist, lift = 0, toePitch = 0, f2 = 0;
      if (f < d) { dist = plant(kk); swayL += sgn * (1 - Math.abs(f / d - 0.5) * 2); }
      else {
        const u = (f - d) / (1 - d);
        const e = smooth(u);
        dist = lerp(plant(kk), plant(kk + 1), e);
        lift = Math.sin(Math.PI * u) * (0.12 + 0.05 * (L === 'R' ? limp : 0)) * (p.thigh + p.shin) * sc;
        toePitch = Math.sin(Math.PI * u) * -14 + (u < 0.25 ? 18 * (1 - u * 4) : 0);
      }
      const P = at(dist, sgn * w.hipW * 1.05);
      // a pitched foot dips its toe or heel: lift the ankle by the lever so the sole never cuts the ground
      const r0 = p.shW * 0.36 * sc, lever = (toePitch < 0 ? 3.0 : 1.7) * r0;
      lift = Math.max(lift, Math.abs(Math.sin(deg(toePitch))) * lever + 0.03);
      if (f < d) lift = 0.01;
      P.y = ground(P.x, P.z) + w.ankH * sc + lift;
      feet[L] = { P, toePitch };
    }
    // pelvis between the feet, lowest in double support, swaying over the stance foot (clumsy: overshoot)
    const mid = feet.L.P.clone().add(feet.R.P).multiplyScalar(0.5);
    const along = s;
    const phase = (s / S) * Math.PI * 2;
    bob = Math.abs(Math.sin(phase)) * 0.05 * (p.thigh + p.shin) * sc;
    const sway = Math.sin(phase + 0.4) * 0.18 * w.hipW * p.sway;
    const pel = at(along, sway);
    const legLen = (p.thigh + p.shin) * sc;
    pel.y = ground(pel.x, pel.z) + w.pelvisY * sc - legLen * 0.1 + bob - (limp ? Math.max(0, Math.sin(phase)) * limp * 0.08 * legLen : 0);
    void mid;
    w.root.position.set(pel.x, pel.y - w.pelvisY * sc, pel.z);
    w.root.rotation.set(0, w.yaw + noise1(q * 0.4, w.sc * 7) * 0.06, 0);
    const j = w.j;
    j.pelvis.position.set(0, w.pelvisY, 0);
    j.pelvis.rotation.set(deg(p.lean), Math.sin(phase) * 0.08, Math.sin(phase + 0.4) * 0.05 * p.sway);
    j.chest.rotation.set(deg(p.stoop * 0.6), -Math.sin(phase) * 0.12, -Math.sin(phase + 0.9) * 0.07 * p.sway + noise1(q * 0.7, w.sc) * 0.04);
    j.neck.rotation.set(deg(-p.stoop * 0.28 - 2), 0, 0);
    // twitch: every ~0.8 s the head snaps (over 2 drawn frames) to a new random cock and yaw, then holds
    const tk = Math.floor(q / 0.8 + w.sc), tf = clamp((q / 0.8 + w.sc - tk) * 6);
    const hy = (k2) => noise1(k2 * 3.7, w.sc * 5) * 0.35, hz = (k2) => noise1(k2 * 2.3, w.sc * 9) * 0.22;
    j.head.rotation.set(deg(6 + Math.sin(phase * 2 + 1) * 2.5), lerp(hy(tk - 1), hy(tk), tf), deg(p.tilt || 0) + lerp(hz(tk - 1), hz(tk), tf) + Math.sin(phase + 1.3) * 0.06);
    w.root.updateMatrixWorld(true);
    const fwd = new V().copy(w.dir);
    for (const [L, sg] of [['L', 1], ['R', -1]]) {
      const F = feet[L];
      const pole = F.P.clone().addScaledVector(fwd, 30).add(new V(0, legLen * 0.6, 0));
      solve2(j['hip' + L], j['knee' + L], j['ank' + L], F.P, pole, -1);
      const pitch = deg(F.toePitch);
      const z = fwd.clone().multiplyScalar(Math.cos(pitch)).add(new V(0, Math.sin(pitch), 0)).normalize();
      const up = new V(0, 1, 0);
      const x = new V().crossVectors(up, z).normalize();
      const y = new V().crossVectors(z, x).normalize();
      setWorldBasis(j['ank' + L], x, y, z);
      // arms swing against the legs, heavy and late
      const sw = Math.sin(phase + (L === 'L' ? Math.PI : 0) - 0.5) * 0.45;
      j['arm' + L].rotation.set(sw - 0.1, 0, sg * (0.12 + 0.05 * p.sway));
      j['el' + L].rotation.set(-0.35 - 0.2 * Math.max(0, sw), 0, 0);
      j['wr' + L].rotation.set(-0.1, 0, 0);
    }
    w.root.updateMatrixWorld(true);
  }

  return {
    group, list,
    update(st) {
      const on = st.t >= T0;
      group.visible = on;
      if (!on) return;
      for (const w of list) poseWalker(w, st.t);
    },
  };
}
