import { noise1, smooth, invLerp, lerp } from '../util.js';

// FOLK cameras + looks. lt = seconds into the shot, d = shot length, t = film time.
// Kids on the canal steps (layout: STEPS x -48..-32, zTop 73, tread 0.5 rise, 1.0 run), facing north (-Z).
const L3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
// handheld drift (small, slow) and shake (fast, decaying)
const drift = (t, a = 0.02, s = 0) => [noise1(t * 0.6, 11 + s) * a, noise1(t * 0.5, 23 + s) * a * 0.7, noise1(t * 0.55, 37 + s) * a * 0.5];
const shake = (t, a, s = 0) => [noise1(t * 22, 3 + s) * a, noise1(t * 25, 5 + s) * a, noise1(t * 20, 7 + s) * a * 0.5];
const add = (p, ...ds) => ds.reduce((o, d) => [o[0] + d[0], o[1] + d[1], o[2] + d[2]], p);

import { A_s06, A_s15, A_s18, A_s31 } from '../folk-anchors.js';
// measured anchors (src/folk-anchors.js, regenerate with out/folk_anchors.mjs after changing poses):
// sample the table at lt, averaged over +-w seconds so the camera does not step with the on-twos animation
const track = (tab, lt, w = 0.25) => {
  const at = (x) => {
    const u = Math.max(tab[0][0], Math.min(tab[tab.length - 1][0], x));
    let i = 0; while (i < tab.length - 2 && tab[i + 1][0] < u) i++;
    const a = tab[i], b = tab[i + 1] ?? a, k = b[0] > a[0] ? (u - a[0]) / (b[0] - a[0]) : 0;
    return a.map((v, j) => v + (b[j] - v) * k);
  };
  const o = [0, 0, 0, 0, 0, 0, 0];
  for (let s = -2; s <= 2; s++) { const r = at(lt + (s / 2) * w); for (let j = 0; j < 7; j++) o[j] += r[j] / 5; }
  // the camera axis uses the head's facing at mid-shot (fixed), so head turns do not swing the camera
  const m = tab[tab.length >> 1], n = [m[4], m[5], m[6]], l = Math.hypot(...n);
  return { p: [o[1], o[2], o[3]], n: n.map((v) => v / l) };
};
// camera on the (horizontal part of the) face direction at distance d, raised by 'up', slid sideways by 'side'
const faceCam = (a, n, d, up = 0, side = 0) => {
  const h = Math.hypot(n[0], n[2]), fx = n[0] / h, fz = n[2] / h;
  return [a[0] + fx * d - fz * side, a[1] + up, a[2] + fz * d + fx * side];
};
// camera around the head: 'yaw' turns off the face axis (radians, + = toward the character's left), 'elev' above horizontal
const orbit = (a, n, d, yaw = 0, elev = 0) => {
  const b = Math.atan2(n[0], n[2]) + yaw;
  return [a[0] + Math.sin(b) * Math.cos(elev) * d, a[1] + Math.sin(elev) * d, a[2] + Math.cos(b) * Math.cos(elev) * d];
};

const SUN_KEY = [-0.35, 0.56, 0.75];
const FRONT_KEY = [-0.45, 0.62, -0.64];      // anime cheat: light the faces that look north

export const CAMS = {
  s01: (lt, d, t) => {
    const u = smooth(lt / d);
    return { pos: add(L3([-34.2, 0.55, 72.6], [-34.6, 0.45, 72.3], u), drift(t, 0.01)), look: L3([-35.6, -1.05, 70.4], [-35.9, -1.1, 70.1], u), fov: 38 };
  },
  s03: (lt, d, t) => {
    const u = smooth(lt / d);
    return { pos: add(L3([-41.9, 1.45, 68.4], [-41.6, 1.3, 68.75], u), drift(t, 0.02)), look: add(L3([-40.35, -0.42, 72.1], [-40.3, -0.4, 72.1], u), drift(t + 3, 0.012)), fov: 36 };
  },
  s04: (lt, d, t) => {
    const u = smooth(lt / d);
    // 3/4 from the north-east (r04): the piglet runs in from the left, the mother's face stays clear of it
    return { pos: add(L3([-60.7, 0.9, -23.2], [-60.75, 1.0, -22.9], u), drift(t, 0.02)), look: L3([-62.15, 0.72, -20.6], [-62.15, 0.98, -20.4], u), fov: 40 };
  },
  s06: (lt, d, t) => {
    const u = smooth(lt / d), a = track(A_s06, lt);
    return { pos: add(orbit(a.p, a.n, lerp(0.86, 0.76, u), 0.12, 0.34), drift(t, 0.01)), look: [a.p[0], a.p[1] + 0.01, a.p[2]], fov: 31, near: 0.05 };
  },
  s07: (lt, d, t) => {
    const u = smooth(lt / d);
    return { pos: add(L3([-68.1, 12.25, -60.2], [-68.35, 12.2, -60.5], u), drift(t, 0.02)), look: L3([-70.25, 11.95, -65.5], [-70.3, 12.0, -65.5], u), fov: 40 };
  },
  s11: (lt, d, t) => {
    const k = Math.exp(-lt * 3.2);
    return { pos: add([-37.9, 1.3, 73.95], shake(t, 0.07 * k), drift(t, 0.02)), look: add([-40.3, -0.82, 71.8], shake(t + 1, 0.09 * k)), fov: 40, roll: noise1(t * 18, 9) * 2.5 * k };
  },
  s13: (lt, d, t) => {
    const u = smooth(lt / d);
    // low from behind the kids on the quay, wide lens tilted up: chest-up kids in the lower frame, the rooftops across
    // the canal and the sky over the gate (x~0, the steam column) above them; slow push, easing the tilt down to keep the fox as he runs down the treads
    return { pos: add(L3([-40.4, 0.45, 74.0], [-40.3, 0.4, 73.75], u), drift(t, 0.012)), look: L3([-39.88, 2.01, 64.14], [-39.79, 1.45, 63.82], u), fov: 58 };
  },
  s14: (lt, d, t) => {
    const u = smooth(lt / d);
    return { pos: add(L3([0.6, 1.42, -128.5], [0.45, 1.44, -128.35], u), drift(t, 0.01)), look: L3([-0.45, 1.8, -126.2], [-0.5, 1.82, -126.2], u), fov: 32 };
  },
  s15: (lt, d, t) => {
    const k = smooth(invLerp(0.3, 0.55, lt)), a = track(A_s15, lt, 0.15);
    // slightly below eye level, looking up into the face (the fox looks up at the wall)
    // 3/4 profile from the fox's right and above the tilted-up face: the muzzle line reads, he looks up past camera; push on the alarm
    return { pos: add(orbit(a.p, a.n, lerp(0.8, 0.66, k), 0.82, 0.4), drift(t, 0.006), shake(t, 0.004 * k)), look: [a.p[0], a.p[1] + 0.02, a.p[2]], fov: 32, near: 0.05 };
  },
  s16: (lt, d, t) => {
    const u = smooth(lt / d);
    // crowd backs in the lower third, gate towers mid frame, slow tilt up the steam column behind the gate (to ~300 m)
    return { pos: add(L3([1.3, 1.2, -100.2], [1.2, 1.45, -100.8], u), drift(t, 0.02)), look: L3([-1.0, 36.5, -300], [-1.0, 99, -300], u), fov: 62 };
  },
  s18: (lt, d, t) => {
    const u = smooth(lt / d), a = track(A_s18, lt, 0.3);
    // straight down the eye's own axis (the eye looks up), slow push-in
    const dd = lerp(0.29, 0.245, u), n = a.n;
    return { pos: add([a.p[0] + n[0] * dd, a.p[1] + n[1] * dd, a.p[2] + n[2] * dd], drift(t, 0.002)), look: a.p, fov: 28, near: 0.02 };
  },
  s28: (lt, d, t) => {
    const u = smooth(lt / d);
    return { pos: add(L3([3.4, 0.95, -192.4], [3.3, 0.9, -192.0], u), shake(t, 0.025), drift(t, 0.03)), look: L3([-2.2, 1.8, -220], [-2.0, 1.6, -220], u), fov: 44 };
  },
  s31: (lt, d, t) => {
    const u = smooth(lt / d), a = track(A_s31, lt);
    // tight on the eyes, from the front and a touch above, slow push-in with a faint tremble (r59)
    return { pos: add(orbit(a.p, a.n, lerp(0.62, 0.44, u), 0.06, 0.2), drift(t, 0.004), shake(t, 0.0025)), look: [a.p[0], a.p[1] + 0.03, a.p[2]], fov: 30, near: 0.05 };
  },
};

const sh = (c, r = 3, depth = 14) => ({ center: c, radius: r, depth });
export const LOOKS = {
  s01: () => ({ k: 1, key: SUN_KEY }),
  s03: () => ({ k: 1, key: [-0.4, 0.62, -0.68], shadow: sh([-40.3, -0.6, 71.9], 2.8) }),
  s04: () => ({ k: 1, key: [0.35, 0.6, -0.72], shadow: sh([-62, 0.6, -20.2], 2.5) }),
  s06: () => ({ k: 1, key: FRONT_KEY }),
  s07: () => ({ k: 1, key: [-0.3, 0.6, 0.74], shadow: sh([-70, 11.2, -64.2], 3.2) }),
  s11: () => ({ k: 1, key: SUN_KEY, shadow: sh([-40.3, -0.8, 71.9], 2.8) }),
  s13: () => ({ k: 1, key: [-0.5, 0.55, -0.67], shadow: sh([-40.2, -1.0, 71.0], 3.2) }),
  s14: () => ({ k: 1, key: [0.3, 0.6, -0.74], shadow: sh([0, 1.0, -122], 9, 30) }),
  s15: () => ({ k: 1, key: FRONT_KEY }),
  s16: () => ({ k: 1, key: SUN_KEY, shadow: sh([0, 1.0, -114], 16, 40) }),
  s18: () => ({ k: 1, key: FRONT_KEY }),
  s28: (lt) => ({ k: 0.62 - 0.05 * lt, key: [0.3, 0.6, 0.74], shadow: sh([0, 1.0, -225], 18, 40) }),
  s31: (lt, d) => ({ k: 1, key: FRONT_KEY, fade: smooth(invLerp(d - 1.4, d, lt)), fadeColor: '#000000' }),
};
