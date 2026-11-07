import { CUES } from './shots.js';
import { track, clamp, lerp, smooth, smoother, easeIn, easeOut, easeInOut, noise1, onTwos } from './util.js';

// COLOSSUS dept: the giant's whole performance as a pure function of film time.
// All numbers are in BASE units: 1 = 10 m, origin at COLOSSUS.pos (0,0,-334), +Z toward the town.
// Wall in base units near x = 0: outer face z = 2.0, inner face z = 3.4, walkway top y = 5.0.
// The giant is drawn on twos (onTwos) like every character; impacts land on their exact cue frame.

// The grip sits west of the gate's west tower (towers at x = ±17, r 8): hand centre x = -31 m.
export const GRIP = { x: -3.3, wrist: [-3.3, 5.6, 1.9] };   // wrist y/z are calibrated against the wall at load (colossus.js)

const mixA = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);

// body keys: pelvis pos, pelvis/waist/chest/neck/head euler (deg)
const CROUCH = { root: -1.25, pelvis: [0, 1.35, -1.4], pelvisR: [34, 0, 0], waistR: [16, 0, 0], chestR: [14, 0, 0], neckR: [12, 0, 0], headR: [22, 0, 0] };
const STAND = { root: 0, pelvis: [0, 4.02, -0.26], pelvisR: [5, 0, 0], waistR: [3, 0, 0], chestR: [2, 0, 0], neckR: [4, 0, 0], headR: [12, 0, 0] };

export const VISOR_IGNITE = 47.2;   // s20: the slit clears the parapet here

// The rise is authored as a crown-height curve (m) and mapped back to the blend r through a measured table,
// so the head moves at a steady, heavy pace (≤ ~13 m/s) instead of whipping up while the chest unfolds.
const CROWN_R = [[41.9, 0], [45.1, 0.06], [46.8, 0.098], [49.5, 0.132], [53.1, 0.19], [58.3, 0.264], [63.6, 0.34], [68.4, 0.413], [72.7, 0.483], [76.5, 0.549], [79.8, 0.611], [82.8, 0.669], [85.4, 0.723], [88.3, 0.789], [90.7, 0.834], [92.6, 0.898], [94.3, 0.949], [95.5, 0.984], [96, 1]];
export function crownAt(t) {
  if (t <= CUES.rise) return 41.9;
  if (t <= CUES.rise + 3) return lerp(41.9, 45.1, easeInOut((t - CUES.rise) / 3, 2));
  if (t <= 45.3) return lerp(45.1, 54, easeIn((t - CUES.rise - 3) / (45.3 - CUES.rise - 3), 1.9));
  if (t >= CUES.headUp) return 96;
  // cubic Hermite: arrives at 54 m with the same speed (≈9.4 m/s), eases to rest at full height
  const T = CUES.headUp - 45.3, u = (t - 45.3) / T, v0 = 1.9 * 8.9 / (45.3 - CUES.rise - 3);
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * 54 + (u3 - 2 * u2 + u) * T * v0 + (-2 * u3 + 3 * u2) * 96;
}
export function riseAt(t) {
  const c = crownAt(t);
  for (let i = 1; i < CROWN_R.length; i++) {
    const [c1, r1] = CROWN_R[i], [c0, r0] = CROWN_R[i - 1];
    if (c <= c1) return r0 + (r1 - r0) * clamp((c - c0) / (c1 - c0));
  }
  return 1;
}

export function poseAt(t0) {
  const t = onTwos(t0);
  const r = riseAt(t);
  const P = {};
  P.r = r;
  P.root = lerp(CROUCH.root, STAND.root, smooth(r));
  for (const key of ['pelvis', 'pelvisR', 'waistR', 'chestR', 'neckR', 'headR']) P[key] = mixA(CROUCH[key], STAND[key], r);
  // it only steps its weight toward the wall once the head is clear above it (the mask never grinds the stone)
  P.pelvis[2] = lerp(CROUCH.pelvis[2], STAND.pelvis[2], smooth((r - 0.3) / 0.7));
  // breathing mass: a slow heave, more while crouched and steaming
  const br = Math.sin(t * 1.3) * (0.6 + 0.6 * (1 - r));
  P.chestR[0] += br * 0.8; P.pelvis[1] += br * 0.008;
  // the stare: head sinks a little toward the square, a slight menacing tilt
  const stare = smooth((t - 52) / 3);
  P.headR[0] += 6 * stare; P.headR[2] += -4 * stare; P.neckR[0] += 2 * stare;
  // a tiny overshoot when it arrives at full height, then settles
  const arr = t - CUES.headUp;
  if (arr > 0) { const s = Math.exp(-arr * 1.6) * Math.sin(arr * 2.4) * 0.6; P.chestR[0] -= s * 1.5; P.headR[0] -= s * 2; }

  // ---- weight shift, kick, recovery
  const shift = track([[CUES.legLift, 0], [CUES.legLift + 1.6, 1], [CUES.kick - 0.2, 1], [CUES.kick + 2.5, 1], [CUES.kick + 4.5, 0.35]], t);
  P.pelvis[0] += 0.28 * shift; P.pelvisR[2] += 3.5 * shift; P.chestR[2] -= 3 * shift;
  const wind = track([[CUES.legLift + 0.6, 0], [CUES.kick - 1.4, 1, easeInOut], [CUES.kick, 0, easeIn]], t);
  const thrust = track([[CUES.kick - 0.6, 0], [CUES.kick, 1, easeIn], [CUES.kick + 0.4, 1.15, easeOut], [CUES.kick + 1.3, 1], [CUES.kick + 3, 0, easeInOut]], t);
  P.pelvisR[0] += 6 * wind - 8 * thrust; P.chestR[0] += 7 * wind + 4 * thrust; P.headR[0] += -3 * wind + 3 * thrust;
  P.pelvis[2] += -0.18 * wind + 0.12 * thrust; P.pelvis[1] -= 0.12 * thrust + 0.08 * wind;

  // ---- breach: it stiffens, light pours out of it, it sags as it dissolves
  const br2 = clamp((t0 - CUES.breach) / 1.6);
  P.glow = smooth(clamp((t0 - CUES.breach) / 0.8));
  P.dissolve = smooth(clamp((t0 - CUES.breach - 0.5) / 1.1));
  P.sink = easeIn(br2, 2) * 0.6;
  P.chestR[0] += 6 * br2; P.headR[0] += 8 * br2;
  P.pelvis[1] -= P.sink * 0.9; P.pelvisR[0] -= 6 * P.sink;   // it sags: knees buckle under it as it burns
  P.visible = t0 >= CUES.steam && t0 < CUES.breach + 1.7;

  // ---- glow levels
  // the visor ignites the moment the slit clears the parapet (VISOR_IGNITE): a hard flash, then a steady burn
  P.visor = track([[CUES.steam, 0.12], [CUES.rise, 0.18], [VISOR_IGNITE - 0.12, 0.25], [VISOR_IGNITE, 2.4, (u) => easeIn(u, 2)], [VISOR_IGNITE + 0.6, 1.25], [CUES.headUp, 1.0], [CUES.headUp + 1.2, 0.85], [CUES.kick, 1.0], [CUES.breach, 1.2]], t0);
  P.core = 0.25 + 0.5 * smooth((t0 - CUES.headUp + 2) / 3) + 0.6 * P.glow;
  P.vent = 0.3 + 0.25 * Math.max(0, noise1(t0 * 1.7, 3)) + 0.8 * P.glow;

  // ---- feet (base units): planted until the kick
  const AY = 0.69 + 0.0765;   // ankle height: sole flat on the ground (y 0)
  P.footL = { ankle: [0.84 + 0.0, AY + 0.0158, -0.62], toe: [0.08, 0, 1], up: [0, 1, 0] };
  const standR = [-0.84, AY, -0.62];
  const afterR = [-0.4, AY, -0.3];
  const back = [-0.5, 2.05, -1.8];
  const contact = [-0.04, 1.0, 0.24];          // toe at the outer face (z 2.0) exactly at CUES.kick
  const deep = [-0.04, 0.98, 0.9];
  let ankR, toeR, upR;
  const k = t;
  if (k < CUES.legLift + 0.6) { ankR = standR; toeR = [-0.06, 0, 1]; upR = [0, 1, 0]; }
  else if (k < CUES.kick - 1.4) {
    const u = easeInOut((k - CUES.legLift - 0.6) / (CUES.kick - 1.4 - CUES.legLift - 0.6), 2);
    const lift = Math.sin(u * Math.PI * 0.5);
    ankR = [lerp(standR[0], back[0], u), lerp(standR[1], back[1], lift), lerp(standR[2], back[2], u)];
    toeR = mixA([-0.06, 0, 1], [0, -0.7, 0.7], u); upR = mixA([0, 1, 0], [0, 0.7, 0.7], u);
  } else if (k < CUES.kick) {
    const u = easeIn((k - (CUES.kick - 1.4)) / 1.4, 2.4);
    const mid = [-0.3, 2.0, -0.4];
    const a = mixA(back, mid, u), b2 = mixA(mid, contact, u);
    ankR = mixA(a, b2, u);
    toeR = mixA([0, -0.7, 0.7], [0, 0.05, 1], smooth(u * 1.3)); upR = mixA([0, 0.7, 0.7], [0, 1, -0.05], smooth(u * 1.3));
  } else if (k < CUES.kick + 1.3) {
    const u = easeOut((k - CUES.kick) / 0.3, 2.5);
    ankR = mixA(contact, deep, clamp(u)); toeR = [0, 0.05, 1]; upR = [0, 1, -0.05];
  } else {
    const u = easeInOut((k - CUES.kick - 1.3) / 1.9, 2);
    const lift = Math.sin(clamp(u) * Math.PI) * 0.35;
    const out = [-0.3, 1.0, -0.2];
    const a = mixA(deep, out, clamp(u * 1.6));
    ankR = mixA(a, afterR, smooth(clamp(u * 1.5 - 0.5)));
    ankR = [ankR[0], Math.max(ankR[1] + lift * (1 - u), AY), ankR[2]];
    toeR = mixA([0, 0.05, 1], [-0.1, 0, 1], clamp(u)); upR = mixA([0, 1, -0.05], [0, 1, 0], clamp(u));
  }
  P.footR = { ankle: ankR, toe: toeR, up: upR };
  // the kicking knee tracks straight through the gate instead of bowing out into the stone beside it
  const kp = smooth((t - (CUES.kick - 1.6)) / 1.0) * (1 - smooth((t - CUES.kick - 1.5) / 1.5));
  P.kneePoleR = [lerp(-1.6, -0.2, kp), 2.6, 4];

  // ---- right arm: hang → rise → slam onto the wall → grip → release → hang
  const hangR = [-2.1, 2.3 + 1.2 * r, 0.5 + P.root];
  const hangL = [2.15, 2.3 + 1.2 * r, 0.45 + P.root];
  const G = GRIP.wrist;
  let wr, palm = 0, curl = 0;   // palm: 0 hanging orientation → 1 palm down, fingers forward; curl: 0 open → 1 hooked
  const hand = CUES.hand;
  // Anime timing on twos (frames of 1/12 s). The impact is locked at hand + 1/3 (FX chips, town cracks, sound):
  //   hand-0.9 .. hand-0.05  the hand climbs to just under the outer edge, hidden behind the wall
  //   hand-0.05 .. hand+0.08 it pops up over the wall top (1 drawn frame in s17), palm turning down, fingers splaying
  //   hand+0.08 .. hand+0.25 the beat: 2 frames hanging at the apex, fingers spread wide
  //   hand+0.25              one in-between frame halfway down (smear)
  //   hand+1/3 .. +0.17      impact, held 2 frames; then the fingers dig in one by one and the wrist flexes
  const imp = hand + 1 / 3;
  const B0 = [G[0] - 0.05, 3.3, 1.3];
  const A = [G[0] - 0.06, G[1] + 0.95, G[2] - 0.45];
  let spread = 0, flex = 0;
  if (t < hand - 0.9) { wr = hangR; }
  else if (t < hand - 0.05) {
    const u = easeInOut((t - (hand - 0.9)) / 0.85, 2);
    wr = mixA(hangR, B0, u); curl = 0.1;
  } else if (t < hand + 0.08) {
    const u = easeOut((t - (hand - 0.05)) / 0.13, 1.6);
    const C = [G[0] - 0.06, G[1] + 1.45, 0.85];
    // fingers bent back (pointing up) while it climbs past the parapet, so nothing drags through the stone
    wr = mixA(mixA(B0, C, u), mixA(C, A, u), u); palm = smooth(u * 1.6); curl = lerp(-0.45, -0.15, smooth(u)); spread = u;
  } else if (t < imp - 0.1) {
    const u = (t - hand - 0.08) / (imp - 0.1 - hand - 0.08);
    wr = [A[0], A[1] + 0.06 * smooth(u), A[2]]; palm = 1; curl = -0.15; spread = 1;
  } else if (t < imp) {
    wr = mixA([A[0], A[1] + 0.06, A[2]], G, 0.55); palm = 1; curl = 0.35; spread = 0.5;
  } else if (t < CUES.legLift) {
    const a = t - imp;
    // impact hold, then a tiny rebound and settle; the wrist flexes as the weight comes onto it
    const reb = a < 0.17 ? 0 : 0.012 * Math.exp(-(a - 0.17) * 6) * Math.sin((a - 0.17) * 18);
    wr = [G[0], G[1] + reb, G[2]]; palm = 1;
    curl = a < 0.17 ? 0.86 : Math.min(1, 0.86 + 0.14 * smooth((a - 0.17) / 0.35));
    P.tighten = smooth((a - 0.25) / 1.1);
    flex = a < 0.17 ? 0 : smooth((a - 0.17) / 0.8) * (1 - 0.15 * smooth((a - 1.5) / 2));
  } else if (t < CUES.legLift + 1.0) {
    const u = easeInOut((t - CUES.legLift) / 1.0, 2);
    wr = mixA(G, [G[0], G[1] + 0.7, G[2] - 0.2], u); palm = 1; curl = 1 - smooth(u * 1.6);
  } else if (t < CUES.legLift + 2.0) {
    // pull the hand back clear of the wall before it drops
    const u = easeInOut((t - CUES.legLift - 1.0) / 1.0, 2);
    wr = mixA([G[0], G[1] + 0.7, G[2] - 0.2], [-2.9, 6.1, -0.3], u); palm = 1; curl = 0;
  } else {
    const u = easeInOut((t - CUES.legLift - 2.0) / 1.8, 2);
    wr = mixA([-2.9, 6.1, -0.3], [-2.15, 3.5, 0.2], u); palm = 1 - smooth(u); curl = 0;
  }
  P.tighten = P.tighten ?? 0;
  if (t >= CUES.legLift) P.tighten = 0;
  // the hand settles on the stone with the body's rise: the shoulder pulls it, it stays
  if (t >= CUES.legLift) flex = 0.85 * (1 - smooth((t - CUES.legLift) / 1.0));
  P.handR = { wrist: wr, palm, curl, spread, flex };
  P.handL = { wrist: hangL };
  return P;
}

// Steam-vent strength over time (FX reads anchors('vents'))
export function ventStrength(t) {
  if (t < CUES.steam || t >= CUES.breach + 1.7) return 0;
  return track([[CUES.steam, 1.0], [CUES.hand, 0.9], [CUES.rise, 1.0], [CUES.headUp, 0.8], [CUES.legLift, 0.7], [CUES.kick, 1.0], [CUES.kick + 2, 0.75], [CUES.breach, 1.3], [CUES.breach + 1.6, 1.5]], t);
}
