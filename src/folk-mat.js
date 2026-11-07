import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';

// Folk materials: soft-edged cel fur / cloth (two hard tones, fur-serrated terminator, warm rim),
// and the anime eye (white, gradient iris, pupil, two highlights, lids and lashes drawn in the shader).

const FUR_VS = /* glsl */ `
  attribute vec3 aCol;
  attribute vec3 aCol2;
  attribute float aMask;
  varying vec3 vCol, vCol2;
  varying float vMask;
  varying vec3 vLocal;
  ${VERT_STD}
  void main(){ vCol = aCol; vCol2 = aCol2; vMask = aMask; vLocal = position; stdVertex(position, normal); }
`;

const LIGHT = /* glsl */ `
  // shared folk lighting: two tones, cool lavender shade, warm rim on the key side
  // uShOff: heads test the shadow map from a point moved toward the sun past their own ears and tufts,
  // so a face takes the shade of a wall or the giant but never blocky self-shadow from its own features
  uniform float uShOff;
  vec3 folkLight(vec3 col, vec3 N, vec3 V, float fur, vec3 lp, float rimK, float gloss){
    float ndl = dot(N, uKeyDir);
    // fur breaks the terminator into small serrations (painted fur, not a CG gradient)
    // ...only where the terminator is already tight on screen: broad, slow terminators (chins, close-ups) stay clean
    float serr = (vnoise3(lp * 90.0) - 0.5) * 0.12 * fur * clamp(fwidth(ndl) * 30.0, 0.0, 1.0);
    float sh = sunShadow(vWorld + uKeyDir * uShOff, N);
    float lit = smoothstep(-0.02, 0.04, ndl + serr) * sh;
    vec3 litCol = col * mix(uSkyTint, uSunColor * 1.05, uSunStrength);
    float up = smoothstep(-0.7, 0.6, N.y);
    // characters keep a warmer shade than the set (same brightness as the scene's shade tint, less blue)
    vec3 shT = mix(uShadeTint, vec3(dot(uShadeTint, vec3(0.3333))) * vec3(1.07, 0.95, 0.98), 0.38);
    vec3 shadeCol = col * shT * mix(uBounce, vec3(1.0), up) * 1.04;
    vec3 o = mix(shadeCol, litCol, lit);
    // pale bounce light under the chin / belly, very anime
    float bounce = smoothstep(-0.2, -0.75, N.y) * (1.0 - lit);
    o = mix(o, o * vec3(1.08, 1.03, 1.0), bounce * 0.6);
    float fres = 1.0 - max(dot(N, V), 0.0);
    // rim: a thin hot edge where the key grazes the silhouette
    float rim = smoothstep(0.62, 0.70, fres) * smoothstep(-0.25, 0.25, ndl) * rimK;
    o = mix(o, col * uSunColor * 1.32 + 0.06, rim * 0.6);
    // tiny hard highlight (nose, buttons, glasses)
    vec3 H = normalize(uKeyDir + V);
    float sp = step(0.975, dot(N, H)) * lit * gloss;
    o = mix(o, vec3(1.0), sp * 0.85);
    return o;
  }
`;

export function furMaterial(o = {}) {
  const u = {
    ...G,
    uColor: { value: new THREE.Color(o.color ?? '#ffffff') },
    uId: { value: o.id ?? 40 },
    uFur: { value: o.fur ?? 1 },
    uRim: { value: o.rim ?? 1 },
    uGloss: { value: o.gloss ?? 0 },
    uFold: { value: o.fold ?? 0 },
    uAlphaCut: { value: 0 },
  };
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uColor;
    uniform float uId, uFur, uRim, uGloss, uFold;
    varying vec3 vWorld, vNormalW, vNormalV, vCol, vCol2, vLocal;
    varying float vMask;
    varying float vDepth;
    varying vec2 vUv;
    ${LIGHT}
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 V = normalize(cameraPosition - vWorld);
      // hard-edged colour pattern: the mask is smooth per vertex, thresholded per pixel
      vec3 col = uColor * mix(vCol, vCol2, step(0.5, vMask));
      vec3 c = folkLight(col, N, V, uFur, vLocal, uRim, uGloss);
      writeOut(c, 1.0, NV, vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: FUR_VS, fragmentShader: fs, side: o.side ?? THREE.FrontSide });
}

// ------------------------------------------------------------------ anime eye
// The eye is a unit sphere scaled flat (mesh.scale = rx, ry, rz) facing +Z. Everything inside is drawn here:
// the upper lid (skin colour, written with the HEAD's ink id so the ink line follows the lid edge), the lash line,
// the white with the lid's cool shadow, the iris (vertical gradient, light crescent, striations, limbal ring),
// pupil, two highlights and, when wet, a trembling tear line and extra glints.

// glasses lenses: the glare is painted by the surfaces BEHIND the lens (ray from the camera through the lens plane),
// so it needs no transparent mesh and draws no ink outline: warm dusty diagonal streaks, specks and a soft sheen
export const LENS = /* glsl */ `
  uniform vec3 uLC0, uLC1, uLN0, uLN1, uLX0, uLX1;
  uniform vec2 uLR;
  uniform float uLensK;
  vec3 lensOne(vec3 col, vec3 wp, vec3 C, vec3 Nl, vec3 X){
    vec3 ro = cameraPosition, rd = wp - ro; float L = length(rd); rd /= L;
    float dn = dot(rd, Nl); if(abs(dn) < 1e-4) return col;
    float tt = dot(C - ro, Nl) / dn; if(tt <= 0.0 || tt > L - 1e-4) return col;
    vec3 h = ro + rd * tt - C; vec3 Y = normalize(cross(Nl, X));
    vec2 q = vec2(dot(h, X) / uLR.x, dot(h, Y) / uLR.y); float rr = length(q);
    if(rr > 0.97) return col;
    float s = q.x * 0.72 + q.y * 0.69;
    float b1 = smoothstep(0.13, 0.07, abs(s - 0.28)), b2 = smoothstep(0.05, 0.025, abs(s - 0.58));
    float dust = step(0.92, vnoise(q * 38.0)) * 0.45 + smoothstep(0.6, 0.9, vnoise(q * 6.0 + 3.0)) * 0.12;
    float sheen = 0.05 + 0.07 * smoothstep(1.0, 0.2, rr);
    vec3 gc = vec3(1.0, 0.88, 0.64);
    return mix(col, gc * 1.05, clamp((b1 * 0.42 + b2 * 0.6 + dust * 0.4 + sheen) * uLensK, 0.0, 0.85));
  }
  vec3 lensGlare(vec3 col, vec3 wp){
    if(uLensK < 0.01) return col;
    col = lensOne(col, wp, uLC0, uLN0, uLX0);
    return lensOne(col, wp, uLC1, uLN1, uLX1);
  }
`;
export const lensUniforms = () => ({
  uLC0: { value: new THREE.Vector3() }, uLC1: { value: new THREE.Vector3() }, uLN0: { value: new THREE.Vector3(0, 0, 1) }, uLN1: { value: new THREE.Vector3(0, 0, 1) },
  uLX0: { value: new THREE.Vector3(1, 0, 0) }, uLX1: { value: new THREE.Vector3(1, 0, 0) }, uLR: { value: new THREE.Vector2(0.05, 0.06) }, uLensK: { value: 0 },
});

export function eyeMaterial(o = {}) {
  const u = {
    ...G,
    uSkin: { value: new THREE.Color(o.skin ?? '#c86a3a') },
    uSkinLow: { value: new THREE.Color(o.skinLow ?? o.skin ?? '#c86a3a') },
    uIris: { value: new THREE.Color(o.iris ?? '#3fa58a') },
    uIrisDark: { value: new THREE.Color(o.irisDark ?? '#173c3a') },
    uIrisLight: { value: new THREE.Color(o.irisLight ?? '#a8f0d0') },
    uLash: { value: new THREE.Color(o.lash ?? '#2a1a22') },
    uId: { value: o.id ?? 42 },
    uSkinId: { value: o.skinId ?? 41 },
    uSide: { value: o.side ?? 1 },          // +1 left eye (character's left = screen right when facing camera), -1 right
    uLidT: { value: 0 },                     // upper lid closure 0 open .. 1 shut
    uLidB: { value: 0 },                     // lower lid raise 0..1
    uTilt: { value: 0 },                     // + worried (inner corner up), - angry (inner corner down)
    uLook: { value: new THREE.Vector2(0, 0) },
    uPupil: { value: o.pupil ?? 0.42 },
    uIrisR: { value: o.irisR ?? 0.6 },
    uWet: { value: 0 },
    uDetail: { value: o.detail ?? 0 },
    uShine: { value: 1 },
    uLashW: { value: o.lashW ?? 0.15 },
    uRound: { value: o.round ?? 0 },         // 1 = no lid arch (glasses / round eyes)
    uPatch: { value: o.patch ? 1 : 0 },      // 1 = the eye is a patch of the face skin: lid/skin pixels are discarded (skin shows)
    uRefl: { value: 0 },                     // the giant's head reflected in the iris (dark disc + bright slit)
    ...lensUniforms(),
  };
  const vs = /* glsl */ `
    varying vec3 vLocal;
    ${VERT_STD}
    void main(){ vLocal = position; stdVertex(position, normal); }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uSkin, uSkinLow, uIris, uIrisDark, uIrisLight, uLash;
    uniform float uId, uSkinId, uSide, uLidT, uLidB, uTilt, uPupil, uIrisR, uWet, uDetail, uShine, uLashW, uRound, uPatch, uRefl;
    ${LENS}
    uniform vec2 uLook;
    varying vec3 vWorld, vNormalW, vNormalV, vLocal;
    varying float vDepth;
    varying vec2 vUv;
    ${LIGHT}
    float ell(vec2 p, vec2 c, vec2 r){ return length((p - c) / r); }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      vec3 V = normalize(cameraPosition - vWorld);
      vec2 p = vLocal.xy;
      // x mirrored so +x is always toward the OUTER corner
      float xo = p.x * uSide;
      float t = uDrawTime;
      // ---- lid edges
      float arch = mix(0.30, 0.08, uRound);
      float yU = mix(1.02, -0.62, uLidT) - arch * xo * xo * (1.0 - 0.7 * uLidT) + uTilt * (-xo) * 0.35 * (1.0 - uLidT)
                 + 0.06 * xo * (1.0 - uRound);
      float yL = mix(-0.9, -0.3, uLidB) + 0.42 * xo * xo * (1.0 - uRound * 0.5) - 0.06 * xo;
      if(uLidT > 0.98) yU = -0.62 - 0.12 * xo * xo;
      bool skin = p.y > yU || p.y < yL || vLocal.z < 0.05 || length(p * vec2(1.0, 0.97)) > 1.0;
      float flick = step(0.6, xo) * step(abs(p.y - (yU + 0.02 + (xo - 0.6) * 0.55)), 0.075) * (1.0 - uLidT) * step(0.0, vLocal.z) * (1.0 - uRound);
      if(skin && flick > 0.5){
        writeOut(uLash, 1.0, NV, vDepth, uId);
        return;
      }
      // lash band drawn just above the lid edge too (bold upper line), only on the patch eyes
      float lwOut = uLashW * 0.55 * (1.0 + 0.8 * smoothstep(0.2, 0.95, xo)) * step(abs(xo), 1.02) * (1.0 - uLidT * 0.3);
      if(skin && uPatch > 0.5 && p.y > yU && p.y < yU + lwOut && length(p * vec2(0.98, 0.9)) < 1.08){
        writeOut(uLash, 1.0, NV, vDepth, uId);
        return;
      }
      if(skin && uPatch > 0.5) discard;
      if(skin){
        vec3 c = folkLight(p.y < yL + 0.02 ? uSkinLow : uSkin, N, V, 1.0, vLocal * 0.06, 0.6, 0.0);
        writeOut(c, 1.0, NV, vDepth, uSkinId);
        return;
      }
      // ---- white
      vec3 col = vec3(0.985, 0.975, 1.0);
      float lidSh = smoothstep(0.42, 0.18, yU - p.y);
      col = mix(col, vec3(0.80, 0.80, 0.95), lidSh * 0.9);
      col = mix(col, vec3(0.90, 0.89, 0.98), smoothstep(0.25, 0.0, p.y - yL) * 0.6);
      // ---- iris
      vec2 c0 = uLook * vec2(0.42, 0.3);
      vec2 d = (p - c0) / vec2(uIrisR * 0.88, uIrisR);
      float r = length(d);
      if(r < 1.0){
        float v = clamp(0.5 - d.y * 0.5, 0.0, 1.0);          // 0 top .. 1 bottom
        vec3 ic = mix(uIrisDark, uIris, smoothstep(0.05, 0.75, v));
        // light crescent in the lower half
        float cres = smoothstep(0.45, 0.75, r) * smoothstep(0.98, 0.8, r) * smoothstep(0.0, -0.5, d.y);
        ic = mix(ic, uIrisLight, cres * 0.85);
        // radial striations (strong in the extreme close-up)
        float a = atan(d.y, d.x);
        float st = vnoise(vec2(a * 9.0, r * 2.5)) * 0.6 + vnoise(vec2(a * 23.0, r * 5.0)) * 0.4;
        ic *= mix(1.0, 0.78 + 0.4 * st, 0.35 + 0.65 * uDetail);
        // collarette ring around the pupil
        float coll = smoothstep(0.08, 0.0, abs(r - uPupil * 1.55)) * uDetail;
        ic = mix(ic, uIrisLight, coll * 0.5);
        // limbal ring
        ic = mix(ic, uIrisDark * 0.55, smoothstep(0.84, 0.95, r));
        col = ic;
        // lid shadow over the iris top
        col = mix(col, col * vec3(0.55, 0.55, 0.75), lidSh * 0.85);
        // pupil
        float pr = uPupil;
        if(r < pr){ col = mix(vec3(0.05, 0.04, 0.08), uIrisDark * 0.25, smoothstep(pr * 0.6, pr, r) * 0.6); }
        else col = mix(col, vec3(0.08, 0.06, 0.1), smoothstep(pr + 0.06, pr, r) * 0.5);
        // reflection of the giant: a dark round head with a bright vertical slit (grows as the pupil shrinks)
        if(uRefl > 0.01){
          vec2 rq = (d - vec2(0.04, 0.16)) / (0.44 * uRefl + 0.001);
          float head = smoothstep(1.0, 0.9, length(rq * vec2(1.0, 0.92)));
          float shoulders = smoothstep(0.06, -0.02, rq.y + 1.12 - 0.22 * rq.x * rq.x) * smoothstep(2.6, 2.3, abs(rq.x));
          // the bright sky mirrored on the cornea first, so the dark silhouette has something to stand against
          float sky = smoothstep(-1.25, -0.95, rq.y) * smoothstep(1.0, 0.8, r);
          col = mix(col, mix(uIrisLight, vec3(0.86, 0.9, 1.0), 0.5) * 0.95, sky * 0.62 * uRefl);
          col = mix(col, uIrisDark * 0.12, max(head, shoulders) * 0.94 * uRefl);
          float slit = smoothstep(0.11, 0.05, abs(rq.x)) * smoothstep(0.62, 0.45, abs(rq.y + 0.05));
          col = mix(col, vec3(1.0, 0.96, 0.78) * 1.3, slit * head * uRefl);
        }
      }
      // ---- highlights (fixed to the eye like painted cels), shiver when wet
      vec2 sh = vec2(sin(t * 37.0), cos(t * 29.0)) * 0.015 * uWet;
      // (the main highlight shrinks and slides to the rim while the giant's reflection fills the iris)
      float h1 = ell(p, c0 + vec2(-0.34 - 0.24 * uRefl, 0.36 + 0.2 * uRefl) * uIrisR + sh, vec2(0.24, 0.30) * uIrisR * (1.0 + 0.35 * uWet) * (1.0 - 0.5 * uRefl));
      float h2 = ell(p, c0 + vec2(0.30, -0.38) * uIrisR - sh, vec2(0.11, 0.11) * uIrisR * (1.0 + 0.4 * uWet));
      float hl = max(step(h1, 1.0), step(h2, 1.0)) * uShine;
      // a third tiny glint when wet
      float h3 = ell(p, c0 + vec2(-0.05, -0.62) * uIrisR + sh * 2.0, vec2(0.08, 0.06) * uIrisR);
      hl = max(hl, step(h3, 1.0) * uWet);
      col = mix(col, vec3(1.0), hl * 0.96);
      // ---- tears: a bright wobbling line welling on the lower lid
      float wob = yL + 0.13 + 0.035 * sin(p.x * 9.0 + t * 6.0);
      float tear = smoothstep(0.13, 0.02, abs(p.y - wob)) * uWet;
      col = mix(col, col * vec3(0.62, 0.8, 1.0) + vec3(0.04, 0.1, 0.2), tear * 0.85);      // a thick welling band of water, tinted so it reads on the white
      float men = smoothstep(0.022, 0.006, abs(p.y - wob - 0.11)) * uWet;
      col = mix(col, vec3(0.22, 0.36, 0.62), men * 0.8);                                  // dark meniscus edge on top of the water
      float tHi = smoothstep(0.03, 0.0, abs(p.y - wob - 0.06)) * smoothstep(0.9, 0.3, abs(p.x)) * uWet;
      col = mix(col, vec3(1.0), tHi * 0.97);                                              // its bright glossy rim
      col = mix(col, col * 1.06 + vec3(0.02, 0.04, 0.06), uWet * 0.4);
      // ---- lashes: thick upper line, flick at the outer corner; thin lower line on the outer half
      float lw = uLashW * (1.0 + 0.7 * smoothstep(0.2, 0.95, xo));
      float lash = step(yU - p.y, lw);
      float low = step(p.y - yL, 0.05) * smoothstep(-0.2, 0.3, xo);
      col = mix(col, uLash, max(lash, low * 0.9));
      // eyes stay bright; only a gentle cool tone in deep shadow
      float ndl = dot(N, uKeyDir);
      col *= mix(vec3(0.86, 0.87, 0.97), vec3(1.0), smoothstep(-0.6, 0.0, ndl));
      col = lensGlare(col, vWorld);
      writeOut(col, 1.0, NV, vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.FrontSide });
}

// ------------------------------------------------------------------ head skin
// Colour regions are analytic curves in head space (R units), anti-aliased per pixel: clean designed boundaries.
// The mouth is painted on the muzzle (opens, smiles/frowns, cat 'w' + philtrum), sockets get a soft shade,
// and in the extreme close-up (uDetail) the fur gets fine strands.
// patterns: 0 plain, 1 fox (white jaw/cheeks under a curve), 2 muzzle patch, 3 raccoon mask, 4 badger stripes,
//           5 light front face, 6 wool cap (sheep), 7 cat/lynx muzzle patch + ruff
export function headMaterial(o = {}) {
  const u = {
    ...G,
    uR: { value: o.R ?? 0.17 },
    uBase: { value: new THREE.Color(o.base ?? '#c08060') },
    uLight: { value: new THREE.Color(o.light ?? '#fff4e8') },
    uDark: { value: new THREE.Color(o.dark ?? '#3a2a26') },
    uBlush: { value: new THREE.Color(o.blush ?? '#ff8a7a') },
    uBlushK: { value: o.blush ? 0.45 : 0 },
    uLine: { value: new THREE.Color(o.line ?? '#2a1a22') },
    uPat: { value: o.pat ?? 2 },
    uP: { value: new THREE.Vector4(...(o.p ?? [0.5, -0.3, 0.38, 0])) },
    uEye0: { value: new THREE.Vector3() }, uEye1: { value: new THREE.Vector3() }, uEyeS: { value: new THREE.Vector2(0.34, 0.42) },
    uMouthC: { value: new THREE.Vector4(-0.4, 0.3, 0.2, -0.3) },   // y, zmin, half width, nose bottom y (R units)
    uMouth: { value: 0 }, uSmile: { value: 1 }, uYMouth: { value: o.ymouth ?? 0 },
    uDetail: { value: 0 },
    uShOff: { value: (o.R ?? 0.17) * 2.6 },
    uTear: { value: 0 }, uYMouthK: { value: 1 }, uNarrow: { value: 0 },
    ...lensUniforms(),
    uId: { value: o.id ?? 41 },
  };
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform float uR, uPat, uBlushK, uMouth, uSmile, uYMouth, uDetail, uId, uTear, uYMouthK, uNarrow;
    ${LENS}
    uniform vec3 uBase, uLight, uDark, uBlush, uLine, uEye0, uEye1;
    uniform vec2 uEyeS;
    uniform vec4 uP, uMouthC;
    varying vec3 vWorld, vNormalW, vNormalV, vCol, vCol2, vLocal;
    varying float vMask;
    varying float vDepth;
    varying vec2 vUv;
    ${LIGHT}
    float aa(float e){ float w = fwidth(e) * 0.8 + 1e-5; return smoothstep(-w, w, e); }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 p = vLocal / uR;
      float ax = abs(p.x);
      vec3 c = uBase;
      float lightM = 0.0, darkM = 0.0;
      if(uPat > 0.5 && uPat < 1.5){
        // fox: white below a curve that runs along the muzzle side, dips under the eyes, flares out to the cheek tufts
        float yl = uP.x + uP.y * smoothstep(0.18, 0.72, ax) * (1.0 - smoothstep(0.7, 1.0, p.z)) + uP.w * max(p.z - 0.5, 0.0) + uP.z * smoothstep(0.8, 1.2, ax);   // follows the upturned muzzle
        lightM = aa(yl - p.y);
      } else if(uPat > 1.5 && uPat < 7.5 && uPat != 6.0){
        vec2 q = vec2(p.x / uP.x, (p.y - uP.y) / uP.z);
        lightM = aa(1.0 - length(q)) * aa(p.z - 0.05);
        lightM = max(lightM, aa(-0.62 - p.y + 0.35 * max(p.z, 0.0)) * aa(p.z + 0.2));    // chin / throat
        if(uPat > 6.5){
          // lynx: cream lower face and ruff; the boundary sweeps down toward the back of the head
          lightM = max(lightM, aa(-0.14 + 0.08 * ax - 0.9 * max(-0.05 - p.z, 0.0) - p.y));
        }
        if(uPat > 4.5 && uPat < 5.5) lightM = max(lightM, aa(p.z - 0.5));
      }
      c = mix(c, uLight, lightM);
      c = mix(c, uDark, darkM);
      if(uPat > 2.5 && uPat < 3.5){
        // raccoon mask: a dark band through the eyes
        float band = aa(0.2 - abs(p.y - 0.12 + 0.18 * p.x * p.x)) * aa(ax - 0.1) * aa(p.z - 0.1);
        c = mix(c, uDark, band);
      }
      if(uPat > 3.5 && uPat < 4.5){
        // badger: white blaze, black bands over the eyes to the ears, white cheeks
        float zone = aa(p.y + 0.12 - 0.15 * ax) * aa(p.z + 0.5);
        float blaze = aa(0.17 + 0.05 * p.z - ax);
        float bandM = aa(ax - (0.17 + 0.05 * p.z)) * aa(0.66 - ax) * zone;
        c = mix(c, uLight, blaze * zone);
        c = mix(c, uDark, bandM);
      }
      if(uPat > 5.5 && uPat < 6.5){
        // sheep: dark face, wool everywhere else
        float faceM = aa(p.z - 0.3) * aa(0.42 - p.y + 0.25 * p.z) * aa(0.78 - ax);
        c = mix(uLight, uBase, faceM);
      }
      // blush
      // blush: a soft gradient with three short diagonal hatch strokes (anime cheek), not a hard decal
      {
        vec2 bq = vec2((ax - 0.56) / 0.17, (p.y + 0.22) / 0.1);
        float bl = (1.0 - smoothstep(0.0, 1.0, length(bq))) * aa(p.z - 0.25);
        c = mix(c, uBlush, bl * uBlushK * 0.7);
        float hs = 1e3;
        for(int i = -1; i <= 1; i++){ float cx = float(i) * 0.5; hs = min(hs, abs(bq.x - cx - 0.35 * bq.y) + 0.0 * cx); }
        float hatch = aa(0.07 - hs) * aa(0.55 - abs(bq.y)) * aa(1.25 - abs(bq.x)) * aa(p.z - 0.25);
        c = mix(c, uBlush * 0.82, hatch * uBlushK * 1.5);
      }
      // fine fur strands (extreme close-up only)
      if(uDetail > 0.5){
        vec2 fl = normalize(vec2(p.x, p.y + 0.8) + 1e-4);
        float s1 = vnoise(vec2(dot(p.xy, fl) * 9.0, dot(p.xy, vec2(-fl.y, fl.x)) * 150.0));
        c *= 0.9 + 0.18 * s1;
      }
      vec3 col = folkLight(c, N, V, 0.4, vLocal, 1.0, 0.0);
      // eye sockets: soft shade above the eye, lid crease in close-ups
      for(int i = 0; i < 2; i++){
        vec3 e = i == 0 ? uEye0 : uEye1;
        vec2 q = (p.xy - e.xy) / uEyeS;
        float L = length(q);
        float sock = smoothstep(1.55, 1.08, L) * smoothstep(-0.2, 0.5, q.y) * step(0.0, p.z);
        col *= 1.0 - sock * (0.1 + 0.2 * uDetail);
        float crease = (1.0 - smoothstep(0.0, 0.045, abs(L - 1.2))) * smoothstep(0.25, 0.6, q.y) * uDetail * step(0.0, p.z);
        col = mix(col, uLine, crease * 0.65);
      }
      // mouth, painted on the muzzle (front projection)
      float id = uId;
      if(p.z > uMouthC.y){
        float mw = uMouthC.z * (1.0 - 0.45 * uNarrow);
        float mx = p.x / mw, my = (p.y - uMouthC.x) / mw;
        float axm = abs(mx);
        float wsh = uYMouth * uYMouthK * 0.3 * (1.0 - pow(abs(axm * 2.0 - 1.0), 2.0)) * step(axm, 1.0);
        float cy = uSmile * 0.32 * mx * mx - wsh;
        float open = uMouth * 1.05 * max(0.0, 1.0 - mx * mx);
        float inside = step(axm, 1.0) * step(cy - open, my) * step(my, cy + 0.05) * step(0.03, uMouth);
        if(inside > 0.5){
          vec3 mc = my < cy - open + 0.42 * open ? vec3(0.88, 0.44, 0.48) : vec3(0.3, 0.09, 0.13);
          col = folkLight(mc, N, V, 0.0, vLocal, 0.0, 0.0);
          id = 44.0;
        } else {
          float lw = 0.07 * (1.0 - 0.6 * smoothstep(0.6, 1.0, axm));
          float ln = step(abs(my - cy), lw) * step(axm, 1.0);
          float ph = uYMouth * step(abs(mx), 0.06 / (1.0 - 0.45 * uNarrow)) * step(cy, my) * step(p.y, uMouthC.w);
          col = mix(col, uLine, max(ln, ph) * 0.9);
        }
      }
      // a single tear rolling down the cheek under eye 1: a glossy drop and the wet trail behind it
      if(uTear > 0.001 && p.z > 0.2){
        vec3 e = uEye1; float sx = sign(e.x);
        float y0 = e.y - uEyeS.y * 1.02, x0 = e.x + 0.05 * sx;
        float yd = y0 - 0.25 * uTear, xd = x0 + 0.05 * sx * uTear;
        float xt = mix(x0, xd, clamp((y0 - p.y) / max(y0 - yd, 1e-3), 0.0, 1.0));
        float trail = step(yd, p.y) * step(p.y, y0) * smoothstep(0.024, 0.01, abs(p.x - xt));
        col = mix(col, vec3(0.92, 0.96, 1.0), trail * 0.6);
        float dr = length((p.xy - vec2(xd, yd)) / vec2(0.045, 0.06));
        float drop = smoothstep(1.0, 0.85, dr) * smoothstep(0.0, 0.08, uTear);
        vec3 dc = mix(vec3(0.62, 0.78, 0.95), vec3(0.95, 0.99, 1.0), smoothstep(-0.8, 0.6, (p.y - yd) / 0.06));
        col = mix(col, dc, drop * 0.92);
        float dh = smoothstep(0.35, 0.15, length((p.xy - vec2(xd - 0.014, yd + 0.022)) / vec2(0.045, 0.06)));
        col = mix(col, vec3(1.0), dh * drop);
        if(drop > 0.5) id = 59.0;   // ink outlines the drop
      }
      col = lensGlare(col, vWorld);
      writeOut(col, 1.0, NV, vDepth, id);
    }
  `;
  const vs = /* glsl */ `
    varying vec3 vLocal;
    varying vec3 vCol, vCol2;
    varying float vMask;
    ${VERT_STD}
    void main(){ vLocal = position; vCol = vec3(1); vCol2 = vec3(1); vMask = 0.0; stdVertex(position, normal); }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs });
}
