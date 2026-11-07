import * as THREE from 'three';
import { G } from './glsl.js';
import { ENV } from './passes-env.js';
import { deg } from './util.js';

// Colour script for COLOSSUS: one blazing high-key afternoon over a white town.
//   k = 1    full sun: deep cobalt zenith, white cumulus, white stucco, blue domes
//   k = 0.5  dust: the gate is gone, ochre dust hangs in the air, the sun is a pale disk
// Shadows stay cool lavender-blue like classic cels; never muddy or grey.
export const PRESETS = {
  dust: {
    sunColor: '#fff0d6', sunStrength: 0.74, skyTint: '#f6ecdc', shadeTint: '#b8b0d8', deepTint: '#8a82bc', bounce: '#f0dcc0',
    sky: { zenith: '#5a86c8', mid: '#a9c2dc', warm: '#f4e6cc', cool: '#e2dcd2', cloudLit: '#fff8ee', cloudMid: '#f0e6da', cloudShade: '#bfb2c8' },
    fog: { warm: '#ecdcc0', cool: '#d8d0cc', density: 0.0011, mist: 0.3, mistHeight: 24 },
    grade: { lift: '#1a1420', gain: '#fffaf0', sat: 1.02 },
  },
  day: {
    sunColor: '#fff4dc', sunStrength: 1.0, skyTint: '#eaf4ff', shadeTint: '#a6b2ea', deepTint: '#7482d4', bounce: '#f2e8d8',
    sky: { zenith: '#1046c4', mid: '#3a92ee', warm: '#f2f8f8', cool: '#dcf0fa', cloudLit: '#ffffff', cloudMid: '#eef3fe', cloudShade: '#adbcf2' },
    fog: { warm: '#f2f6f6', cool: '#dcecf8', density: 0.00016, mist: 0.06, mistHeight: 30 },
    grade: { lift: '#0e1630', gain: '#fffdf8', sat: 1.12 },
  },
};

const ca = new THREE.Color(), cb = new THREE.Color();
const mixC = (target, a, b, k) => target.copy(ca.set(a)).lerp(cb.set(b), k);
const mixN = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// look: { k, sunElev (deg), sunAz (deg, 0 = -Z north, + toward +X east), sunDisk, shafts, veil, mistMul, fogMul,
//         fogDensity, fogWarm, fogCool, exposure, paintRadius, inkWidth, key: [x,y,z], shadow: {center, radius, depth},
//         fade, fadeColor, cloudDrift }
export function applyLook(ctx, look) {
  const A = PRESETS.dust, B = PRESETS.day;
  const k = clamp01(((look.k ?? 1) - 0.5) / 0.5);
  const el = deg(look.sunElev ?? 34), az = deg(look.sunAz ?? 205);
  G.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  mixC(G.uSunColor.value, A.sunColor, B.sunColor, k);
  G.uSunStrength.value = mixN(A.sunStrength, B.sunStrength, k);
  mixC(G.uSkyTint.value, A.skyTint, B.skyTint, k);
  mixC(G.uShadeTint.value, A.shadeTint, B.shadeTint, k);
  mixC(G.uDeepTint.value, A.deepTint, B.deepTint, k);
  mixC(G.uBounce.value, A.bounce, B.bounce, k);

  ENV.uRain.value = 0;
  ENV.uRainbow.value = 0;
  ENV.uVeil.value = clamp01(look.veil ?? (1 - k) * 0.6);
  ENV.uWaterOn.value = 0;

  const sky = ctx.world && ctx.world.sky;
  if (sky) {
    const u = sky.material.uniforms;
    mixC(u.uZenith.value, A.sky.zenith, B.sky.zenith, k);
    mixC(u.uMid.value, A.sky.mid, B.sky.mid, k);
    mixC(u.uHorizonWarm.value, A.sky.warm, B.sky.warm, k);
    mixC(u.uHorizonCool.value, A.sky.cool, B.sky.cool, k);
    mixC(u.uCloudLit.value, A.sky.cloudLit, B.sky.cloudLit, k);
    mixC(u.uCloudMid.value, A.sky.cloudMid, B.sky.cloudMid, k);
    mixC(u.uCloudShade.value, A.sky.cloudShade, B.sky.cloudShade, k);
    u.uSunDisk.value = look.sunDisk ?? 1;
    u.uCloudDrift.value = look.cloudDrift ?? 0;
  }
  const e = ctx.engine;
  const a = e.mAtmos.uniforms;
  mixC(a.uFogWarm.value, A.fog.warm, B.fog.warm, k);
  mixC(a.uFogCool.value, A.fog.cool, B.fog.cool, k);
  if (look.fogWarm) a.uFogWarm.value.set(look.fogWarm);
  if (look.fogCool) a.uFogCool.value.set(look.fogCool);
  a.uFogDensity.value = (look.fogDensity ?? mixN(A.fog.density, B.fog.density, k)) * (look.fogMul ?? 1);
  a.uMist.value = mixN(A.fog.mist, B.fog.mist, k) * (look.mistMul ?? 1);
  a.uMistHeight.value = mixN(A.fog.mistHeight, B.fog.mistHeight, k);
  a.uShafts.value = look.shafts ?? 0;
  const f = e.mFinal.uniforms;
  mixC(f.uLift.value, A.grade.lift, B.grade.lift, k);
  mixC(f.uGain.value, A.grade.gain, B.grade.gain, k);
  f.uSat.value = mixN(A.grade.sat, B.grade.sat, k);
  f.uExposure.value = look.exposure ?? 1.12;
}
