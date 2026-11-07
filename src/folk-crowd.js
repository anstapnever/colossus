import { buildCritter, DIMS } from './folk-rig.js';
import { CROWD_SPECIES, CLOTHES, HATS } from './folk-species.js';
import { Rng, onTwos, noise1 } from './util.js';
import { standP, runP, xf, blinkAt, merge, timeline } from './folk-act.js';

// One pool of townsfolk reused by three non-overlapping scenes:
//   s12 (24.5..28)  street extras picking themselves up after the shock (near PLACES.streetView)
//   s14/s16 (31..38) the crowd in the square, frozen, staring up at the wall top
//   s28 (66.5..68.5) folk running down the main street toward the camera
const PI = Math.PI;
const SPECIES = Object.keys(CROWD_SPECIES);
export const POOL = 40;

export function buildCrowd(group) {
  const rng = new Rng(4242);
  const rigs = [];
  for (let i = 0; i < POOL; i++) {
    const sp = SPECIES[i % SPECIES.length];
    const S = CROWD_SPECIES[sp];
    const kid = i % 5 === 3;
    const cl = { ...CLOTHES[(i * 3 + 1) % CLOTHES.length] };
    if (kid) { cl.topLen = Math.min(cl.topLen ?? 1, 1.1); delete cl.apron; }
    const spec = {
      name: `crowd${i}_${sp}`, kind: kid ? 'kid' : 'adult', detail: 0, seed: i * 1.7,
      fur: { ...S.fur, eyeSkin: S.fur.base }, face: { ...S.face, head: sp === 'deer' && i % 2 ? { ...S.face.head, antlers: '#d8c49a' } : S.face.head }, ears: S.ears, tail: S.tail, cloth: cl,
      hat: kid ? null : HATS[(i * 5) % HATS.length], horns: sp === 'sheep' && i % 2 ? '#d8c8a0' : null,
    };
    const r = buildCritter(spec);
    const s = kid ? 1 : rng.range(0.92, 1.08);
    r.root.scale.setScalar(s);
    r.scaleK = s; r.isKid = kid; r.sp = sp; r.seed = i;
    group.add(r.root);
    rigs.push(r);
  }

  // ---- square crowd layout (s14/s16): rows facing north, looking up at the wall top
  const squareSpots = [];
  {
    const r2 = new Rng(77);
    let i = 0;
    // denser near the s14 camera (north edge, looking south into the faces), thinner toward the back
    for (let row = 0; row < 7; row++) {
      const n = row < 3 ? 5 : 7, w = row < 3 ? 14 : 20;
      for (let k = 0; k < n && i < 40; k++, i++) {
        const x = -w / 2 + (k + 0.5) * (w / n) + r2.range(-0.6, 0.6) + (row % 2) * 0.9;
        const z = -126.5 + row * 2.7 + r2.range(-0.5, 0.5);
        squareSpots.push({ x, z, yaw: PI + r2.range(-0.3, 0.3), look: r2.range(0.3, 0.55), arm: r2.int(0, 5), lean: r2.range(-0.08, 0.05) });
      }
    }
  }
  // ---- street extras (s12)
  const extraSpots = [
    { x: -3.4, z: -205, yaw: PI + 0.4, from: 'sit' }, { x: 3.0, z: -206.5, yaw: PI - 0.3, from: 'kneel' }, { x: -0.6, z: -209, yaw: PI + 0.1, from: 'stand' },
    { x: 4.3, z: -208, yaw: PI - 0.6, from: 'sit' }, { x: -4.6, z: -211, yaw: PI + 0.2, from: 'stand' }, { x: 1.2, z: -214, yaw: PI, from: 'kneel' },
    { x: -2.0, z: -219, yaw: PI - 0.2, from: 'stand' }, { x: 3.4, z: -223, yaw: PI + 0.3, from: 'stand' },
  ];
  // ---- runners (s28)
  const runSpots = [];
  {
    const r3 = new Rng(99);
    // a whole street of people fleeing toward the camera; lanes stay left of the camera (x 3.4)
    for (let i = 0; i < 26; i++) {
      runSpots.push({ x: -5.0 + (i % 6) * 1.35 + r3.range(-0.3, 0.3), z0: -216 + i * 0.62 + r3.range(-0.3, 0.3), v: 3.7 + (i % 3) * 0.25 + r3.range(0, 0.2), off: r3.range(0, 1), back: i % 4 === 1, arms: i % 6 === 2 ? 'up' : null });
    }
  }
  const ARMSETS = [
    { L: { sh: [0.05, 0, 0.1], el: 0.25, curl: 0.6 }, R: { sh: [0.05, 0, -0.1], el: 0.25, curl: 0.6 } },
    { L: { sh: [-0.55, 0, 0.1], el: 1.9, curl: 0.8 }, R: { sh: [0.05, 0, -0.1], el: 0.3, curl: 0.6 } },
    { L: { sh: [-0.5, 0.2, 0.05], el: 2.1, curl: 0.9 }, R: { sh: [-0.5, -0.2, -0.05], el: 2.1, curl: 0.9 } },
    { L: { sh: [0.05, 0, 0.1], el: 0.3, curl: 0.5 }, R: { sh: [-2.1, 0, -0.3], el: 1.9, curl: 0.2 } },
    { L: { sh: [0.15, 0, 0.18], el: 0.5, curl: 0.9 }, R: { sh: [0.15, 0, -0.18], el: 0.5, curl: 0.9 } },
    { L: { sh: [-1.4, 0, 0.3], el: 0.15, curl: 0.3 }, R: { sh: [0.05, 0, -0.1], el: 0.3, curl: 0.6 } },
  ];

  function poseSquare(r, sp, q) {
    const D = DIMS[r.isKid ? 'kid' : 'adult'];
    const br = Math.sin(q * 2.0 + r.seed) * 0.015;
    const p = standP(D, sp.x, 0, sp.z, sp.yaw, { spine: [sp.lean + br, 0, 0], neck: [-0.15, 0, 0], head: [-sp.look, 0.04 * noise1(q * 0.4, r.seed), 0], arms: ARMSETS[sp.arm], fl: 0.04 * (r.seed % 3 - 1), fr: -0.03 });
    p.face = { blink: blinkAt(q, r.seed, 4.5), look: [0, 0.35], pupil: 0.24, lid: 0, lidB: 0, tilt: 0.3, browUp: 0.7, browTilt: 0.5, mouth: 0.25 + 0.2 * (r.seed % 3) / 2, wet: 0 };
    p.ears = [0.05, 0.1];
    return p;
  }
  function poseExtra(r, sp, q) {
    const D = DIMS[r.isKid ? 'kid' : 'adult'];
    const lt = q - 24.5;
    const W = xf(sp.x, sp.z, sp.yaw);
    const A = D === DIMS.adult;
    const stand = standP(D, sp.x, 0, sp.z, sp.yaw, { neck: [-0.15, 0, 0], head: [-0.35, 0, 0], arms: { L: { sh: [0.05, 0, 0.12], el: 0.35, curl: 0.6 }, R: { sh: [-0.4, 0, -0.1], el: 1.6, curl: 0.7 } } });
    stand.face = { blink: 0, look: [0, 0.35], pupil: 0.24, tilt: 0.3, browUp: 0.8, browTilt: 0.5, mouth: 0.35 };
    let p = stand;
    if (sp.from === 'sit') {
      // sitting on the paving, propped on both hands behind, knees up
      const sit = standP(D, sp.x, 0, sp.z, sp.yaw, { drop: A ? 0.66 : 0.33, hz: -0.25 * (A ? 1.4 : 1), fl: 0.45 * (A ? 1.4 : 1), fr: 0.5 * (A ? 1.4 : 1), spine: [0.15, 0, 0], neck: [-0.2, 0, 0], head: [-0.4, 0.2, 0],
        arms: { L: { target: W(0.25, 0.11, -0.45), pole: W(0.6, 0.6, 0), wr: [0.9, 0, 0], curl: 0.1 }, R: { target: W(-0.25, 0.11, -0.42), pole: W(-0.6, 0.6, 0), wr: [0.9, 0, 0], curl: 0.1 } } });
      sit.legs.L.pole = W(0.3, 1.5, 1.2); sit.legs.R.pole = W(-0.3, 1.5, 1.2);
      sit.face = { blink: 0, look: [0, 0.35], pupil: 0.24, tilt: 0.3, browUp: 0.8, mouth: 0.4 };
      sit.tail = [1.2, 0.4];
      const kneelUp = standP(D, sp.x, 0, sp.z, sp.yaw, { drop: A ? 0.35 : 0.18, fl: 0.25, fr: -0.15, spine: [0.5, 0, 0], head: [-0.6, 0, 0], arms: { L: { sh: [-0.6, 0, 0.3], el: 0.6 }, R: { sh: [-0.5, 0, -0.3], el: 0.6 } } });
      kneelUp.face = sit.face;
      const ofs = (r.seed % 3) * 0.35;
      p = timeline([[0.2 + ofs, sit], [1.3 + ofs, kneelUp], [2.2 + ofs, stand]], lt);
    } else if (sp.from === 'kneel') {
      const kn = standP(D, sp.x, 0, sp.z, sp.yaw, { drop: A ? 0.32 : 0.17, fl: 0.3, fr: -0.2, spine: [0.45, 0, 0], neck: [-0.3, 0, 0], head: [-0.4, -0.2, 0], arms: { L: { sh: [-0.7, 0, 0.3], el: 0.4 }, R: { sh: [-0.3, 0, -0.4], el: 0.3 } } });
      kn.face = stand.face;
      p = timeline([[0.6, kn], [1.8, stand]], lt);
    } else {
      const sway = merge(stand, { spine: [0.2, 0, 0], head: [-0.2, 0.3, 0] });
      p = timeline([[0, sway], [1.0, stand]], lt);
    }
    return p;
  }
  function poseRun(r, sp, q) {
    const D = DIMS[r.isKid ? 'kid' : 'adult'];
    const lt = q - 66.5 + 0.2;
    const v = r.isKid ? sp.v * 0.8 : sp.v;
    const s = lt * v;
    const z = sp.z0 + s;
    const L = (r.isKid ? 0.85 : 1.35) * (r.scaleK ?? 1);
    const gy = Math.max(0, ((r.scaleK ?? 1) - 1) * 0.45);   // scaled-up rigs: the soles grow with the root scale
    const p = runP(D, sp.x, gy, z, 0, s + sp.off * L, L, { lean: 0.28, arms: sp.arms, head: sp.back ? [-0.1, 1.2, 0] : null });
    p.face = { blink: 0, look: sp.back ? [0.6, 0.1] : [0, 0], pupil: 0.22, tilt: 0.5, browUp: 0.8, browTilt: 0.8, mouth: 0.55 + 0.3 * Math.abs(Math.sin(q * 5 + r.seed)), lid: 0, lidB: 0 };
    p.ears = [0.3, 0.2];
    return p;
  }

  return {
    rigs, squareSpots, extraSpots, runSpots,
    update(t, st) {
      const q = onTwos(t);
      const sid = st.sid;
      for (let i = 0; i < rigs.length; i++) {
        const r = rigs[i];
        let p = { visible: false };
        if ((sid === 's14' || sid === 's16') && i < squareSpots.length) p = poseSquare(r, squareSpots[i], q);
        else if (sid === 's12' && i < extraSpots.length) p = poseExtra(r, extraSpots[i], q);
        else if (sid === 's28' && i < runSpots.length) p = poseRun(r, runSpots[i], q);
        r.setPose(p);
      }
    },
  };
}
