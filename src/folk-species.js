// Character designs (ours). Colours are cel base tones; shading is done in the material.

// ---- head shapes (signed-distance designs in head radii; see folk-head.js). pat = colour pattern in the head shader.
// muzzle: len/r0/r1 (base and tip radius), y (height of the base), up (tip raised), sx/sy (section), z0 (base depth)
// tufts: [[base], [tip], radius, blend] mirrored left/right; bangs: same, not mirrored
const FOX_HEAD = {
  hw: 0.98, hh: 0.86, hd: 0.86, cy: 0.1, cheek: [0.44, -0.2, 0.12, 0.32], cheekW: 1.0,
  muzzle: { len: 0.8, r0: 0.36, r1: 0.13, y: -0.2, up: 0.12, sx: 0.88, sy: 0.86, z0: 0.48, k: 0.3, belly: 0.02 },
  tufts: [[[0.66, -0.12, 0.06], [1.2, -0.2, -0.1], 0.17, 0.07], [[0.6, -0.28, 0.04], [1.12, -0.48, -0.12], 0.16, 0.07], [[0.48, -0.42, 0.06], [0.84, -0.72, -0.08], 0.13, 0.07]],
  // fringe locks: [root direction, tip direction, radius (R), bow]; built as geometry (folk-rig), not in the SDF
  fringe: [[[0.0, 1.0, 0.25], [0.05, 0.5, 0.95], 0.12, 0.12], [[0.26, 0.97, 0.2], [0.34, 0.52, 0.9], 0.11, 0.12], [[-0.26, 0.97, 0.2], [-0.32, 0.54, 0.9], 0.105, 0.12],
           [[0.12, 1.0, 0.05], [0.17, 0.66, 0.84], 0.095, 0.16], [[-0.13, 1.0, 0.05], [-0.15, 0.68, 0.84], 0.09, 0.16], [[0.42, 0.9, 0.1], [0.56, 0.6, 0.78], 0.09, 0.12]],
  pat: 1, p: [-0.24, 0.24, 0.1, 0.15], mouthW: 0.1, mouthDrop: 0.15, mouthDepth: 0.45, noseUp: 0.7,
};
const HARE_HEAD = {
  hw: 0.95, hh: 1.04, hd: 0.94, cy: 0.08, cheek: [0.42, -0.32, 0.24, 0.42], cheekW: 1.12,
  muzzle: { len: 0.3, r0: 0.32, r1: 0.22, y: -0.3, up: 0.04, sx: 1.2, sy: 0.84, z0: 0.54, k: 0.32 },
  pat: 2, p: [0.42, -0.34, 0.3, 0], ymouth: 1, mouthW: 0.14, mouthDrop: 0.15, mouthDepth: 0.4, noseUp: 0.7,
};
const LYNX_HEAD = {
  hw: 1.16, hh: 0.8, hd: 0.9, cy: -0.02, cheek: [0.48, -0.28, 0.2, 0.42], cheekW: 1.15,
  muzzle: { len: 0.13, r0: 0.32, r1: 0.26, y: -0.27, up: 0.02, sx: 1.28, sy: 0.78, z0: 0.56, k: 0.3 },
  tufts: [[[0.72, -0.24, 0.0], [1.52, -0.58, -0.12], 0.25, 0.16], [[0.6, -0.42, 0.02], [1.28, -1.0, -0.12], 0.23, 0.16], [[0.4, -0.58, 0.08], [0.74, -1.18, 0.02], 0.19, 0.16]],
  pat: 7, p: [0.5, -0.3, 0.34, 0], ymouth: 1, mouthW: 0.15, mouthDrop: 0.15, mouthDepth: 0.4, noseUp: 0.7,
};
const BADGER_HEAD = { hw: 1.02, hh: 0.9, cheek: [0.45, -0.3, 0.15, 0.4], muzzle: { len: 0.55, r0: 0.32, r1: 0.11, y: -0.22, up: 0.02, sx: 1.0, sy: 0.85, z0: 0.42 }, pat: 4, p: [0.4, -0.3, 0.3, 0], mouthW: 0.16, mouthDrop: 0.17, mouthDepth: 0.5 };
const PIG_HEAD = { hw: 1.04, hh: 0.96, cheek: [0.44, -0.3, 0.22, 0.44], muzzle: { len: 0.22, r0: 0.3, r1: 0.27, y: -0.18, up: 0, sx: 1.1, sy: 0.92, z0: 0.55 }, pat: 0, mouthW: 0.17, mouthDrop: 0.3, mouthDepth: 0.4, noseUp: 0 };
const GOAT_HEAD = { hw: 0.95, hh: 0.98, cheek: [0.42, -0.3, 0.18, 0.36], muzzle: { len: 0.62, r0: 0.32, r1: 0.17, y: -0.26, up: -0.05, sx: 0.95, sy: 0.9, z0: 0.42 }, pat: 5, p: [0.4, -0.32, 0.3, 0], mouthW: 0.15, mouthDrop: 0.2, mouthDepth: 0.5, ymouth: 1 };
const KIDGOAT_HEAD = { hw: 1.0, hh: 1.0, cheek: [0.44, -0.3, 0.22, 0.42], muzzle: { len: 0.34, r0: 0.3, r1: 0.18, y: -0.26, up: 0, sx: 1.0, sy: 0.9, z0: 0.5 }, pat: 5, p: [0.4, -0.32, 0.3, 0], mouthW: 0.14, mouthDrop: 0.18, mouthDepth: 0.45, ymouth: 1 };
const CROWD_HEADS = {
  bear: { hw: 1.08, hh: 0.95, cheek: [0.46, -0.3, 0.2, 0.44], muzzle: { len: 0.32, r0: 0.32, r1: 0.22, y: -0.27, up: 0, sx: 1.05, sy: 0.88, z0: 0.5 }, pat: 2, p: [0.36, -0.3, 0.3, 0], mouthW: 0.16, mouthDrop: 0.18 },
  deer: { hw: 0.95, hh: 0.95, cheek: [0.4, -0.3, 0.15, 0.34], muzzle: { len: 0.66, r0: 0.3, r1: 0.14, y: -0.24, up: 0.04, sx: 0.95, sy: 0.88, z0: 0.42 }, pat: 2, p: [0.3, -0.36, 0.25, 0], mouthW: 0.14, mouthDrop: 0.17, mouthDepth: 0.5 },
  cat: { hw: 1.08, hh: 0.92, cheek: [0.46, -0.28, 0.22, 0.42], cheekW: 1.15, muzzle: { len: 0.1, r0: 0.3, r1: 0.25, y: -0.27, up: 0.02, sx: 1.25, sy: 0.78, z0: 0.58 }, pat: 2, p: [0.44, -0.3, 0.3, 0], ymouth: 1, mouthW: 0.14, mouthDrop: 0.15, mouthDepth: 0.4, noseUp: 0.7 },
  dog: { hw: 1.0, hh: 0.95, cheek: [0.44, -0.3, 0.2, 0.38], muzzle: { len: 0.5, r0: 0.32, r1: 0.18, y: -0.25, up: 0.02, sx: 1.0, sy: 0.86, z0: 0.45 }, pat: 2, p: [0.36, -0.34, 0.3, 0], mouthW: 0.16, mouthDrop: 0.18, mouthDepth: 0.5 },
  sheep: { hw: 0.98, hh: 0.95, cheek: [0.4, -0.3, 0.18, 0.36], muzzle: { len: 0.42, r0: 0.3, r1: 0.19, y: -0.27, up: -0.02, sx: 0.98, sy: 0.9, z0: 0.45 }, woolCap: true, pat: 6, mouthW: 0.14, mouthDrop: 0.18, ymouth: 1 },
  raccoon: { hw: 1.05, hh: 0.9, cheek: [0.48, -0.25, 0.15, 0.4], muzzle: { len: 0.5, r0: 0.3, r1: 0.09, y: -0.22, up: 0.06, sx: 0.95, sy: 0.85, z0: 0.42 }, tufts: [[[0.75, -0.25, 0.0], [1.15, -0.42, -0.12], 0.14, 0.08]], pat: 3, p: [0.34, -0.33, 0.24, 0], mouthW: 0.14, mouthDrop: 0.16, mouthDepth: 0.5 },
  otter: { hw: 1.12, hh: 0.8, hd: 0.95, cheek: [0.46, -0.25, 0.25, 0.42], cheekW: 1.15, muzzle: { len: 0.2, r0: 0.34, r1: 0.27, y: -0.22, up: 0, sx: 1.32, sy: 0.74, z0: 0.55 }, whiskers: true, pat: 2, p: [0.5, -0.3, 0.3, 0], ymouth: 1, mouthW: 0.15, mouthDrop: 0.14, mouthDepth: 0.4 },
  boar: { hw: 1.05, hh: 0.92, cheek: [0.46, -0.32, 0.18, 0.42], muzzle: { len: 0.55, r0: 0.36, r1: 0.26, y: -0.24, up: 0, sx: 1.08, sy: 0.92, z0: 0.42 }, tusks: true, tufts: [[[0.0, 0.85, -0.2], [0.0, 1.15, -0.5], 0.14, 0.06]], pat: 0, mouthW: 0.17, mouthDrop: 0.3, mouthDepth: 0.4, noseUp: 0 },
};

export const FOX = {
  name: 'fox', kind: 'kid', seed: 1, eyeDetail: 0.5,
  fur: { base: '#d98e5a', light: '#fff4e8', dark: '#4a2a26', inner: '#f6d6c0', socks: true, eyeSkin: '#d98e5a' },
  face: { head: FOX_HEAD, muzzle: 0.5, muzzleW: 0.42, cheek: 0.16, muzzleDrop: 0.1, muzzleSpread: 0.84, noseR: 0.085, noseCol: '#2b1d22', mouthW: 0.22, mouthDrop: 0.24,
    iris: '#27b08e', irisDark: '#0e4a42', irisLight: '#a6f2d2', eye: 0.94, eyeX: 0.45, eyeY: 0.2, irisR: 0.6, pupil: 0.36, brow: '#8a4428', fringe: 0, blush: '#ff8a7a', lashW: 0.16, bangs: 0, bridge: -0.3 },
  ears: { type: 'tri', len: 1.12, w: 0.74, splay: 0.3, rx: -0.1, x: 0.5, y: 0.8, tip: '#3a2224', tipFrom: 0.68, back: '#5a3026', inner: true, innerTuft: '#fff4e8' },
  tail: { type: 'bushy', len: 0.52, r: 0.1, tip: '#fff4e8', tipFrom: 0.76 },
  cloth: { top: '#1fa59a', trim: '#f2e3c0', sash: '#e0a12e', short: '#6a4a3c', shorts: 0.5, sandals: '#8a5a34', topLen: 1.12 },
};

export const HARE = {
  name: 'hare', kind: 'kid', seed: 2, eyeDetail: 0.5,
  fur: { base: '#d6cad6', light: '#fbf7f4', dark: '#7a6a80', inner: '#f4b8c4', eyeSkin: '#d6cad6', eyeSkinLow: '#fbf7f4' },
  face: { head: HARE_HEAD, muzzle: 0.26, muzzleW: 0.6, cheek: 0.2, noseR: 0.075, noseCol: '#e98a9c', mouthW: 0.2, mouthDrop: 0.18, teeth: true,
    iris: '#4f86e0', irisDark: '#1b2e6a', irisLight: '#bfe0ff', eye: 0.88, eyeX: 0.45, eyeY: 0.1, irisR: 0.62, pupil: 0.36, brow: '#6c6488', fringe: 0, blush: '#ff9ab0', lashW: 0.15, bangs: 0, maskUp: 0.14 },
  ears: { type: 'long', len: 1.6, w: 0.44, splay: 0.14, rx: -0.12, x: 0.32, y: 0.92, tip: '#8a7a8c', tipFrom: 0.85, bendR: 0.75 },
  tail: { type: 'pom' },
  cloth: { top: '#f3ead2', sleeves: '#f3ead2', sleeveLen: 0.55, short: '#6f7a4a', shorts: 0.55, sandals: '#6a4a34', topLen: 1.05 },
  glasses: '#4a3328', glassR: 0.44, satchel: '#4f9a52',
};

export const LYNX = {
  name: 'lynx', kind: 'kid', seed: 3, eyeDetail: 0.5,
  fur: { base: '#d8c0a0', light: '#fbf4e4', dark: '#3a2a26', inner: '#f3dcc0', eyeSkin: '#d8c0a0', eyeSkinLow: '#fbf4e4' },
  face: { head: LYNX_HEAD, muzzle: 0.22, muzzleW: 0.62, cheek: 0.24, noseR: 0.075, noseCol: '#c46a62', mouthW: 0.2, mouthDrop: 0.2, ruff: true,
    iris: '#c9a226', irisDark: '#5a3a10', irisLight: '#fff0a0', eye: 1.0, eyeX: 0.41, eyeY: 0.12, irisR: 0.6, pupil: 0.3, brow: '#7a5a3a', fringe: 0, lashW: 0.16, bangs: 0 },
  ears: { type: 'tri', len: 1.0, w: 0.58, splay: 0.2, tuft: true, tip: '#3a2a26', tipFrom: 0.78, back: '#7a5a40' },
  tail: { type: 'short', len: 0.14, r: 0.04, tip: '#3a2a26', tipFrom: 0.6 },
  cloth: { top: '#9a6e4c', short: '#7a5a40', shorts: 0.6, sandals: '#6a4a34' },
  cape: '#e0aa22',
};

export const BADGER = {
  name: 'badgerMom', kind: 'adult', seed: 4,
  fur: { base: '#8c8a94', light: '#f6f4f2', dark: '#2a2830', inner: '#d0c8c8', eyeSkin: '#6a6874' },
  face: { head: BADGER_HEAD, muzzle: 0.5, muzzleW: 0.5, cheek: 0.14, jowl: 0.06, pattern: 'stripe', noseCol: '#221c22', mouthW: 0.2,
    iris: '#8a5a2a', irisDark: '#3a2010', irisLight: '#e8c080', eye: 0.92, brow: '#2a2830', lashW: 0.18 },
  ears: { type: 'round', len: 0.4, w: 0.42, x: 0.72, y: 0.6, tip: '#2a2830' },
  tail: { type: 'short', len: 0.16, r: 0.05 },
  cloth: { top: '#c84a4a', trim: '#f4e6c8', topLen: 1.85, sleeves: '#f4e6c8', sleeveLen: 0.7, shoes: '#5a3a2a' },
  hat: { type: 'kerchief', color: '#f2c84a' },
};
export const PIGLET = {
  name: 'piglet', kind: 'tot', seed: 5,
  fur: { base: '#f4b2b4', light: '#fbd8d6', dark: '#d88a90', inner: '#f8c6c8', eyeSkin: '#f4b2b4' },
  face: { head: PIG_HEAD, muzzle: 0.3, muzzleW: 0.6, cheek: 0.22, noseType: 'disc', noseR: 0.18, noseCol: '#e88c94', mouthW: 0.2, pattern: 'face',
    iris: '#3a6ad0', irisDark: '#14245a', irisLight: '#bcd8ff', eye: 1.1, blush: '#ff7a8a', brow: '#c47078' },
  ears: { type: 'droop', len: 0.45, w: 0.5, x: 0.62, y: 0.7, rx: -0.6, splay: -0.5 },
  tail: { type: 'curl' },
  cloth: { top: '#3f8f5a', short: '#e8c040', shorts: 0.8, shoes: '#6a4a3a', sleeves: '#3f8f5a', sleeveLen: 0.6 },
};
export const GOAT = {
  name: 'goatMom', kind: 'adult', seed: 6,
  fur: { base: '#f2ece2', light: '#ffffff', dark: '#8a7a6a', inner: '#f0c8b8', eyeSkin: '#f2ece2' },
  face: { head: GOAT_HEAD, muzzle: 0.55, muzzleW: 0.5, cheek: 0.08, noseCol: '#b08a80', mouthW: 0.18, pattern: 'face',
    iris: '#c0902a', irisDark: '#4a3010', irisLight: '#ffe090', eye: 0.92, brow: '#a89888' },
  ears: { type: 'droop', len: 0.6, w: 0.4, x: 0.8, y: 0.35, rx: 0.2, splay: -1.2 },
  horns: '#cbb894',
  tail: { type: 'short', len: 0.1, r: 0.04 },
  cloth: { top: '#5a7ab8', trim: '#f6e4b8', topLen: 1.9, sleeves: '#5a7ab8', sleeveLen: 0.85, apron: '#e9d9b0', shoes: '#5a3a2a' },
  hat: { type: 'kerchief', color: '#e8e0f0' },
};
export const KIDGOAT = {
  name: 'babyGoat', kind: 'tot', seed: 7, dims: { headR: 0.13 },
  fur: { base: '#fbf6ee', light: '#ffffff', dark: '#9a8a7a', inner: '#f6cfc0', eyeSkin: '#fbf6ee' },
  face: { head: KIDGOAT_HEAD, muzzle: 0.4, muzzleW: 0.55, noseCol: '#d09a90', mouthW: 0.18, pattern: 'face', iris: '#d0a030', irisDark: '#5a3a10', irisLight: '#fff0a0', eye: 1.15, blush: '#ffa0a0' },
  ears: { type: 'droop', len: 0.5, w: 0.42, x: 0.8, y: 0.4, rx: 0.2, splay: -1.1 },
  tail: { type: 'short', len: 0.08, r: 0.03 },
  cloth: { top: '#f0a8b8', short: '#f0a8b8', shorts: 0.5 },
};

// crowd species: fur + face + ears + tail templates
export const CROWD_SPECIES = {
  bear: { fur: { base: '#8a5a3c', light: '#d8b48c', dark: '#4a2e22', inner: '#c49478' }, face: { head: CROWD_HEADS.bear, muzzle: 0.42, muzzleW: 0.55, cheek: 0.16, jowl: 0.05, noseCol: '#2a1e1e', iris: '#6a4020', irisDark: '#2a1608', irisLight: '#d8a060', eye: 0.8 }, ears: { type: 'round', w: 0.42, x: 0.62, y: 0.72 }, tail: { type: 'pom' } },
  deer: { fur: { base: '#c8864e', light: '#fbf0e0', dark: '#5a3624', inner: '#f2c8b0' }, face: { head: CROWD_HEADS.deer, muzzle: 0.48, muzzleW: 0.5, noseCol: '#2a1e22', iris: '#4a2a14', irisDark: '#1a0a04', irisLight: '#b0804a', eye: 1.0 }, ears: { type: 'tri', len: 0.7, w: 0.5, x: 0.85, y: 0.4, splay: 1.0 }, tail: { type: 'short', len: 0.1, r: 0.04, tip: '#fbf0e0' } },
  cat: { fur: { base: '#9aa0aa', light: '#f4f4f6', dark: '#4a4c58', inner: '#f2b8c0' }, face: { head: CROWD_HEADS.cat, muzzle: 0.15, muzzleW: 0.6, cheek: 0.2, noseCol: '#e88a98', iris: '#7ab84a', irisDark: '#2a4a14', irisLight: '#d8f0a0', eye: 1.0 }, ears: { type: 'tri', len: 0.7, w: 0.55, splay: 0.3 }, tail: { type: 'long', len: 0.5, r: 0.03 } },
  dog: { fur: { base: '#d8a868', light: '#fbf2e2', dark: '#7a5030', inner: '#c08860' }, face: { head: CROWD_HEADS.dog, muzzle: 0.48, muzzleW: 0.55, cheek: 0.12, noseCol: '#2a1e1e', iris: '#6a3a1a', irisDark: '#2a1408', irisLight: '#d89a5a', eye: 0.95 }, ears: { type: 'droop', len: 0.6, w: 0.45, x: 0.7, y: 0.55, rx: 0.1, splay: -0.6, tip: '#7a5030' }, tail: { type: 'long', len: 0.3, r: 0.035 } },
  sheep: { fur: { base: '#f4efe6', light: '#ffffff', dark: '#3a3438', inner: '#e8c8c0' }, face: { head: CROWD_HEADS.sheep, muzzle: 0.35, muzzleW: 0.55, pattern: 'face', noseCol: '#3a2e30', iris: '#8a6a3a', irisDark: '#3a2a10', irisLight: '#e0c080', eye: 0.9, fringe: 5 }, ears: { type: 'droop', len: 0.45, w: 0.4, x: 0.85, y: 0.35, splay: -1.3 }, tail: { type: 'pom' } },
  raccoon: { fur: { base: '#8c8890', light: '#f2f0f2', dark: '#2e2a32', inner: '#d8d0d0' }, face: { head: CROWD_HEADS.raccoon, muzzle: 0.42, muzzleW: 0.48, pattern: 'mask', noseCol: '#1e1a20', iris: '#5a3a2a', irisDark: '#1e1008', irisLight: '#c09070', eye: 0.95 }, ears: { type: 'round', w: 0.45, x: 0.6, y: 0.75, tip: '#f2f0f2' }, tail: { type: 'bushy', len: 0.4, r: 0.05, rings: 5, tip: '#2e2a32' } },
  otter: { fur: { base: '#7a5034', light: '#e8cca8', dark: '#3a2418', inner: '#a87a5a' }, face: { head: CROWD_HEADS.otter, muzzle: 0.3, muzzleW: 0.7, cheek: 0.2, noseCol: '#2a1a14', iris: '#3a2214', irisDark: '#140804', irisLight: '#a07050', eye: 0.95 }, ears: { type: 'round', w: 0.3, x: 0.75, y: 0.5 }, tail: { type: 'long', len: 0.45, r: 0.05 } },
  boar: { fur: { base: '#6a4a3a', light: '#a8846a', dark: '#2e2018', inner: '#c49488' }, face: { head: CROWD_HEADS.boar, muzzle: 0.55, muzzleW: 0.55, noseType: 'disc', noseR: 0.2, noseCol: '#d89a90', jowl: 0.08, iris: '#4a2a1a', irisDark: '#1a0a04', irisLight: '#b08060', eye: 0.8, teeth: true }, ears: { type: 'tri', len: 0.55, w: 0.5, x: 0.7, y: 0.6, splay: 0.8 }, tail: { type: 'short', len: 0.12, r: 0.02 } },
};

export const CLOTHES = [
  { top: '#2f7fc0', trim: '#f4e6c0', topLen: 1.25, sleeves: '#2f7fc0', sleeveLen: 0.9, pants: '#e8dcc0', shoes: '#5a3a2a' },
  { top: '#f2e8d4', topLen: 1.0, sleeves: '#f2e8d4', sleeveLen: 0.55, apron: '#c85a3a', pants: '#5a6a8a', shoes: '#4a3428' },
  { top: '#d9a42a', trim: '#7a3a22', topLen: 1.5, sleeves: '#d9a42a', sleeveLen: 0.7, pants: '#6a4a3a', shoes: '#4a3428', sash: '#7a3a22' },
  { top: '#3aa58a', topLen: 1.05, sleeves: '#f6f0e0', sleeveLen: 0.6, pants: '#d8c8a8', shoes: '#5a3a2a' },
  { top: '#c24a5a', trim: '#f6e6c8', topLen: 1.8, sleeves: '#f6e6c8', sleeveLen: 0.8, apron: '#f2ead6', shoes: '#5a3a2a' },
  { top: '#f6f2ea', topLen: 1.2, sleeves: '#f6f2ea', sleeveLen: 0.9, pants: '#2f5a9a', shoes: '#3a2a22', sash: '#e0a12e' },
  { top: '#7a5ab0', trim: '#f2d890', topLen: 1.7, sleeves: '#7a5ab0', sleeveLen: 0.75, shoes: '#4a3428' },
  { top: '#e8c88a', topLen: 1.0, sleeves: '#e8c88a', sleeveLen: 0.5, pants: '#7a4a3a', shoes: '#4a3428', apron: '#4a7a5a' },
];
export const HATS = [null, null, { type: 'cap', color: '#d8c8a0' }, { type: 'kerchief', color: '#f2c84a' }, null, { type: 'fez', color: '#c24a3a' }, { type: 'kerchief', color: '#5aa0d8' }];
