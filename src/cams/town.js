import { noise1, smooth, invLerp, lerp, clamp } from '../util.js';

// Town department cameras (s02 s05 s08 s09 s10 s12 s19 s24 s26 s27).
// Each returns { pos, look, fov, roll? }. Drift with noise1; shake only on impacts.
const L3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const drift = (t, amp, seed, sp = 0.35) => [noise1(t * sp, seed) * amp, noise1(t * sp, seed + 7) * amp * 0.7, noise1(t * sp, seed + 13) * amp];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
// impact shake: decaying jitter after time t0
const shake = (t, t0, amp, dec = 3, seed = 3) => {
  if (t < t0) return [0, 0, 0];
  const k = amp * Math.exp(-(t - t0) * dec);
  return [noise1(t * 30, seed) * k, noise1(t * 30, seed + 5) * k, noise1(t * 30, seed + 9) * k * 0.5];
};

export const CAMS = {
  // looking up past a white parapet and a blue dome into the cobalt sky; slow tilt up
  s02: (lt, d, t) => {
    const k = smooth(lt / d);
    const pos = add([-93, 1.6, -8], drift(t, 0.08, 2));
    const look = L3([-84, 24, -28], [-86, 31, -29], k);
    return { pos, look, fov: 50 };
  },
  // low over the flat roofs, the great wall rising on the right, receding into the haze
  s05: (lt, d, t) => {
    const k = smooth(lt / d);
    const pos = add(L3([118, 14.5, -246], [112, 15.2, -244], k), drift(t, 0.12, 5));
    const look = L3([-120, 36, -296], [-120, 40, -297], k);
    return { pos, look, fov: 48 };
  },
  // wide: the wall across the town, roofs at the corners, a huge sky; the bolt strikes beyond
  s08: (lt, d, t) => {
    const k = lt / d;
    const pos = add(add(L3([0, 12.5, -36], [0, 12.4, -39], k), drift(t, 0.1, 8)), shake(t, 20.3, 0.25, 4));
    return { pos, look: [0, 96, -300], fov: 56 };
  },
  // the flash dome over the wall: closer, lower, the wall a silhouette against the light
  s09: (lt, d, t) => {
    const pos = add(add([2, 9, -150], drift(t, 0.15, 9)), shake(t, 21.0, 0.6, 2.5));
    return { pos, look: [0, 48, -300], fov: 44 };
  },
  // aerial, steep and banked: roofs fill the frame, the wall cuts the top corner diagonally;
  // the shock ring sweeps out over the town toward camera
  s10: (lt, d, t) => {
    const k = smooth(lt / d);
    const pos = add(add(L3([78, 100, -168], [70, 94, -176], k), drift(t, 0.3, 10)), shake(t, 22.0, 1.6, 2.4));
    const look = L3([22, 0, -238], [18, 0, -243], k);
    return { pos, look, fov: 50, roll: 24 };
  },
  // low on the main street toward the gate: the wall fills the sky; steam rises behind it
  s12: (lt, d, t) => {
    const k = smooth(lt / d);
    const pos = add(L3([2.6, 1.35, -196], [2.4, 1.3, -199], k), drift(t, 0.05, 12, 0.5));
    const look = L3([-1, 30, -300], [-1.5, 34, -300], k);
    return { pos, look, fov: 52 };
  },
  // top-down over the roofs (wall at the top of frame): the colossus' shadow slides over the town toward camera
  s19: (lt, d, t) => {
    const k = lt / d;
    const pos = add(L3([-14, 150, -158], [-14, 146, -154], k), drift(t, 0.25, 19));
    const look = L3([-14, 0, -176], [-14, 0, -172], k);
    return { pos, look, fov: 42 };
  },
  // just inside the gate: silence; dust trickles from the arch
  s24: (lt, d, t) => {
    const k = smooth(lt / d);
    const pos = add(L3([16, 1.3, -264], [15.2, 1.3, -266.5], k), drift(t, 0.03, 24, 0.6));
    const look = L3([-2, 18, -302], [-2, 18.6, -302], k);
    return { pos, look, fov: 54 };
  },
  // in the street: boulders arc over the roofs; at houseHit a block tears the facade away
  s26: (lt, d, t) => {
    const k = smooth(invLerp(0, 1.5, lt));
    const pos = add(add(L3([-4.6, 1.8, -233], [-4.8, 1.9, -235], smooth(lt / d)), drift(t, 0.08, 26)), add(shake(t, 61.6, 0.35, 3.5, 4), shake(t, 60.0, 0.12, 5, 8)));
    const look = L3([10, 28, -262], [8.5, 6.5, -253.5], k);
    return { pos, look, fov: 50 };
  },
  // wide over the roofs toward the wall: boulders falling across the town, dust columns rising
  s27: (lt, d, t) => {
    const k = smooth(lt / d);
    const pos = add(add(L3([-30, 26, -20], [-30, 25.5, -26], k), drift(t, 0.15, 27)), shake(t, 64.4, 0.18, 3));
    const look = L3([10, 30, -300], [10, 31, -300], k);
    return { pos, look, fov: 44 };
  },
};

export const LOOKS = {
  s02: () => ({ k: 1, exposure: 1.1 }),
  s05: () => ({ k: 1 }),
  s08: () => ({ k: 1 }),
  s09: () => ({ k: 1 }),
  s10: () => ({ k: 1, shadow: { center: [0, 0, -170], radius: 330, depth: 700 } }),
  s12: () => ({ k: 0.95 }),
  // the sun is cheated behind the wall so the giant's shadow falls over the roofs
  // only the colossus casts here; its 'key' (= shadow direction) is a low northern light so the
  // shadow of the rising head and shoulders slides far over the sunlit roofs
  s19: () => ({ k: 1, sunAz: 20, sunElev: 44, key: [0.12, 0.27, -0.955], shadow: { center: [-14, 0, -220], radius: 200, depth: 900 } }),
  // held breath: the sun is cheated low behind the wall, the plaza sits in its cool shadow, the crown rims bright
  s24: () => ({ k: 0.9, exposure: 1.1, sunAz: 12, sunElev: 24, shafts: 0.6, shadow: { center: [0, 0, -275], radius: 110, depth: 500 } }),
  s26: (lt, d) => ({ k: lerp(0.75, 0.6, clamp(lt / d)) }),
  s27: () => ({ k: 0.6 }),
};
