import { onTwos, track, noise1, clamp, lerp, smooth, easeOut, easeIn, invLerp } from './util.js';
import { DIMS, hipHeight } from './folk-rig.js';

// The performance. Everything is a pure function of film time t (drawn on twos).
// Poses: { pos, yaw, hip, hipRot, spine, neck, head, legs:{L:{foot,yaw,pole}}, arms:{L:{sh,el,wr,curl}|{target,pole}}, face, ears, tail }
// Character local frame: +Z forward, +X = the character's LEFT. World north is -Z, so facing north = yaw PI.

const PI = Math.PI;
export const KD = DIMS.kid;
const KHIP = hipHeight(KD);
const SEAT = 0.14;                       // hips above the seat surface (pelvis bottom touches)

// local -> world for a ground point (x, z) and heading yaw
export function xf(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (lx, ly, lz) => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
}

// ---------------------------------------------------------------- generic helpers
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
export function lerpDeep(a, b, u) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * u;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.map((x, i) => lerpDeep(x, b[i], u));
  if (isObj(a) && isObj(b)) {
    // arm IK <-> FK cannot blend: switch at the middle
    if (('target' in a) !== ('target' in b)) return u < 0.5 ? a : b;
    const o = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = lerpDeep(a[k], b[k], u);
    // feet lift along their path when they travel
    if (a.foot && b.foot) {
      const d = Math.hypot(b.foot[0] - a.foot[0], b.foot[2] - a.foot[2]) + Math.abs(b.foot[1] - a.foot[1]) * 0.5;
      if (d > 0.02) o.foot = [o.foot[0], o.foot[1] + Math.sin(u * PI) * Math.min(0.16, 0.06 + d * 0.35) + Math.max(0, (Math.max(a.foot[1], b.foot[1]) - o.foot[1])) * Math.sin(u * PI), o.foot[2]];
    }
    return o;
  }
  return u < 0.5 ? a : b;
}
export function merge(a, b) {
  if (!isObj(a) || !isObj(b)) return b === undefined ? a : b;
  const o = { ...a };
  for (const k of Object.keys(b)) o[k] = isObj(a[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k];
  return o;
}
// keys: [[time, pose, ease?], ...]
export function timeline(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, p0] = keys[i - 1], [t1, p1, e] = keys[i];
      return lerpDeep(p0, p1, (e || smooth)((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}
// blink: quick close/open every ~3 s with seeded jitter
export function blinkAt(t, seed = 0, every = 3.1) {
  const k = Math.floor(t / every);
  const h = (n) => { const s = Math.sin(n * 91.7 + seed * 13.3) * 43758.5; return s - Math.floor(s); };
  const at = k * every + 0.3 + h(k) * (every - 0.6);
  const d = t - at;
  if (d < 0 || d > 0.2) return 0;
  return d < 0.07 ? d / 0.07 : d < 0.12 ? 1 : 1 - (d - 0.12) / 0.08;
}
// speech: mouth open amount from layered noise
export function talk(t, seed = 0, amt = 1) {
  const s = Math.max(0, noise1(t * 9.0, seed) * 0.7 + noise1(t * 3.1, seed + 7) * 0.5 + 0.25);
  return clamp(s * amt, 0, 1);
}
const breathe = (t, seed = 0, a = 1) => Math.sin(t * 2.2 + seed) * 0.02 * a;

// ---------------------------------------------------------------- pose builders
export function standP(D, x, gy, z, yaw, o = {}) {
  const W = xf(x, z, yaw);
  const w = D.hipW * 1.15 + (o.wide ?? 0);
  const hipY = hipHeight(D);
  return {
    pos: [x, gy, z], yaw,
    hip: [o.hx ?? 0, hipY - (o.drop ?? 0.012), o.hz ?? 0],
    hipRot: o.hipRot ?? [0, 0, 0], spine: o.spine ?? [0, 0, 0], neck: o.neck ?? [0, 0, 0], head: o.head ?? [0, 0, 0],
    legs: {
      L: { foot: W(w + (o.lx ?? 0), (o.gyL ?? gy) + D.footH + (o.liftL ?? 0), o.fl ?? 0.0), yaw: o.fyL ?? 0.12, pitch: o.fpL ?? 0 },
      R: { foot: W(-w + (o.rx ?? 0), (o.gyR ?? gy) + D.footH + (o.liftR ?? 0), o.fr ?? 0.0), yaw: o.fyR ?? -0.12, pitch: o.fpR ?? 0 },
    },
    arms: o.arms ?? { L: { sh: [0.05, 0, 0.12], el: 0.2 }, R: { sh: [0.05, 0, -0.12], el: 0.2 } },
  };
}
// sitting on a ledge: (x, sy, z) = seat point under the pelvis; legs dangle over the edge in front
export function sitP(D, x, sy, z, yaw, o = {}) {
  const W = xf(x, z, yaw);
  const w = D.hipW * 1.12;
  const hy = sy + SEAT + (o.hy ?? 0);
  const ankle = (side, phi) => {
    const kz = D.thigh * 0.985, ky = hy - 0.02;
    return W(side * w, ky - D.shin * Math.cos(phi), kz + D.shin * Math.sin(phi));
  };
  return {
    pos: [x, sy, z], yaw,
    hip: [0, SEAT + (o.hy ?? 0), 0], hipRot: o.hipRot ?? [-0.05, 0, 0], spine: o.spine ?? [0.08, 0, 0], neck: o.neck ?? [0, 0, 0], head: o.head ?? [0, 0, 0],
    legs: {
      L: { foot: ankle(1, o.phiL ?? 0.15), yaw: 0.1, pitch: o.ptL ?? 0.25, pole: W(w * 1.5, hy + 1.2, 1.4) },
      R: { foot: ankle(-1, o.phiR ?? 0.15), yaw: -0.1, pitch: o.ptR ?? 0.25, pole: W(-w * 1.5, hy + 1.2, 1.4) },
    },
    arms: o.arms ?? { L: { sh: [-0.2, 0, 0.18], el: 0.6 }, R: { sh: [-0.2, 0, -0.18], el: 0.6 } },
  };
}
// sitting with knees up, feet planted on the same surface (hugging the knees)
export function sitKneesP(D, x, sy, z, yaw, o = {}) {
  const W = xf(x, z, yaw);
  return {
    pos: [x, sy, z], yaw,
    hip: [0, SEAT, 0], hipRot: [-0.15, 0, 0], spine: o.spine ?? [0.32, 0, 0], neck: o.neck ?? [0.0, 0, 0], head: o.head ?? [-0.1, 0, 0],
    legs: {
      L: { foot: W(D.hipW * 1.0, sy + D.footH, o.fz ?? 0.25), yaw: 0.05, pole: W(0.2, sy + 1.2, 1.0) },
      R: { foot: W(-D.hipW * 1.0, sy + D.footH, o.fz ?? 0.25), yaw: -0.05, pole: W(-0.2, sy + 1.2, 1.0) },
    },
    arms: o.arms ?? { L: { target: W(0.035, sy + 0.24, 0.26), pole: W(0.6, sy + 0.2, -0.4), curl: 0.6 }, R: { target: W(-0.035, sy + 0.24, 0.26), pole: W(-0.6, sy + 0.2, -0.4), curl: 0.6 } },
  };
}
// on all fours: knees on the tread, hands forward on the tread
export function kneelP(D, x, gy, z, yaw) {
  const W = xf(x, z, yaw);
  const kr = 0.043;
  const kneeZ = 0.0;
  const hipZ = -0.04, hipY = gy + kr + Math.sqrt(D.thigh * D.thigh - (kneeZ - hipZ) ** 2);
  return {
    pos: [x, gy, z], yaw,
    hip: [0, hipY - gy, hipZ], hipRot: [0.55, 0, 0], spine: [0.8, 0, 0], neck: [-0.65, 0, 0], head: [-0.5, 0, 0],
    legs: {
      L: { foot: W(D.hipW * 1.1, gy + kr * 0.9, kneeZ - D.shin), yaw: 0.05, pitch: -1.35, pole: W(0.1, gy, 1.0) },
      R: { foot: W(-D.hipW * 1.1, gy + kr * 0.9, kneeZ - D.shin), yaw: -0.05, pitch: -1.35, pole: W(-0.1, gy, 1.0) },
    },
    arms: {
      L: { target: W(0.13, gy + 0.045, 0.28), pole: W(0.4, gy + 0.3, 0.0), wr: [-1.15, 0, 0], curl: 0.1 },
      R: { target: W(-0.13, gy + 0.045, 0.3), pole: W(-0.4, gy + 0.3, 0.0), wr: [-1.15, 0, 0], curl: 0.1 },
    },
  };
}
// running gait with planted feet: (x, gy, z) body ground point, yaw heading, s distance travelled, L stride length
export function runP(D, x, gy, z, yaw, s, L, o = {}) {
  const W = xf(x, z, yaw);
  const duty = o.duty ?? 0.42;
  const hipY = hipHeight(D);
  const legs = {};
  let bob = 0;
  for (const [nm, side, off] of [['L', 1, 0], ['R', -1, 0.5]]) {
    const ph = s / L + off;
    const n = Math.floor(ph), u = ph - n;
    // stance: planted at a fixed world point; local z = P_n - s
    const Pn = (k) => (k - off + duty / 2) * L - s;
    let fz, fy = 0, pitch;
    if (u < duty) { fz = Pn(n); pitch = lerp(-0.15, 0.45, u / duty); }
    else {
      const w = (u - duty) / (1 - duty);
      fz = lerp(Pn(n), Pn(n + 1), smooth(w));
      fy = Math.sin(w * PI) * (0.08 + L * 0.22);
      pitch = lerp(0.6, -0.3, w);
      bob = Math.max(bob, Math.sin(w * PI));
    }
    legs[nm] = { foot: W(side * D.hipW * 1.0, gy + D.footH + fy, fz), yaw: 0, pitch: pitch * 0.5 };
  }
  const ph = s / L;
  const swingA = Math.sin(ph * 2 * PI);
  const lean = o.lean ?? 0.2;
  const arms = o.arms === 'reach'
    ? { L: { sh: [-1.3, 0, 0.4], el: 0.2, curl: 0.1 }, R: { sh: [-1.3, 0, -0.4], el: 0.2, curl: 0.1 } }
    : o.arms === 'up'
      ? { L: { sh: [-2.6, 0, 0.4], el: 0.6, curl: 0.4 }, R: { sh: [-2.4, 0, -0.5], el: 0.8, curl: 0.4 } }
      : { L: { sh: [0.9 * swingA - 0.1, 0, 0.12], el: 1.3, curl: 0.8 }, R: { sh: [-0.9 * swingA - 0.1, 0, -0.12], el: 1.3, curl: 0.8 } };
  return {
    pos: [x, gy, z], yaw,
    hip: [0, hipY - 0.06 * (D === DIMS.adult ? 2 : 1) + bob * 0.035, 0], hipRot: [0, 0.15 * swingA, 0], spine: [lean, -0.2 * swingA, 0], neck: [-lean * 0.5, 0, 0], head: o.head ?? [-lean * 0.3, 0.15 * swingA, 0],
    legs, arms,
  };
}

function faceBase(t, seed, o = {}) {
  return { blink: blinkAt(t, seed), look: [0, 0], pupil: 0.38, mouth: 0, lid: 0, lidB: 0, tilt: 0, browUp: 0, browTilt: 0, wet: 0, mouthW: 0, ...o };
}

// ---------------------------------------------------------------- the kids
// Steps: tread i covers z in [73-(i+1), 73-i], top y = -0.5(i+1); quay y 0 south of z 73. Kids face north (yaw PI).
const N = PI;
const T0 = -0.5, T1 = -1.0, T2 = -1.5, T3 = -2.0;
export const KIDSPOT = {
  fox: { seat: [-39.1, T0, 72.12], stand: [-39.1, T3, 69.4] },
  hare: { seat: [-40.35, T0, 72.62], stand: [-40.45, T1, 71.45] },
  lynx: { seat: [-41.7, T1, 71.12], stand: [-41.45, T1, 71.3] },
};

function foxPose(t) {
  const q = onTwos(t);
  const [sx, sy, sz] = KIDSPOT.fox.seat;
  const W = xf(sx, sz, N);
  const hand = (side, back) => ({ target: W(side * 0.17, sy + 0.075, -0.05 - back), pole: W(side * 0.5, sy + 0.4, -0.6), wr: [0.9, 0, 0], curl: 0.15 });
  const sitBase = (o) => sitP(KD, sx, sy, sz, N, { arms: { L: hand(1, 0.02), R: hand(-1, 0.0) }, ...o });
  const swing = Math.sin(q * 3.4) * 0.35 + 0.25;
  // --- sitting (0 .. 21): watches the town, turns to tell the hare something, grins
  if (t < 21.0) {
    // s03: tosses a pebble into the canal (3.6..4.0), laughs, turns to the hare and tells a joke, grins
    const turn = track([[0, 0.05], [4.9, 0.05], [5.25, 0.75], [6.9, 0.7], [7.35, 0.15], [12, 0.1], [13.4, 0.5], [16, 0.45]], q);
    const laughF = track([[4.0, 0], [4.12, 1], [4.55, 1], [4.85, 0]], q);
    const thr = track([[3.6, 0], [3.82, 1], [3.97, 0.6], [4.2, 0]], q);          // body leans into the throw
    const p = sitBase({ phiL: swing, phiR: 0.25 - swing * 0.6, spine: [0.06 + breathe(q, 1) + 0.12 * thr - 0.12 * laughF, turn * 0.25 - 0.2 * thr, 0],
      neck: [-0.05, turn * 0.35, 0], head: [-0.08 - 0.06 * Math.sin(q * 0.7) - laughF * (0.2 + 0.06 * Math.abs(Math.sin(q * 15))), turn * 0.45, turn * 0.08] });
    if (t > 3.4 && t < 4.8) {
      const R0 = [-0.17, 0.075, -0.05];
      const hp = track([[3.6, R0], [3.82, [-0.24, 0.5, -0.14]], [3.97, [-0.16, 0.42, 0.36], (u) => u], [4.15, [-0.12, 0.24, 0.3]], [4.7, R0]], t);
      p.arms = { L: p.arms.L, R: { target: W(hp[0], sy + hp[1], hp[2]), pole: W(-0.5, sy + 0.3, -0.4), wr: [track([[3.55, 0.9], [3.75, 0.1], [4.45, 0.1], [4.7, 0.9]], t), 0, 0], curl: track([[3.55, 0.15], [3.65, 0.85], [3.95, 0.85], [4.0, 0.1], [4.5, 0.1], [4.7, 0.15]], t) } };
    }
    const talking = q > 5.3 && q < 6.1 ? talk(q, 3, 1) : 0;
    const grin = track([[6.0, 0], [6.25, 1], [7.2, 1], [7.6, 0.3]], q);
    p.face = faceBase(q, 1, { blink: laughF > 0.5 ? 0 : blinkAt(q, 1), mouth: talking * 0.7 + grin * 0.25 + laughF * (0.65 + 0.3 * Math.abs(Math.sin(q * 15))), look: [turn * 0.5, 0.1 - 0.25 * thr],
      lid: laughF * 0.85, lidB: grin * 0.35 + laughF * 0.4, browUp: grin * 0.3 + laughF * 0.4, mouthW: grin * 0.4 + laughF * 0.3 });
    p.ears = [Math.sin(q * 1.3) * 0.05, 0]; p.tail = [0.85, 0.3 + Math.sin(q * 1.7) * 0.15];
    return p;
  }
  // --- stands (21..22) on tread 1 and stares at the flash; startle at 23.5
  const st0 = standP(KD, sx, T1, 71.45, N, { head: [-0.25, 0, 0], neck: [-0.1, 0, 0], arms: { L: { sh: [0.1, 0, 0.18], el: 0.35, curl: 0.5 }, R: { sh: [0.1, 0, -0.18], el: 0.35, curl: 0.5 } } });
  st0.face = faceBase(q, 1, { pupil: 0.3, browUp: 0.6, mouth: 0.15 });
  st0.tail = [1.1, 0.3];
  if (t < 23.5) {
    const sit = sitBase({ phiL: 0.2, phiR: 0.2 });
    sit.face = faceBase(q, 1); sit.tail = [0.85, 0.3];
    if (t < 22.0) return timeline([[21.0, sit], [21.8, st0, easeOut]], q);
    return st0;
  }
  // startle: thrown back, sits down hard on tread 0 behind him, arms flung
  const lt = t - 23.5;
  const fallSit = sitP(KD, sx, T0, 72.13, N + 0.18, { phiL: 0.6, phiR: 0.15, spine: [-0.35, 0.15, 0.1], neck: [-0.2, 0, 0], head: [-0.3, -0.2, 0.15],
    arms: { L: { sh: [-1.6, 0, 0.9], el: 0.5, curl: 0.0 }, R: { sh: [-0.9, 0, -1.2], el: 0.3, curl: 0.0 } } });
  fallSit.face = faceBase(q, 1, { blink: 0, pupil: 0.22, browUp: 1, mouth: 0.8 });
  fallSit.tail = [2.0, -0.6];
  const recoil = standP(KD, sx, T1, 71.62, N + 0.1, { drop: 0.05, spine: [-0.4, 0.1, 0.1], head: [-0.3, 0, 0.1], hz: 0.06,
    arms: { L: { sh: [-1.2, 0, 0.7], el: 0.4, curl: 0 }, R: { sh: [-0.7, 0, -1.0], el: 0.3, curl: 0 } } });
  recoil.face = faceBase(q, 1, { blink: 0, pupil: 0.24, browUp: 1, mouth: 0.6 });
  recoil.tail = [2.0, -0.6];
  const settled = merge(fallSit, { spine: [-0.15, 0.1, 0.05], head: [-0.15, -0.2, 0.05] });
  if (t < 28.0) {
    const k = timeline([[0, st0], [0.12, recoil, easeOut], [0.45, fallSit, easeIn], [0.6, settled]], onTwos(lt));
    if (lt > 0.45 && lt < 0.7) k.hip = [k.hip[0], k.hip[1] + Math.abs(Math.sin((lt - 0.45) * 40)) * 0.012 * (0.7 - lt) * 4, k.hip[2]];
    return k;
  }
  // --- s13 (28..31): gets up, turns to the wall, runs down two treads
  const getUp = standP(KD, sx - 0.05, T1, 71.55, N + 0.05, { drop: 0.1, spine: [0.45, 0, 0], head: [-0.4, 0, 0], arms: { L: { sh: [-0.4, 0, 0.3], el: 0.6 }, R: { sh: [-0.3, 0, -0.3], el: 0.6 } } });
  getUp.face = faceBase(q, 1, { pupil: 0.26, browUp: 0.8, mouth: 0.2 });
  const up = standP(KD, sx, T1, 71.5, N, { head: [-0.3, 0, 0], neck: [-0.1, 0, 0], arms: { L: { sh: [0.05, 0, 0.2], el: 0.3, curl: 0.7 }, R: { sh: [0.05, 0, -0.2], el: 0.3, curl: 0.7 } } });
  up.face = faceBase(q, 1, { pupil: 0.26, browUp: 0.7, browTilt: -0.3, mouth: 0.1 });
  const runA = standP(KD, sx, T1, 71.5, N, { spine: [0.35, 0, 0], head: [-0.4, 0, 0], drop: 0.05, arms: { L: { sh: [0.7, 0, 0.15], el: 1.2, curl: 0.8 }, R: { sh: [-0.9, 0, -0.15], el: 1.2, curl: 0.8 } } });
  runA.legs.R.foot = [sx + 0.08, T2 + KD.footH, 70.45];
  runA.hip = [0, KHIP - 0.1, 0.35];
  const runB = standP(KD, sx, T2, 70.4, N, { spine: [0.35, 0, 0], head: [-0.4, 0, 0], drop: 0.06, arms: { L: { sh: [-0.9, 0, 0.15], el: 1.2, curl: 0.8 }, R: { sh: [0.7, 0, -0.15], el: 1.2, curl: 0.8 } } });
  runB.legs.R.foot = [sx + 0.08, T2 + KD.footH + 0.2, 70.55];
  runB.legs.R.pitch = 0.8;
  runB.legs.L.foot = [sx - 0.08, T3 + KD.footH, 69.4];
  runB.hip = [0, KHIP - 0.49, 0.65];
  const runAir = lerpDeep(runA, runB, 0.5);
  runAir.pos = [sx, T2, 70.4]; runAir.hip = [0, KHIP + 0.2, 0.25];
  runAir.tail = [1.75, 0.3];
  runAir.legs = { L: { foot: [sx - 0.08, T2 + KD.footH + 0.25, 70.05], yaw: 0, pitch: 0.3 }, R: { foot: [sx + 0.08, T2 + KD.footH + 0.12, 70.5], yaw: 0, pitch: 0.5 } };
  runB.pos = [sx, T2, 70.4];
  const [fx, fy, fz] = KIDSPOT.fox.stand;
  const stopP = standP(KD, fx, fy, fz, N, { drop: 0.03, spine: [-0.05, 0, 0], neck: [-0.15, 0, 0], head: [-0.32, 0, 0], arms: { L: { sh: [0.15, 0, 0.25], el: 0.4, curl: 0.9 }, R: { sh: [0.15, 0, -0.25], el: 0.4, curl: 0.9 } } });
  const fStare = faceBase(q, 1, { pupil: 0.24, browUp: 0.6, browTilt: -0.4, mouth: 0.15, lidB: 0.1 });
  for (const p of [runA, runB, stopP]) p.face = fStare;
  for (const p of [getUp, up, runA, runB, stopP]) p.tail = [1.15, 0.35];
  getUp.tail = [1.7, 0.4]; up.tail = [1.4, 0.4]; runB.tail = [1.75, 0.3]; runA.tail = [1.6, 0.3];
  const scoot = merge(settled, { pos: [sx, T0, 71.98], hip: [0, SEAT + 0.03, 0], spine: [0.35, 0, 0], head: [-0.3, 0, 0], tail: [1.7, 0.4] });
  scoot.legs = { L: { foot: [sx - 0.1, T1 + KD.footH, 71.72], yaw: 0.1 }, R: { foot: [sx + 0.1, T1 + KD.footH, 71.7], yaw: -0.1 } };
  if (t < 33.5) return timeline([[28.0, settled], [28.22, scoot], [28.5, getUp], [29.0, up], [29.35, runA], [29.55, runAir], [29.75, runB], [30.15, stopP, easeOut]], q);
  // --- s15 fox face (33.5..34.5): frown -> alarm; s18 eye (40.5..42.5): the pupil shrinks
  const p = stopP;
  const alarm = smooth(invLerp(33.85, 34.05, q));
  p.head = [-0.36 - 0.05 * alarm, noise1(q * 0.8, 4) * 0.03, 0];
  p.face = faceBase(q, 1, {
    blink: q > 33.6 && q < 34.4 ? 0 : blinkAt(q, 1),
    pupil: lerp(0.3, 0.2, alarm), browUp: lerp(-0.2, 1.0, alarm), browTilt: lerp(-0.8, 0.5, alarm), tilt: lerp(-0.25, 0.15, alarm),
    lid: lerp(0.18, 0, alarm), lidB: lerp(0.25, 0, alarm), mouth: lerp(0.08, 0.75, alarm), mouthW: lerp(0.3, -0.2, alarm), look: [0, 0.35],
  });
  if (t >= 40.0 && t < 43.0) {
    const k = smooth(invLerp(40.7, 42.2, q));
    p.face = faceBase(q, 1, { blink: 0, pupil: lerp(0.34, 0.11, k), browUp: 1, tilt: 0.2, look: [0.02 * noise1(q * 6, 2), 0.3 + 0.12 * k], detail: 1, irisR: 0.62, mouth: 0.5, lidB: 0.18, refl: 0.3 + 0.7 * k, wet: 0.6 });
    p.head = [-0.36 - 0.1 * k, 0, 0];
  }
  if (t >= 43.0) p.face = fStare;
  return p;
}

function harePose(t) {
  const q = onTwos(t);
  const [sx, sy, sz] = KIDSPOT.hare.seat;
  // --- sitting hugging the knees: laughs at the fox's joke (5.4), later looks up and talks (s06)
  if (t < 21.0) {
    const laugh = track([[6.05, 0], [6.25, 1], [7.0, 1], [7.4, 0]], q);
    const gest = track([[4.3, 0], [4.5, 1], [5.15, 1], [5.45, 0]], q);          // points at the ripples, talking
    const bounce = laugh * Math.abs(Math.sin(q * 14)) * 0.02;
    const lookUp = track([[0, 0], [12.4, 0], [12.8, 0.45], [13.1, 0.86], [13.5, 1], [16, 1]], q);   // eases out into s06
    const p = sitKneesP(KD, sx, sy, sz, N, {
      spine: [0.32 - laugh * 0.3 - lookUp * 0.08 + breathe(q, 2), -0.1 * laugh, 0],
      neck: [-0.05 - laugh * 0.15 - lookUp * 0.15, -0.25 + 0.25 * lookUp, 0],
      head: [-0.1 - laugh * 0.25 - lookUp * 0.35, -0.3 * (1 - lookUp) + 0.1 * laugh, -0.1 * laugh],
    });
    p.hip = [p.hip[0], p.hip[1] + bounce, p.hip[2]];
    if (gest > 0.001) {
      const Wh = xf(sx, sz, N);
      const hr = [lerp(-0.035, -0.19, gest), sy + lerp(0.24, 0.44, gest) + 0.035 * gest * Math.sin(q * 9), lerp(0.26, 0.44, gest) + 0.03 * gest * Math.sin(q * 7)];
      p.arms = { L: p.arms.L, R: { target: Wh(...hr), pole: Wh(-0.6, sy + 0.2, -0.4), curl: lerp(0.6, 0.12, gest) } };
      p.spine = [p.spine[0] - 0.14 * gest, p.spine[1] - 0.12 * gest, 0];
      p.head = [p.head[0] + 0.12 * gest, p.head[1] + 0.25 * gest, p.head[2]];
    }
    const talking = (q > 13.3 && q < 15.3) ? talk(q, 7, 0.85) : (q > 4.4 && q < 5.25 ? talk(q, 5, 0.8) : 0);
    p.face = faceBase(q, 2, {
      blink: laugh > 0.5 ? 0 : blinkAt(q, 2), lid: laugh, lidB: laugh * 0.5, mouth: laugh * (0.7 + 0.3 * Math.abs(Math.sin(q * 14))) + talking * 0.6,
      browUp: laugh * 0.4 + lookUp * 0.3 + gest * 0.5, browTilt: lookUp * 0.5, tilt: lookUp * 0.25, look: [-0.25 * (1 - lookUp) * (1 - gest), 0.15 + 0.3 * lookUp - 0.25 * gest], pupil: 0.4,
    });
    p.ears = [-0.1 * laugh + 0.06 * Math.sin(q * 2.3), 0.05 * Math.sin(q * 1.6)];
    p.earTip = 0.35 + 0.15 * Math.sin(q * 2.1) + 0.2 * laugh; p.earTipZ = 0.05 * Math.sin(q * 1.3);
    return p;
  }
  const st0 = standP(KD, sx, T0, 72.5, N, { head: [-0.3, 0, 0], neck: [-0.1, 0, 0], arms: { L: { sh: [-0.2, 0, 0.12], el: 1.4, curl: 0.8 }, R: { sh: [-0.2, 0, -0.12], el: 1.4, curl: 0.8 } } });
  st0.face = faceBase(q, 2, { pupil: 0.3, browUp: 0.7, browTilt: 0.5, mouth: 0.2 });
  st0.earTip = 0.2;
  if (t < 23.5) {
    const sit = sitKneesP(KD, sx, sy, sz, N, {}); sit.face = faceBase(q, 2);
    if (t < 22.0) return timeline([[21.0, sit], [21.8, st0, easeOut]], q);
    return st0;
  }
  // startle: stumbles forward and tumbles down one tread onto hands and knees on tread 1
  const lt = t - 23.5;
  const W = xf(sx, 72.5, N);
  const lurch = standP(KD, sx, T0, 72.5, N, { drop: 0.04, spine: [0.5, 0, -0.1], head: [-0.2, 0, 0], hz: 0.1,
    arms: { L: { sh: [-1.3, 0, 0.6], el: 0.3, curl: 0 }, R: { sh: [-1.5, 0, -0.5], el: 0.3, curl: 0 } } });
  lurch.legs.R.foot = W(-0.08, T0 + KD.footH + 0.1, 0.26);
  lurch.face = faceBase(q, 2, { blink: 0, pupil: 0.22, browUp: 1, mouth: 0.7, tilt: 0.3 });
  const kneel = kneelP(KD, sx, T1, 71.5, N);
  kneel.face = faceBase(q, 2, { blink: 0, pupil: 0.24, lid: 0.15, browUp: 0.8, browTilt: 0.8, mouth: 0.45, tilt: 0.4 });
  kneel.earTip = 0.9;
  const air = lerpDeep(lurch, kneel, 0.5);
  air.pos = [sx, T0, 72.1]; air.hip = [0, KHIP - 0.02, 0.3];
  air.spine = [0.8, 0, 0.1];
  air.legs = { L: { foot: W(0.08, T0 + KD.footH + 0.16, 0.12), yaw: 0.1, pitch: 0.6 }, R: { foot: W(-0.08, T1 + KD.footH + 0.22, 0.78), yaw: -0.1, pitch: 0.4 } };
  const kneelLook = merge(kneel, { head: [-0.25, 0.1, 0.1] });
  if (t < 28.0) return timeline([[0, st0], [0.12, lurch, easeOut], [0.3, air], [0.5, kneel, easeIn], [0.75, kneelLook]], onTwos(lt));
  // s13: gets up, points at the steam
  const [hx, hy, hz] = KIDSPOT.hare.stand;
  const up = standP(KD, hx, hy, hz, N, { head: [-0.3, 0.1, 0], neck: [-0.1, 0, 0], arms: { L: { sh: [0.05, 0, 0.15], el: 0.4, curl: 0.6 }, R: { sh: [0.1, 0, -0.15], el: 0.5, curl: 0.6 } } });
  up.face = faceBase(q, 2, { pupil: 0.26, browUp: 0.7, browTilt: 0.6, mouth: 0.2, tilt: 0.3 });
  const point = merge(up, { arms: { R: { sh: [-1.5, 0.1, -0.25], el: 0.12, curl: 0.3 } }, head: [-0.38, -0.05, 0] });
  point.face = faceBase(q, 2, { pupil: 0.24, browUp: 0.9, browTilt: 0.7, mouth: talk(q, 9, 0.8), tilt: 0.3, look: [0, 0.3] });
  if (t < 33.5) return timeline([[28.0, kneelLook], [28.7, up], [29.6, point], [31, point]], q);
  // after: stands staring, hands at the chest; s31 hare eyes (74.5..77.5): wet eyes, whispering
  const fear = merge(up, { arms: { L: { sh: [-0.5, 0, 0.1], el: 1.9, curl: 0.9 }, R: { sh: [-0.45, 0, -0.05], el: 1.9, curl: 0.9 } }, spine: [0.05, 0, 0], head: [-0.38, 0, 0.04] });
  const wet = smooth(invLerp(74.6, 75.6, q));
  fear.face = faceBase(q, 2, {
    blink: q > 74.5 ? (q > 76.4 && q < 76.62 ? 1 - Math.abs(q - 76.51) / 0.11 : 0) : blinkAt(q, 2),
    pupil: 0.24, browUp: 0.9, browTilt: 0.9, tilt: 0.45, lidB: 0.12, wet: q > 74.4 ? wet : 0,
    mouth: q > 75.4 ? talk(q, 11, 0.32) : 0.08, look: [0.03 * noise1(q * 5, 3), 0.32],
  });
  fear.ears = [0.25, 0.25]; fear.earTip = 1.0;
  if (t >= 74.4) {
    // s31 (74.5..77.5): shock and grief. Wide eyes, small trembling pupils (on twos), worried brows,
    // a small open trembling mouth with the corners down, tears welling, one rolling down the cheek from 75.5
    const tr = (n) => noise1(q * 11.0, n);
    const w2 = 0.55 + 0.45 * smooth(invLerp(74.5, 75.4, q));
    fear.face = faceBase(q, 2, {
      blink: q > 77.0 && q < 77.22 ? 1 - Math.abs(q - 77.11) / 0.11 : 0,
      pupil: 0.13 + 0.014 * tr(1), look: [0.028 * tr(3), 0.3 + 0.022 * tr(4)],
      browUp: 1.0, browTilt: 1.0, tilt: 0.12, lid: 0, lidB: 0.1 + 0.12 * w2, wet: w2,
      mouth: 0.2 + 0.06 * Math.abs(tr(5)) + (q > 75.4 ? talk(q, 11, 0.12) : 0), smile: -1.15, ymouthK: 0, narrow: 1,
      tear: smooth(invLerp(75.5, 77.3, q)), lens: 0.6,
    });
    fear.ears = [0.3, 0.3]; fear.earTip = 1.1;
    fear.head = [-0.38 + 0.012 * tr(6), 0.01 * tr(7), 0.04];
  }
  return fear;
}

function lynxPose(t) {
  const q = onTwos(t);
  const [sx, sy, sz] = KIDSPOT.lynx.seat;
  const W = xf(sx, sz, N);
  if (t < 21.0) {
    const lookBack = track([[5.6, 0], [6.1, 1], [7.0, 1], [7.6, 0]], q);
    const yawn = track([[3.7, 0], [4.15, 1], [4.85, 1], [5.3, 0]], q);
    const sw = Math.sin(q * 2.6) * 0.2 * (t > 3 && t < 12 ? 1 : 0.3);           // feet swinging over the tread
    const p = sitP(KD, sx, sy, sz, N, {
      phiL: 0.12 + sw, phiR: 0.2 - sw, spine: [0.12 + breathe(q, 3) - 0.3 * yawn, -0.4 * lookBack, 0], neck: [-0.1 * yawn, -0.3 * lookBack, 0], head: [-0.05 + 0.15 * lookBack - 0.3 * yawn, -0.5 * lookBack, 0.12 * lookBack],
      arms: { L: { target: W(lerp(0.06, 0.13, yawn), sy + lerp(0.17, 0.8, yawn), lerp(0.17, -0.04, yawn)), pole: W(0.5, sy + lerp(0.2, 0.5, yawn), -0.3), curl: lerp(0.5, 0.9, yawn) },
              R: { target: W(lerp(-0.05, -0.13, yawn), sy + lerp(0.18, 0.8, yawn), lerp(0.15, -0.04, yawn)), pole: W(-0.5, sy + lerp(0.2, 0.5, yawn), -0.3), curl: lerp(0.5, 0.9, yawn) } },
    });
    p.face = faceBase(q, 3, { blink: Math.max(blinkAt(q, 3), yawn * 0.92), lid: 0.25, lidB: 0.1 + 0.15 * lookBack, mouthW: 0.3 * lookBack - 0.2 * yawn, mouth: 0.02 + 0.95 * yawn, look: [0.35 * lookBack, 0.1 * lookBack] });
    p.ears = [0.04 * Math.sin(q * 1.1) - 0.25 * yawn, 0];
    p.tail = [0.9, 0.2];
    return p;
  }
  const st0 = standP(KD, sx, T1, 71.5, N, { head: [-0.25, 0, 0], arms: { L: { sh: [0.05, 0, 0.12], el: 0.3 }, R: { sh: [0.05, 0, -0.12], el: 0.3 } } });
  st0.face = faceBase(q, 3, { pupil: 0.24, browUp: 0.4, lid: 0.05 });
  if (t < 23.5) {
    const sit = sitP(KD, sx, sy, sz, N, {}); sit.face = faceBase(q, 3); sit.tail = [0.9, 0.2];
    if (t < 22.0) return timeline([[21.0, sit], [21.8, st0, easeOut]], q);
    return st0;
  }
  // startle: drops into a crouch, one hand on the tread
  const lt = t - 23.5;
  const Wc = xf(sx, 71.5, N + 0.25);
  const crouch = standP(KD, sx, T1, 71.5, N + 0.25, { drop: 0.17, wide: 0.05, spine: [0.55, 0.2, 0], neck: [-0.4, 0, 0], head: [-0.3, -0.2, 0], hz: -0.04, fl: 0.06, fr: -0.08,
    arms: { L: { target: Wc(0.2, T1 + 0.05, 0.22), pole: Wc(0.6, T1 + 0.4, -0.2), wr: [-1.0, 0, 0], curl: 0.15 }, R: { sh: [-0.6, 0, -0.8], el: 0.9, curl: 0.4 } } });
  crouch.face = faceBase(q, 3, { blink: 0, pupil: 0.2, browUp: 0.6, browTilt: -0.3, mouth: 0.25 });
  crouch.tail = [0.3, 0];
  if (t < 28.0) return timeline([[0, st0], [0.25, crouch, easeOut]], onTwos(lt));
  const up = standP(KD, sx + 0.1, T1, 71.45, N + 0.05, { head: [-0.32, 0, 0], neck: [-0.08, 0, 0], arms: { L: { sh: [0.05, 0, 0.12], el: 0.25, curl: 0.7 }, R: { sh: [0.05, 0, -0.12], el: 0.25, curl: 0.7 } } });
  up.face = faceBase(q, 3, { pupil: 0.24, browUp: 0.5, browTilt: -0.2, lid: 0.05, mouth: 0.05 });
  const [lx, ly, lz] = KIDSPOT.lynx.stand;
  const step = standP(KD, lx, ly, lz, N - 0.1, { head: [-0.36, 0, 0], arms: up.arms });
  step.face = up.face;
  if (t < 33.5) return timeline([[28.2, crouch], [28.9, up], [30.4, up], [30.9, step]], q);
  return step;
}

export function kidsPose(t, st) {
  if (st.set !== 'steps' && st.set !== 'eye') return { fox: { visible: false }, hare: { visible: false }, lynx: { visible: false } };
  return { fox: foxPose(t), hare: harePose(t), lynx: lynxPose(t) };
}

// ---------------------------------------------------------------- s04 badger mother + piglet, s07 goat mother + baby
export const ALLEY = [-62, 0, -20];
export const ROOF = [-70, 10.5, -64];
export function castPose(t, st) {
  const q = onTwos(t);
  const out = { badger: { visible: false }, piglet: { visible: false }, goat: { visible: false }, baby: { visible: false } };
  if (st.sid === 's04') {
    const lt = q - 7.5;
    const AD = DIMS.adult, TD = DIMS.tot;
    const [mx, , mz] = ALLEY;
    const yaw = PI;            // mother faces north, the piglet runs south into her arms
    const crouchM = standP(AD, mx, 0, mz, yaw, { drop: 0.3, wide: 0.06, fl: 0.12, fr: -0.12, spine: [0.45, 0, 0], neck: [-0.25, 0, 0], head: [-0.15, 0, 0], hz: -0.08,
      arms: { L: { sh: [-0.9, 0, 0.75], el: 0.5, curl: 0.2 }, R: { sh: [-0.9, 0, -0.75], el: 0.5, curl: 0.2 } } });
    crouchM.face = faceBase(q, 5, { lidB: 0.45, mouth: 0.3, mouthW: 0.4, browUp: 0.3, look: [0, -0.2] });
    const catchM = merge(crouchM, { spine: [0.3, 0, 0], arms: { L: { sh: [-1.0, 0, 0.25], el: 1.5, curl: 0.5 }, R: { sh: [-1.0, 0, -0.25], el: 1.5, curl: 0.5 } } });
    catchM.face = faceBase(q, 5, { lid: 0.8, lidB: 0.5, mouth: 0.35, mouthW: 0.5, browUp: 0.2 });
    const liftM = standP(AD, mx, 0, mz, yaw, { drop: 0.03, fl: 0.08, fr: -0.08, spine: [-0.12, 0.15, 0.05], neck: [0.05, 0, 0], head: [0.2, 0.3, 0.2],
      arms: { L: { sh: [-1.0, -1.0, 0.05], el: 1.25, curl: 0.6 }, R: { sh: [-0.95, 1.0, -0.05], el: 1.3, curl: 0.6 } } });   // arms wrapped round the piglet's back
    liftM.face = faceBase(q, 5, { lid: 1, lidB: 0.4, mouth: 0.15, mouthW: 0.5, browUp: 0.3, browTilt: 0.4 });
    out.badger = timeline([[0, crouchM], [1.05, crouchM], [1.3, catchM, easeOut], [2.2, liftM], [2.6, merge(liftM, { spine: [-0.14, 0.2, 0.06] })]], lt);
    if (lt < 1.15) {
      const z0 = mz - 4.4, z1 = mz - 0.5;
      const u = lt / 1.15;
      const z = lerp(z0, z1, u);
      out.piglet = runP(TD, mx + 0.02, 0, z, 0, z - z0, 0.5, { arms: 'reach', lean: 0.25 });
      out.piglet.face = faceBase(q, 6, { lidB: 0.5, mouth: 0.6, mouthW: 0.4, browUp: 0.5, look: [0, 0.2] });
      out.piglet.ears = [0.2 * Math.sin(q * 20), 0];
    } else {
      out.piglet = { attach: 'badger', held: smooth(invLerp(1.15, 1.6, lt)), face: faceBase(q, 6, { lid: 1, lidB: 0.6, mouth: 0.3, mouthW: 0.5 }) };
    }
  }
  if (st.sid === 's07') {
    const lt = q - 15.5;
    const [gx, gy, gz] = ROOF;
    const yaw = PI;          // she faces north: the line runs east-west in front of her, the wall far beyond
    const reach = (u) => standP(DIMS.adult, gx, gy, gz, yaw, { fl: 0.1, fr: -0.05, spine: [-0.12 + 0.03 * Math.sin(lt * 2), -0.1, 0], neck: [-0.15, 0, 0], head: [-0.25, 0.1 * Math.sin(lt * 0.8), 0],
      arms: { L: { sh: [-2.5 + 0.08 * u, 0.2, 0.15], el: 0.35, curl: 0.7 }, R: { sh: [-2.45 - 0.08 * u, -0.2, -0.2], el: 0.35, curl: 0.7 } } });
    const p = timeline([[0, reach(0)], [1.2, reach(1)], [2.5, reach(0.3)]], lt);
    p.face = faceBase(q, 8, { lid: 0.2, lidB: 0.2, look: [0, 0.4], mouth: 0.05, mouthW: 0.3 });
    out.goat = p;
    out.baby = { attach: 'goat', face: faceBase(q, 9, { look: [0.4 * Math.sin(lt * 1.3), 0.1], mouth: 0.1 }), headTurn: 0.5 * Math.sin(lt * 1.3) };
  }
  return out;
}
export { KHIP, SEAT };
