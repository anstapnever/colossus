import { noise1, lerp, smooth, clamp, easeInOut, track } from '../util.js';
import { CUES } from '../shots.js';

// COLOSSUS dept: cameras + looks for s17 s20 s21 s22 s23 s25 s29 s30.
// Live cameras: slow noise1 drift; heavy shake only on impacts (hand slam 38.33, kick 59.0).
const drift = (t, amp, seed, f = 0.35) => [noise1(t * f, seed) * amp, noise1(t * f, seed + 7) * amp, noise1(t * f, seed + 13) * amp];
const shake = (t, t0, amp, decay = 5, f = 22, seed = 3) => {
  const a = t - t0;
  if (a < 0) return [0, 0, 0];
  const e = amp * Math.exp(-a * decay);
  return [noise1(t * f, seed) * e, noise1(t * f, seed + 5) * e, noise1(t * f, seed + 11) * e * 0.5];
};
const add = (...vs) => vs.reduce((a, b) => a.map((x, i) => x + b[i]));

export const CAMS = {
  // THE HAND: inside, just under the wall top, close: the fingers slam down into frame and clamp
  s17: (lt, d, t) => {
    // level with the wall top, close in front of the inner face: the hand pops up over the parapet, hangs a beat,
    // and the camera is yanked down with the slam; hard shake on impact, then a slow push on the clamped fingers
    const imp = CUES.hand + 1 / 3;
    // after the impact it cranes up and round to a three-quarter view down the face, so each finger's bends read:
    // proximal flat on the walkway, middle over the edge, the distal curling in and the talon biting the stone
    const ly = track([[CUES.hand, 59], [imp - 0.09, 59.5], [imp, 51.8, (u) => u], [imp + 0.2, 51.5], [imp + 1.9, 48.3], [imp + 3, 48.0]], t);
    const cr = smooth((t - imp - 0.15) / 1.75);
    const pos = add([lerp(-24.5, -21.8, cr), lerp(48.6, 52.6, cr), lerp(-283.5, -286.2, cr) + 0.35 * Math.max(0, t - imp)], drift(t, 0.15, 1), shake(t, imp, 2.2, 4.2, 24), shake(t, imp + 0.6, 0.35, 3, 17, 5));
    const look = add([lerp(-32.6, -32.2, cr), ly, -301.5], shake(t, imp, 1.6, 4.2, 20, 9));
    const fov = track([[CUES.hand, 50], [imp, 46, (u) => u], [imp + 2.2, 38]], t);
    return { pos, look, fov, roll: -2 + noise1(t * 0.5, 4) * 0.4 + shake(t, imp, 5, 4.5, 18, 21)[0] };
  },
  // THE HEAD: low from inside near the wall; the mask rises over the wall top into the sky
  s20: (lt, d, t) => {
    // on the walkway over the gate, back from the outer parapet; the tilt follows the mask up
    const lookY = track([[45, 51], [45.8, 54], [46.6, 59], [47.3, 65], [48.1, 72], [49.1, 77], [50, 78.5]], t);
    const pos = add([7, 52.2 + 0.25 * lt, -290.5 + 0.35 * lt], drift(t, 0.12, 21));
    const look = add([-1, lookY, -316], drift(t, 0.3, 25, 0.25));
    return { pos, look, fov: 54, near: 0.2 };
  },
  // WIDE ALONG THE WALL: roofs below, the wall curving away, head and shoulders loom over it
  s21: (lt, d, t) => {
    const pos = add([150, 64 + lt * 0.4, -168 - lt * 1.2], drift(t, 0.4, 31, 0.2));
    const look = [-18, 58, -322];
    return { pos, look, fov: 44 };
  },
  // FROM THE SQUARE between the bell towers: long lens up at the face, tilting down from brow to visor
  s22: (lt, d, t) => {
    // starts wide with the two belfries framing it, then a slow push in on the mask
    const u = easeInOut(clamp(lt / d), 2.2);
    const pos = add([3, 1.8, -97], drift(t, 0.1, 41, 0.3));
    const look = add([0, lerp(52, 84, u), lerp(-260, -332, u)], drift(t, 0.2 + 0.1 * u, 43, 0.3));
    return { pos, look, fov: lerp(36, 9.5, u) };
  },
  // OUTSIDE, low in the grass: from behind, it shifts its weight and lifts its leg back
  s23: (lt, d, t) => {
    const pos = add([34, 1.6, -540], drift(t, 0.2, 51, 0.3));
    const look = add([2, 34, -330], drift(t, 0.3, 53, 0.25));
    return { pos, look, fov: 38 };
  },
  // BURST: inside the gate plaza; the gate explodes toward camera
  s25: (lt, d, t) => {
    const pos = add([3, 3.2, -262], drift(t, 0.1, 61), shake(t, CUES.kick, 1.6, 3.5, 24, 6));
    const look = add([0, 12, -305], shake(t, CUES.kick, 1.2, 3.5, 20, 12));
    return { pos, look, fov: 42, roll: shake(t, CUES.kick, 6, 3)[0] };
  },
  // BREACH: the broken gate, steam; beyond and above the wall the colossus burns and dissolves
  s29: (lt, d, t) => {
    // far enough back on the main street that the head and shoulders show over the wall and the legs through the breach
    const pos = add([1, 8, -196 + lt * 0.8], drift(t, 0.25, 71, 0.3));
    const look = add([0, 40, -320], drift(t, 0.3, 73, 0.25));
    return { pos, look, fov: 50 };
  },
  // WALKERS: outside behind them, they trudge across the fields toward the breach
  s30: (lt, d, t) => {
    const pos = add([60, 3.0, -543 + lt * 2.9], drift(t, 0.25, 81, 0.25));
    const look = add([42, 14, -400 + lt * 2], drift(t, 0.3, 83, 0.2));
    return { pos, look, fov: 42 };
  },
};

export const LOOKS = {
  // key = the character key light (anime cheat): raked from above so the brow throws the eye well into shadow
  s17: () => ({ k: 1, key: [-0.6, 0.7, 0.35] }),
  s20: () => ({ k: 1, key: [-0.8, 0.5, -0.05] }),
  s21: () => ({ k: 1, fogMul: 0.65 }),   // 220 m of haze washed the bronze toward the field colours (read as glass)
  s22: () => ({ k: 1, key: [0.78, 0.5, 0.0] }),
  s23: () => ({ k: 1, key: [0.35, 0.62, -0.7] }),
  s25: (lt) => ({ k: lerp(0.8, 0.7, lt) }),
  s29: () => ({ k: 0.6 }),
  s30: () => ({ k: 0.7, key: [0.45, 0.6, -0.66] }),
};
