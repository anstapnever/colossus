import { smooth, invLerp } from './util.js';

// COLOSSUS — 77.5 s, 24 fps. A shot-for-shot retelling (actions only) of a famous anime scene,
// fully redesigned: a white hill town of animal folk, a sandstone wall, a bronze automaton colossus.
export const FPS = 24;
export const DURATION = 77.5;
export const FRAMES = Math.round(FPS * DURATION);

// Story beats in film seconds. Every department and the soundtrack key off these.
export const CUES = {
  peace: 0,
  bolt: 20.3,          // a cyan-white bolt strikes the field outside the wall
  flash: 21.0,         // the flash dome swells over the wall, white-out
  shock: 22.0,         // the shock ring sweeps over the roofs
  startle: 23.5,       // the kids are thrown off balance
  steam: 24.5,         // a column of steam rises behind the wall
  hand: 38.0,          // bronze fingers clamp the wall top, stone cracks
  rise: 40.5,          // the colossus starts to straighten up (hidden behind the wall)
  shadow: 42.5,        // its shadow slides over the roofs
  head: 45.0,          // the head rises over the wall
  headUp: 49.5,        // fully up, it stares down at the town
  legLift: 55.0,       // it steps back and lifts its leg
  silence: 57.5,       // the held breath at the gate
  kick: 59.0,          // the foot smashes the gate
  debris: 60.0,        // boulders over the town
  houseHit: 61.6,      // a block tears a house facade away
  run: 66.5,           // folk run, the dust wave
  breach: 68.5,        // the broken gate, the colossus vanishes in steam
  walkers: 71.0,       // small automatons walk toward the breach
  end: 77.5,
};

// set = which part of the world the shot needs (departments may skip work for other sets).
// ref = the reference shot numbers (ref/shots/sheet_*.jpg, r01..r60).
const LIST = [
  ['s01', 'petals', 'steps', 1.5, 'r01'],
  ['s02', 'sky', 'sky', 2.0, 'r02'],
  ['s03', 'kids', 'steps', 4.0, 'r03'],
  ['s04', 'hug', 'street', 2.5, 'r04'],
  ['s05', 'wall over roofs', 'town', 3.0, 'r05'],
  ['s06', 'hare close', 'steps', 2.5, 'r06 r08'],
  ['s07', 'laundry', 'roof', 2.5, 'r09'],
  ['s08', 'bolt', 'wallwide', 3.0, 'r10'],
  ['s09', 'flash', 'wallwide', 1.0, 'r11'],
  ['s10', 'shock', 'aerial', 1.5, 'r12 r13 r14'],
  ['s11', 'startle', 'steps', 1.0, 'r15 r16'],
  ['s12', 'street steam', 'street', 3.5, 'r19'],
  ['s13', 'kids turn', 'steps', 3.0, 'r20 r22'],
  ['s14', 'crowd', 'square', 2.5, 'r23'],
  ['s15', 'fox face', 'steps', 1.0, 'r24'],
  ['s16', 'crowd back', 'square', 3.5, 'r25'],
  ['s17', 'hand', 'walltop', 2.5, 'r26 r27'],
  ['s18', 'eye', 'eye', 2.0, 'r29'],
  ['s19', 'shadow', 'aerial', 2.5, 'r30'],
  ['s20', 'head', 'walltop', 4.5, 'r31'],
  ['s21', 'wall head', 'wallwide', 2.5, 'r32'],
  ['s22', 'bell tower', 'town', 3.0, 'r34'],
  ['s23', 'leg', 'outside', 2.5, 'r35'],
  ['s24', 'gate inside', 'gate', 1.5, 'r36'],
  ['s25', 'burst', 'gate', 1.0, 'r37'],
  ['s26', 'debris', 'town', 4.0, 'r38 r40 r41'],
  ['s27', 'boulder rain', 'town', 2.5, 'r42 r43 r44'],
  ['s28', 'run', 'street', 2.0, 'r45'],
  ['s29', 'breach', 'gate', 2.5, 'r46'],
  ['s30', 'walkers', 'outside', 3.5, 'r47'],
  ['s31', 'hare eyes', 'steps', 3.0, 'r58 r59'],
];
export const SHOTS = [];
{
  let t = 0;
  for (const [id, name, set, d, ref] of LIST) { SHOTS.push({ id, name, set, start: +t.toFixed(3), end: +(t + d).toFixed(3), ref }); t += d; }
}

const CAMS = {}, LOOKS = {};
export function registerCams(mod) { Object.assign(CAMS, mod.CAMS || {}); Object.assign(LOOKS, mod.LOOKS || {}); }

// Placeholder framing per set until the lead sets a real camera.
const DEFAULT_CAM = {
  steps: { pos: [-38, 6, 236], look: [-50, 3, 252], fov: 40 },
  sky: { pos: [0, 10, 100], look: [0, 60, -200], fov: 45 },
  street: { pos: [0, 1.6, 40], look: [0, 30, -300], fov: 40 },
  town: { pos: [0, 30, 160], look: [0, 30, -300], fov: 40 },
  roof: { pos: [-110, 14, -40], look: [-120, 12, -60], fov: 40 },
  wallwide: { pos: [0, 40, 200], look: [0, 40, -300], fov: 40 },
  aerial: { pos: [0, 260, 120], look: [0, 0, 60], fov: 40 },
  square: { pos: [0, 1.6, 120], look: [0, 30, -300], fov: 40 },
  walltop: { pos: [20, 50, -200], look: [20, 58, -300], fov: 40 },
  eye: { pos: [0, 1.5, 3], look: [0, 1.5, 0], fov: 30 },
  outside: { pos: [60, 4, -600], look: [30, 30, -320], fov: 40 },
  gate: { pos: [0, 4, -200], look: [0, 12, -300], fov: 40 },
};
const DEFAULT_LOOK = { k: 1, sunElev: 34, sunAz: 205 };

export function shotAt(t) {
  for (let i = 0; i < SHOTS.length; i++) if (t < SHOTS[i].end) return i;
  return SHOTS.length - 1;
}
export const shotById = (id) => SHOTS.find((s) => s.id === id);

export function evalFrame(frame) {
  const t = frame / FPS;
  const si = shotAt(t);
  const sh = SHOTS[si];
  const lt = t - sh.start, dur = sh.end - sh.start;
  const st = { frame, t, si, sid: sh.id, shot: sh.name, set: sh.set, lt, dur, cues: CUES, fade: 0, fadeColor: '#ffffff', shadow: null, key: null };
  const lf = LOOKS[sh.id];
  st.look = { ...DEFAULT_LOOK, ...(lf ? lf(lt, dur, t, st) : {}) };
  // continuity: after the kick ochre dust hangs over the whole town (no shot may jump back to a clear sky)
  if (t > CUES.kick) {
    const kDust = t < CUES.kick + 1.5 ? 1 - 0.38 * smooth((t - CUES.kick) / 1.5) : 0.62 + 0.1 * smooth(invLerp(CUES.breach, CUES.end, t));
    st.look.k = Math.min(st.look.k ?? 1, kDust);
  }
  st.shadow = st.look.shadow ?? null;
  st.key = st.look.key ?? null;
  const cf = CAMS[sh.id];
  st.cam = cf ? cf(lt, dur, t, st) : DEFAULT_CAM[sh.set];
  if (st.look.fade != null) st.fade = st.look.fade;
  if (st.look.fadeColor) st.fadeColor = st.look.fadeColor;
  // open from black, close to black
  if (t < 0.4) st.fade = Math.max(st.fade, 1 - smooth(t / 0.4)), st.fadeColor = '#000000';
  if (t > DURATION - 1.2) { st.fade = Math.max(st.fade, smooth(invLerp(DURATION - 1.2, DURATION, t))); st.fadeColor = '#000000'; }
  return st;
}
