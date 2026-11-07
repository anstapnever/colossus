import * as THREE from 'three';
import { buildColossus, SK } from './colossus-model.js';
import { bronzeMaterial, bronzeAtlas } from './colossus-mat.js';
import { poseAt, ventStrength, GRIP } from './colossus-pose.js';
import { createWalkers } from './colossus-walkers.js';
import { celMaterial } from './materials.js';
import { COLOSSUS, wallInnerZ, wallOuterZ, WALL, GATE } from './layout.js';
export { GRIP };
import { deg, clamp, lerp, smooth, Rng } from './util.js';

// COLOSSUS dept: the bronze automaton (90 m) and the walkers.
// createColossus(ctx) → { root, update(st), anchor(name, vec3), anchors('vents'), visible, walkers }
const V = THREE.Vector3, Q = THREE.Quaternion, M4 = THREE.Matrix4;
const U = 10;   // metres per model unit

// Two-bone IK (from the Leviathan archer, MIT). a/b/c joints hang along -Y; T, P world points.
// bend = 1: the lower bone folds toward local +Z (elbow back-to-front); -1: toward -Z (knee).
export function solve2(a, b, c, T, P, bend) {
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
export function setWorldBasis(o, x, y, z) {
  const qW = new Q().setFromRotationMatrix(new M4().makeBasis(x, y, z));
  o.quaternion.copy(o.parent.getWorldQuaternion(new Q()).invert().multiply(qW));
}
export function worldQuatFromBasis(x, y, z) { return new Q().setFromRotationMatrix(new M4().makeBasis(x, y, z)); }

export async function createColossus(ctx) {
  const { CUES } = ctx;
  const P0 = new V(...COLOSSUS.pos);
  const tex = bronzeAtlas();
  const mat = bronzeMaterial(tex, { visor: 0.6 });
  const C = buildColossus(mat);
  const { root, j } = C;
  root.scale.setScalar(U);
  root.position.copy(P0);
  root.visible = false;
  ctx.scene.add(root);
  ctx.shadowRoots.push(root);
  j.head.scale.setScalar(SK.headScale);
  j.pdL.scale.setScalar(0.92); j.pdR.scale.setScalar(0.92);

  // ---- optional stand-in wall + field while the town is not there (OFF by default: ?cwall=1)
  const QS = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  if (QS.get('cwall') === '1') standInWall(ctx);

  // base frame (units, origin COLOSSUS.pos) → world metres
  const W = (a) => new V(P0.x + a[0] * U, P0.y + a[1] * U, P0.z + a[2] * U);
  const dirW = (a) => new V(...a).normalize();

  // anchors
  const A = {};
  const mk = (name, parent, pos) => { const o = new THREE.Object3D(); o.position.set(...pos); parent.add(o); A[name] = o; return o; };
  mk('head', j.head, [0, 0.46, 0.34]);
  mk('visor', j.head, [0, 0.47, 0.66]);
  mk('handR', j.wrR, [0.27, -0.5, 0]);   // palm centre (the hand hangs 0.15 below the wrist pivot)
  mk('chest', j.chest, [0, 1.15, 0.97]);
  mk('footR', j.ankR, [0, -0.35, 0.6]);
  const tips = j.fingersR.map(([, , c]) => mk('tip' + c.name, c, [0, -0.28, 0]));

  // vents: [parent, local pos, local dir]
  const VENTS = [
    [j.head, [0.47, 0.16, 0.1], [0.55, 0.35, -0.75], 0.7],
    [j.head, [-0.47, 0.16, 0.1], [-0.55, 0.35, -0.75], 0.7],
    [j.chest, [0.4, 1.66, -0.92], [0.15, 0.9, -0.4], 1.3],
    [j.chest, [-0.4, 1.66, -0.92], [-0.15, 0.9, -0.4], 1.3],
    [j.pdL, [0.3, 0.68, -0.25], [0.3, 1, -0.2], 0.9],
    [j.pdR, [-0.3, 0.68, -0.25], [-0.3, 1, -0.2], 0.9],
    [j.armL, [0, -1.72, -0.4], [0.8, 0.3, -0.4], 0.6],
    [j.armR, [0, -1.72, -0.4], [-0.8, 0.3, -0.4], 0.6],
    [j.kneeL, [0, -0.14, -0.52], [0.7, 0.5, -0.4], 0.6],
    [j.kneeR, [0, -0.14, -0.52], [-0.7, 0.5, -0.4], 0.6],
    [j.chest, [0, 2.0, -0.7], [0, 0.9, -0.45], 1.1],
  ].map(([p, pos, dir, k], i) => { const o = mk('vent' + i, p, pos); o.userData.dir = new V(...dir).normalize(); o.userData.k = k; return o; });

  // QA colliders (real geometry)
  ctx.colliders.push({ name: 'colossusHand', dept: 'colossus', obj: j.wrR, kind: 'body', contact: ['wall'] });
  // noGround: the kick drives this foot into the burst gate passage, which town.groundY reports as the wall top (50 m).
  // The standing right foot uses the same ankle height as the left one, which IS ground-tested (colossusFootL).
  // Lead/town: once groundY returns 0 inside the gate passage after CUES.kick, drop noGround here.
  ctx.colliders.push({ name: 'colossusFoot', dept: 'colossus', obj: j.ankR, kind: 'body', contact: ['wall', 'ground'], noGround: true });
  ctx.colliders.push({ name: 'colossusFootL', dept: 'colossus', obj: j.ankL, kind: 'body', contact: ['ground'] });

  // finger curl tables (deg about the finger hinge): open → hooked over the wall edge
  const OPEN = [[10, 16, 10], [10, 16, 10], [12, 18, 12], [14, 20, 14]];
  // the clamp: proximal flat on the walkway, middle over the edge, distal curling back INTO the face so the
  // talon bites the stone; each finger a little different. CX (per finger, solved in calibrate) closes the
  // distal joint until its talon touches the face at full grip.
  const HOOK = [[7, 64, 30], [5, 70, 26], [8, 66, 32], [11, 60, 36]];
  const CX = [0, 0, 0, 0];
  const DIG = 12;   // deg the distal joints close while the fingers dig in (tighten)
  const HANG = [[18, 26, 16], [20, 28, 18], [22, 30, 20], [24, 32, 22]];

  // palm-down basis: fingers along the wall's inner-face normal at the grip (the wall is an arc)
  const gx = GRIP.x * U;
  const nIn = new V(-gx, 0, WALL.c[1] - wallInnerZ(gx)).normalize();   // horizontal, toward the town
  const qHang = worldQuatFromBasis(new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1));
  const qPalmDown = worldQuatFromBasis(new V(0, -1, 0), nIn.clone().negate(), new V().crossVectors(new V(0, -1, 0), nIn.clone().negate()));
  const qHangL = worldQuatFromBasis(new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1));

  const tmp = new V();
  const TH_WRAP = [-6, 0, -4, 8, 8];   // thumb at full grip: base [x, y, z], mid, tip (deg): it lies along the stone, tip pressing in
  // wrist pistons: sleeve on the forearm's back side, rod eye on the back of the hand, each aimed at the other
  function aimNegY(o, from, to) {
    o.position.copy(o.parent.worldToLocal(from.clone()));
    const y = from.clone().sub(to).normalize();
    const x = (Math.abs(y.y) < 0.9 ? new V(0, 1, 0) : new V(1, 0, 0)).cross(y).normalize();
    setWorldBasis(o, x, y, new V().crossVectors(x, y));
  }
  function pistons(L, s) {
    const el = j['el' + L], wr = j['wr' + L];
    const E = el.getWorldPosition(new V()), Wp = wr.getWorldPosition(new V());
    const ax = Wp.clone().sub(E).normalize();
    const back = new V(s, 0, 0).transformDirection(wr.matrixWorld);
    const bp = back.addScaledVector(ax, -back.dot(ax)).normalize();
    const cx = new V().crossVectors(ax, bp).normalize();
    const R = U * SK.armScale;
    for (const { sl, rd, side } of j['pistons' + L]) {
      const eye = wr.localToWorld(new V(s * 0.08, -0.3, side * 0.13));
      const base = E.clone().lerp(Wp, 0.62).addScaledVector(bp, 0.36 * R).addScaledVector(cx, side * 0.13 * R);
      aimNegY(sl, base, eye); aimNegY(rd, eye, base);
    }
  }
  function pose(t) {
    const p = poseAt(t);
    root.position.set(P0.x, P0.y, P0.z);   // feet stay on the ground: the breach sag is a knee buckle (poseAt)
    root.scale.setScalar(U);
    // the crouch sits further back from the wall (p.root < 0): a deep squat, hips behind planted feet
    j.pelvis.position.set(p.pelvis[0], p.pelvis[1], p.pelvis[2] + p.root);
    const R = (o, e) => o.rotation.set(deg(e[0]), deg(e[1]), deg(e[2]));
    R(j.pelvis, p.pelvisR); R(j.waist, p.waistR); R(j.chest, p.chestR); R(j.neck, p.neckR); R(j.head, p.headR);
    root.updateMatrixWorld(true);
    // legs
    for (const [L, F, pole] of [['L', p.footL, [1.6, 2.6, 4]], ['R', p.footR, p.kneePoleR || [-1.6, 2.6, 4]]]) {
      solve2(j['hip' + L], j['knee' + L], j['ank' + L], W(F.ankle), W([pole[0], pole[1], pole[2] + 0.6 * p.root]), -1);
      j['cap' + L].rotation.set(-j['knee' + L].rotation.x * 0.5, 0, 0);
      const z = dirW(F.toe), up = dirW(F.up);
      const x = new V().crossVectors(up, z).normalize();
      const y = new V().crossVectors(z, x).normalize();
      setWorldBasis(j['ank' + L], x, y, z);
      j['tas' + L].quaternion.identity().slerp(j['hip' + L].quaternion, 0.5);
    }
    // arms
    const hr = p.handR;
    // wrist flex after the impact: the elbow sinks and swings out while the hand stays clamped
    const fx = hr.flex || 0;
    solve2(j.armR, j.elR, j.wrR, W(hr.wrist), W([-4.2 - 1.6 * fx, 7.5 - 4.0 * fx, -3.5 + 1.0 * fx]), 1);
    j.wrR.quaternion.copy(j.wrR.parent.getWorldQuaternion(new Q()).invert().multiply(qHang.clone().slerp(qPalmDown, hr.palm)));
    solve2(j.armL, j.elL, j.wrL, W(p.handL.wrist), W([4.2, 6.5, -3.5]), 1);
    j.wrL.quaternion.copy(j.wrL.parent.getWorldQuaternion(new Q()).invert().multiply(qHangL));
    j.pdL.quaternion.identity().slerp(j.armL.quaternion, 0.55);
    j.pdR.quaternion.identity().slerp(j.armR.quaternion, 0.55);
    // fingers
    const c = hr.curl, tight = p.tighten || 0, spread = hr.spread || 0;
    j.fingersR.forEach(([a, b, cc], i) => {
      const base = hr.palm > 0.5 ? OPEN[i] : HANG[i];
      // dig in one finger after another (little finger last), the tips bite first
      const ti = clamp(tight * 1.3 - i * 0.1);
      const v = base.map((x, k) => lerp(x, HOOK[i][k] + (k === 2 ? CX[i] - DIG : 0), c) + (k === 2 ? DIG * ti : k === 1 ? 3 * ti : 0));
      // a slight fan in the clamp (the little finger splays most), wide in the beat
      const fan = (i - 1.5) * 5 * spread + (i - 1.2) * 2.6 * hr.palm * clamp(c);
      a.rotation.set(deg(fan), 0, deg(v[0])); b.rotation.set(0, 0, deg(v[1])); cc.rotation.set(0, 0, deg(v[2]));
    });
    j.fingersL.forEach(([a, b, cc], i) => { const v = HANG[i]; a.rotation.set(0, 0, deg(-v[0])); b.rotation.set(0, 0, deg(-v[1])); cc.rotation.set(0, 0, deg(-v[2])); });
    // thumb: splayed in the beat, wraps in toward the palm as the grip closes
    const wrap = hr.palm * clamp(c);
    j.thR.rotation.set(deg(lerp(30, 14, hr.palm) - 14 * spread + TH_WRAP[0] * wrap), deg(TH_WRAP[1] * wrap), deg(lerp(20, 12, hr.palm) + TH_WRAP[2] * wrap));
    j.th2R.rotation.set(0, 0, deg(10 + TH_WRAP[3] * wrap)); j.th3R.rotation.set(0, 0, deg(8 + TH_WRAP[4] * wrap));
    j.thL.rotation.set(deg(30), 0, deg(-20)); j.th2L.rotation.set(0, 0, deg(-12)); j.th3L.rotation.set(0, 0, deg(-10));
    root.updateMatrixWorld(true);
    pistons('L', 1); pistons('R', -1);
    root.updateMatrixWorld(true);
    return p;
  }

  const walkers = await createWalkers(ctx);

  let lastT = -1, lastP = null;
  const api = {
    root, j, walkers, visible: false, tris: C.tris,
    pose,
    anchor(name, out = new V()) {
      if (name === 'fingertipsR') { out.set(0, 0, 0); for (const o of tips) out.add(o.getWorldPosition(tmp)); return out.multiplyScalar(1 / tips.length); }
      const o = A[name];
      if (!o) return out;
      return o.getWorldPosition(out);
    },
    anchors(name) {
      if (name !== 'vents') return [];
      const s = api.visible ? ventStrength(lastT) : 0;
      if (s <= 0) return [];
      const q = new Q();
      return VENTS.map((o) => {
        const pW = o.getWorldPosition(new V());
        o.getWorldQuaternion(q);
        const d = o.userData.dir.clone().applyQuaternion(q).normalize();
        return { pos: pW.toArray(), dir: d.toArray(), strength: s * o.userData.k };
      });
    },
    update(st) {
      const t = st.t;
      lastT = t;
      lastP = pose(t);
      api.visible = lastP.visible;
      root.visible = lastP.visible;
      mat.uniforms.uVisor.value = lastP.visor;
      mat.uniforms.uCore.value = lastP.core;
      mat.uniforms.uVent.value = lastP.vent;
      mat.uniforms.uGlow.value = lastP.glow;
      mat.uniforms.uDissolve.value = lastP.dissolve;
      walkers.update(st);
    },
  };
  // ---- calibrate the grip against the real wall: palm 3 cm proud of the walkway, fingers just off the face,
  // then close each distal joint until its talon touches the inner face (the bite)
  const grabEx = (root, skip) => {
    const pts = [];
    const walk = (o) => {
      if (skip && skip.has(o)) return;
      if (o.isMesh) { o.updateMatrixWorld(); const P = o.geometry.attributes.position; for (let i = 0; i < P.count; i += 2) pts.push(new V().fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld)); }
      for (const ch of o.children) walk(ch);
    };
    walk(root);
    return pts;
  };
  const distal = new Set(j.fingersR.map(([, , cc]) => cc));
  const faceD = (p) => p.z - wallInnerZ(p.x);
  const BITE = [];
  function calibrate() {
    const tHold = CUES.hand + 3.0;
    const grab = (root) => grabEx(root, null);
    for (let it = 0; it < 3; it++) {
      pose(tHold);
      // 1) the bent finger segments (b) must hang just past the inner edge
      const hang = j.fingersR.flatMap(([, b]) => grabEx(b, distal));
      let dz = -Infinity;
      for (const p of hang) dz = Math.max(dz, wallInnerZ(p.x) + 0.12 - p.z);
      // 2) the palm then rests on the walkway, 3 cm proud
      const all = grabEx(j.wrR, distal);
      let top = Infinity;
      for (const p of all) {
        const z = p.z + dz;
        if (z < wallInnerZ(p.x) && z > wallOuterZ(p.x)) top = Math.min(top, p.y - WALL.h);
      }
      const dy = 0.03 - top;
      // 3) anything else below the walkway keeps off the face (the string course at 47–48.2 stands 0.45 proud);
      //    the distal segments are solved separately: their talons touch the face
      let face = Infinity;
      for (const p of grabEx(j.wrR, distal)) {
        const y = p.y + dy, z = p.z + dz;
        if (y < WALL.h && z > wallOuterZ(p.x)) face = Math.min(face, z - wallInnerZ(p.x) - (y < 48.4 ? 0.5 : 0.06));
      }
      const extra = face < 0 ? -face : 0;
      GRIP.wrist[1] += dy / U; GRIP.wrist[2] += (dz + extra) / U;
    }
    // 4) per finger: close the distal joint until the nearest talon/pad point is 2 cm off the inner face
    //    (and anything of it above the string course stays 0.5 m clear of the course)
    const gap = (i) => {
      pose(tHold);
      let d = Infinity, at = null;
      for (const p of grabEx(j.fingersR[i][2], null)) {
        if (p.y > WALL.h - 0.05) continue;
        const f = faceD(p) - (p.y > 46.9 && p.y < 48.3 ? 0.48 : 0);
        if (f < d) { d = f; at = p; }
      }
      return [d, at];
    };
    for (let i = 0; i < 4; i++) {
      let lo = -40, hi = 70;
      CX[i] = lo; if (gap(i)[0] < 0.02) { CX[i] = lo; continue; }
      CX[i] = hi; if (gap(i)[0] > 0.02) continue;
      for (let k = 0; k < 18; k++) { CX[i] = (lo + hi) / 2; if (gap(i)[0] > 0.02) lo = CX[i]; else hi = CX[i]; }
      CX[i] = lo;
    }
    for (let i = 0; i < 4; i++) { const g2 = gap(i); ctx.colossusBites = (ctx.colossusBites || []).concat([[i, +CX[i].toFixed(1), +g2[0].toFixed(3)]]); BITE.push(g2[1] ? g2[1].clone() : new V(-33 - i * 2.3, 46, wallInnerZ(-33))); }
  }
  calibrate();
  const bites = fingertipBites(ctx, BITE, CUES);
  const upd0 = api.update;
  api.update = (st) => { upd0(st); bites.update(st.t); };
  pose(30);
  ctx.colossus = api;
  return api;
}

// ------------------------------------------------------------------ stand-in
// A crude wall + field for testing while the town department builds the real one. Never on by default.
function standInWall(ctx) {
  const m = celMaterial({ color: '#e8cfae', dark: '#a88a78', id: 19, weather: [0.4, 0, 0, 0] });
  const g = new THREE.Group(); g.name = 'colossusStandInWall';
  const box = (w, h, d, x, y, z, mm = m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mm); b.position.set(x, y, z); b.geometry.setAttribute('aRest', b.geometry.attributes.position.clone()); g.add(b); return b; };
  const zi = wallInnerZ(0), zo = wallOuterZ(0), th = zi - zo;
  const zc = (zi + zo) / 2;
  const half = GATE.w / 2;
  box(300 - half, 50, th, -(half + (300 - half) / 2), 25, zc);
  box(300 - half, 50, th, half + (300 - half) / 2, 25, zc);
  box(GATE.w, 50 - GATE.h, th, 0, GATE.h + (50 - GATE.h) / 2, zc);
  for (const z of [zi - 0.5, zo + 0.5]) box(600, 2.2, 1.0, 0, 51.1, z);
  const gm = celMaterial({ color: '#b7c98a', dark: '#7d8d6a', id: 18, weather: [0.3, 0, 0, 0] });
  const ground = box(1600, 1, 1600, 0, -0.5, -300, gm);
  void ground; void WALL;
  ctx.scene.add(g);
  ctx.colliders.push({ name: 'wall', dept: 'colossus-standin', obj: g, kind: 'solid' });
  return g;
}

// ------------------------------------------------------------- talon bites
// Where each talon bites the inner face: a dark divot, a star of jagged cracks growing out of it and a few stone
// chips spat out and falling. Scene-level (not part of the dissolving giant). Pure function of t.
function fingertipBites(ctx, pts, CUES) {
  const rng = new Rng(4517);
  const g = new THREE.Group(); g.name = 'colossusTalonBites';
  const mCrack = celMaterial({ color: '#6e5246', dark: '#4e382f', id: 36, weather: [0, 0, 0, 0] });
  const mPit = celMaterial({ color: '#f2dcc0', dark: '#c0a08c', id: 37, weather: [0, 0, 0, 0] });
  const mChip = celMaterial({ color: '#e6cba6', dark: '#a8887a', id: 38, weather: [0.2, 0, 0, 0] });
  const geo = (pos) => { const b = new THREE.BufferGeometry(); b.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); b.computeVertexNormals(); b.setAttribute('aRest', b.attributes.position.clone()); return b; };
  // the bite times follow the dig-in of each finger (same stagger as the pose: index first, little finger last)
  const hand = CUES.hand, imp = hand + 1 / 3;
  const tB = [0, 1, 2, 3].map((i) => {
    for (let t = imp; t < imp + 3; t += 1 / 120) { const ti = clamp((poseAt(t).tighten || 0) * 1.3 - i * 0.1); if (ti >= 0.8) return t; }
    return imp + 1;
  });
  const items = pts.map((P, i) => {
    const n = new V(-P.x, 0, WALL.c[1] - P.z).normalize();   // inner-face normal (toward the town)
    if (n.z < 0) n.negate();
    const up = new V(0, 1, 0), tg = new V().crossVectors(up, n).normalize();
    const o = new THREE.Group();
    o.position.copy(P).setZ(wallInnerZ(P.x)).addScaledVector(n, 0.03);
    o.quaternion.setFromRotationMatrix(new M4().makeBasis(tg, up, n));
    g.add(o);
    // divot: an irregular pit, lighter broken stone, slightly proud of the face so it never z-fights
    const pit = [];
    const nP = 9, rp = rng.range(0.32, 0.42);
    const ring = [...Array(nP)].map((_, k) => { const a = (k / nP) * Math.PI * 2; const r = rp * rng.range(0.65, 1.15); return [Math.cos(a) * r, Math.sin(a) * r * 1.2 - 0.05]; });
    for (let k = 0; k < nP; k++) { const a = ring[k], b = ring[(k + 1) % nP]; pit.push(0, -0.05, 0.004, a[0], a[1], 0.004, b[0], b[1], 0.004); }
    const pitM = new THREE.Mesh(geo(pit), mPit); o.add(pitM);
    // the deep notch the talon point sits in
    const nt = [];
    const r2 = rp * 0.45;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, b = ((k + 1) / 6) * Math.PI * 2; nt.push(0, -0.08, 0.01, Math.cos(a) * r2, Math.sin(a) * r2 * 1.4 - 0.08, 0.01, Math.cos(b) * r2, Math.sin(b) * r2 * 1.4 - 0.08, 0.01); }
    o.add(new THREE.Mesh(geo(nt), mCrack));
    // cracks: 6–8 jagged branches, mostly down and sideways (the load pulls down), tapering, a fork on the long ones
    const cr = [];
    const branch = (x0, y0, ang, len, w0, depth) => {
      let x = x0, y = y0, a = ang;
      const nS = 4, pts2 = [[x, y]];
      // stone cracks run in straight jags that kink hard (and like to follow the mortar: snap toward 0/90 deg)
      for (let k = 0; k < nS; k++) { a = ang + rng.range(-0.75, 0.75); if (rng.next() < 0.35) a = Math.round(a / (Math.PI / 2)) * (Math.PI / 2); const l = (len / nS) * rng.range(0.6, 1.4); x += Math.cos(a) * l; y += Math.sin(a) * l; pts2.push([x, y]); }
      for (let k = 0; k < nS; k++) {
        const [ax, ay] = pts2[k], [bx, by] = pts2[k + 1];
        const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L, wa = w0 * (1 - k / nS), wb = w0 * (1 - (k + 1) / nS) + 0.004;
        cr.push(ax + nx * wa, ay + ny * wa, 0.008, ax - nx * wa, ay - ny * wa, 0.008, bx + nx * wb, by + ny * wb, 0.008);
        cr.push(ax - nx * wa, ay - ny * wa, 0.008, bx - nx * wb, by - ny * wb, 0.008, bx + nx * wb, by + ny * wb, 0.008);
        if (depth < 1 && k === 2 && len > 1.2) branch(bx, by, a + rng.sign() * rng.range(0.5, 0.9), len * 0.5, w0 * 0.55, depth + 1);
      }
    };
    const nb = rng.int(5, 6);
    for (let k = 0; k < nb; k++) {
      const ang = -Math.PI / 2 + ((k + 0.5) / nb - 0.5) * Math.PI * 1.9 + rng.range(-0.2, 0.2);
      const down = Math.max(0, -Math.sin(ang));
      branch(Math.cos(ang) * rp * 0.7, Math.sin(ang) * rp * 0.7 - 0.05, ang, rng.range(0.8, 1.4) + 1.2 * down, rng.range(0.045, 0.065), 0);
    }
    const crM = new THREE.Mesh(geo(cr), mCrack); o.add(crM);
    // chips: spat out of the bite, tumbling down past the string course
    const chips = [...Array(5)].map(() => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rng.range(0.1, 0.22), 0), mChip);
      m.geometry.setAttribute('aRest', m.geometry.attributes.position.clone());
      m.scale.set(1, rng.range(0.6, 1), rng.range(0.7, 1.1));
      g.add(m);
      return { m, d: rng.range(0, 0.12), v: [rng.range(-2.2, 2.2), rng.range(0.6, 3.0), rng.range(1.0, 3.2)], w: [rng.range(-9, 9), rng.range(-9, 9), rng.range(-9, 9)] };
    });
    return { o, pitM, crM, n, tg, P: o.position.clone(), chips, t0: tB[i] };
  });
  ctx.scene.add(g);
  const _p = new V();
  return {
    group: g,
    update(t) {
      for (const it of items) {
        const a = t - it.t0;
        it.o.visible = a >= 0;
        if (a >= 0) {
          // pit snaps in on the bite, cracks run out over ~0.3 s with a second creep as the grip settles
          const gp = 0.55 + 0.45 * smooth(a / 0.08);
          it.pitM.scale.set(gp, gp, 1);
          const gc = 0.08 + 0.72 * (1 - Math.pow(1 - clamp(a / 0.3), 3)) + 0.2 * smooth((a - 0.4) / 1.6);
          it.crM.scale.set(gc, gc, 1);
        }
        for (const c of it.chips) {
          const b = a - c.d;
          const on = b >= 0 && b < 2.4;
          c.m.visible = on;
          if (!on) continue;
          _p.copy(it.P).addScaledVector(it.tg, c.v[0] * b).addScaledVector(it.n, 0.15 + c.v[2] * b);
          _p.y += c.v[1] * b - 4.9 * b * b;
          c.m.position.copy(_p);
          c.m.rotation.set(c.w[0] * b, c.w[1] * b, c.w[2] * b);
          if (_p.y < 0.2) c.m.visible = false;
        }
      }
    },
  };
}
