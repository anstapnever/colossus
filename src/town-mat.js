import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { PAINT_LIGHT } from './bgmaterials.js';

// Town department materials: sun-bleached stucco, glazed domes, sandstone wall, limestone
// paving, the canal water and the fields outside. All painted (gouache) unless an id is given.
export const TU = {
  uWind: { value: 0 },          // laundry / awning gust 0..1
  uCrack: { value: new THREE.Vector4(-24, 50, -300, 0) },   // grip crack centre + radius
  uInkFar: { value: 140 },      // beyond this distance inked town surfaces fall back to painted
  uHit: { value: 0 },
  uDbg: { value: 0 },           // debug view: 1 albedo, 2 light on white
  uShadeDeep: { value: 0 },     // extra cel-shadow depth for shots that need a strong cast shadow (s19)
};

function mat(uniforms, vs, fs, opts = {}) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide, ...opts });
}

const HELP = /* glsl */ `
float aaStep(float e, float x, float w){ return smoothstep(e - w, e + w, x); }
float box2(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
// arched opening SDF: width w, height of the straight jamb h0, semicircle on top. p.y from sill
float archSD(vec2 p, float w, float h0){
  float r = w * 0.5;
  float dr = box2(p - vec2(0.0, h0 * 0.5), vec2(r, h0 * 0.5));
  float dc = length(p - vec2(0.0, h0)) - r;
  return p.y > h0 ? min(dc, max(dr, 0.0) + 1e3 * step(h0, p.y)) : dr;
}
vec2 voro2(vec2 p){
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y)); vec2 o = hash22(i + g);
    vec2 r = g + o - f; float d = dot(r, r);
    if(d < d1){ d2 = d1; d1 = d; } else if(d < d2) d2 = d;
  }
  return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
}
`;

// ---------------------------------------------------------------- town surfaces
export function townMaterial(o = {}) {
  const u = {
    ...G,
    uId: { value: o.id ?? 0 },
    uInk: { value: o.ink ?? 0 },
    uWind: TU.uWind, uCrack: TU.uCrack, uInkFar: TU.uInkFar, uDbg: TU.uDbg, uShadeDeep: TU.uShadeDeep,
    uSandFar: { value: o.sandFar ?? 0 },
  };
  const vs = /* glsl */ `
    attribute vec3 aCol;
    attribute vec3 aCol2;
    attribute vec4 aP;
    attribute vec4 aE;
    flat varying vec3 vCol, vCol2;
    flat varying vec4 vP, vE;
    uniform float uWind, uDrawTime;
    ${VERT_STD}
    void main(){
      vCol = aCol; vCol2 = aCol2; vP = aP; vE = aE;
      vec3 p = position;
      float kind = floor(aP.x + 0.5);
      if(kind == 10.0){
        // laundry: hangs from the line (v = metres below the line); sways, whips in the gust
        float hang = max(-uv.y, 0.0);
        float ph = aP.y * 6.283 + p.x * 0.4 + p.z * 0.3;
        float sw = sin(uDrawTime * 2.1 + ph) * 0.05 + sin(uDrawTime * 3.7 + ph * 1.3 + uv.x * 2.0) * 0.03;
        float gust = uWind * (0.9 + 0.5 * sin(uDrawTime * 19.0 + ph + uv.x * 3.0));
        p += normal * hang * (sw + gust * 0.55);
        p.y += hang * gust * 0.25;
      } else if(kind == 6.0){
        float ph = aP.y * 6.283;
        float edge = max(uv.y, 0.0);
        p.y += edge * (sin(uDrawTime * 2.6 + ph + uv.x * 0.7) * 0.015 + uWind * 0.12 * sin(uDrawTime * 23.0 + uv.x * 2.0 + ph));
      }
      stdVertex(p, normal);
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${PAINT_LIGHT}
    ${HELP}
    uniform float uId, uInk, uInkFar, uSandFar, uDbg, uShadeDeep;
    uniform vec4 uCrack;
    varying vec3 vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv;
    flat varying vec3 vCol, vCol2;
    flat varying vec4 vP, vE;

    // ---- whitewashed stucco: soft gouache blotches, lime runs, patches of bare stone
    vec3 stucco(vec3 col, vec2 uv, vec3 w, float seed, float pxm, float Htop){
      float v1 = fbm3(w * 0.13 + seed * 7.0);
      col *= 0.95 + 0.1 * v1;
      // lime-wash layers: slightly warmer and cooler washes in big soft shapes
      float wash = smoothstep(0.45, 0.7, fbm2(uv * vec2(0.18, 0.12) + seed * 3.1));
      col = mix(col, col * vec3(1.02, 0.985, 0.94), wash * 0.6);
      // drips from the roof edge and from every sill
      float drip = vnoise(vec2(uv.x * 1.1 + seed * 3.0, 0.5)) * vnoise(vec2(uv.x * 4.3 + seed, 2.0));
      float fromTop = Htop - uv.y;
      float runs = smoothstep(0.25, 0.5, drip) * smoothstep(0.0, 0.5, fromTop) * exp(-fromTop / (1.5 + 4.0 * vnoise(vec2(uv.x * 0.7, seed))));
      col = mix(col, col * vec3(0.87, 0.86, 0.9), runs * 0.55);
      // bare stone where the plaster fell off: warm sand ashlar, a crisp chipped rim
      float pn = fbm2(uv * vec2(0.62, 0.8) + seed * 11.0) + 0.14 * vnoise(uv * 3.0);
      float bare = aaStep(0.8, pn, pxm * 0.6 + 0.004);
      float rim = aaStep(0.775, pn, pxm * 0.6 + 0.004) - bare;
      vec2 bq = uv / vec2(0.62, 0.3); bq.x += floor(bq.y) * 0.5;
      vec2 bf = fract(bq);
      float joint = 1.0 - aaStep(0.09, min(min(bf.x, 1.0 - bf.x) * 0.62 / 0.3, min(bf.y, 1.0 - bf.y)), pxm / 0.3);
      vec3 stone = vec3(0.9, 0.79, 0.65) * (0.92 + 0.12 * hash12(floor(bq) + seed));
      stone = mix(stone, stone * 0.82, joint);
      col = mix(col, stone, bare);
      col = mix(col, col * 0.78, rim * 0.8);
      // hairline cracks
      float cr = abs(fbm2(uv * vec2(0.8, 0.5) + seed * 5.0) - 0.5);
      float crack = (1.0 - smoothstep(0.004, 0.004 + pxm * 0.4, cr)) * step(0.6, vnoise(uv * 0.35 + seed));
      col = mix(col, col * 0.7, crack * (1.0 - smoothstep(0.03, 0.08, pxm)));
      // foot of the wall: splash dirt and a cool damp band
      col = mix(col, col * vec3(0.84, 0.82, 0.86), (1.0 - smoothstep(0.0, 0.9 + 0.5 * vnoise(vec2(uv.x * 1.3, seed)), w.y)) * 0.7);
      return col;
    }

    // ---- sandstone ashlar of the great wall: courses, staggered blocks, streaks, patches
    vec3 sandstone(vec3 col, vec2 uv, vec3 w, float seed, float pxm, float course, float topY){
      float ch = course;
      float row = floor(uv.y / ch);
      float fy = fract(uv.y / ch);
      float bl = (1.6 + 1.6 * hash12(vec2(row, seed))) * ch / 1.05;
      float off = hash12(vec2(row, seed + 3.0)) * bl;
      float bx = (uv.x + off) / bl;
      float bid = floor(bx);
      float fx = fract(bx);
      vec2 id = vec2(bid, row);
      float h1 = hash12(id + seed), h2 = hash12(id * 1.7 + 4.0 + seed), h3 = hash12(id * 2.3 + 9.0);
      // block tone: pinkish ochre to pale sand, a few older darker or repaired cooler blocks
      vec3 c = col * (0.93 + 0.11 * h1);
      c = mix(c, c * vec3(1.05, 0.97, 0.9), step(0.7, h2) * 0.8);
      c = mix(c, c * vec3(0.93, 0.95, 1.02), step(0.92, h3));
      float fineK = 1.0 - smoothstep(0.03, 0.14, pxm);       // block pattern visible
      float midK = 1.0 - smoothstep(0.14, 0.6, pxm);
      // pitted surface and soft bevel: lit top edge, shaded lower lip
      float pit = vnoise(uv * 7.0 + seed);
      c *= 0.96 + 0.07 * pit * fineK;
      float jw = max(0.035, pxm * 0.7);
      float jx = min(fx, 1.0 - fx) * bl, jy = min(fy, 1.0 - fy) * ch;
      float joint = 1.0 - smoothstep(jw * 0.5, jw, min(jx, jy));
      float topLip = smoothstep(ch * 0.82, ch * 0.95, fy * ch) * (1.0 - joint);
      float botLip = (1.0 - smoothstep(0.0, ch * 0.16, fy * ch)) * (1.0 - joint);
      c = mix(c, c * 1.08 + 0.02, topLip * 0.6 * fineK);
      c = mix(c, c * vec3(0.86, 0.85, 0.92), botLip * 0.55 * fineK);
      // eroded corners: rounded dark nicks at block corners
      vec2 cq = vec2(min(fx, 1.0 - fx) * bl, min(fy, 1.0 - fy) * ch);
      float nick = (1.0 - smoothstep(0.08, 0.16, length(cq))) * step(0.55, h3);
      c = mix(c, c * 0.78, nick * fineK);
      c = mix(c, c * vec3(0.78, 0.75, 0.82), joint * mix(0.2, 1.0, fineK) * midK);
      // course lines survive further away as faint bands
      float rowBand = 1.0 - smoothstep(0.0, clamp(fwidth(uv.y / ch) * 1.5, 0.02, 0.5), min(fy, 1.0 - fy));
      c = mix(c, c * 0.9, rowBand * (1.0 - fineK) * (1.0 - smoothstep(0.6, 2.0, pxm)) * 0.6);
      // rain streaks from the top and from the merlons
      float sx = uv.x * 0.6 + seed;
      float sN = vnoise(vec2(sx, 0.0)) * 0.6 + vnoise(vec2(sx * 3.1, 1.0)) * 0.4;
      float fromTop = topY - uv.y;
      float streak = smoothstep(0.55, 0.75, sN) * exp(-max(fromTop, 0.0) / (8.0 + 22.0 * vnoise(vec2(sx * 0.5, 5.0))));
      c = mix(c, c * vec3(0.8, 0.78, 0.84), streak * 0.5);
      // broad weather: darker lower courses, sun-bleached upper courses, big soft mottling
      float mott = fbm2(uv * vec2(0.035, 0.05) + seed);
      c *= 0.92 + 0.14 * mott;
      c = mix(c * vec3(0.9, 0.88, 0.9), c, smoothstep(0.0, 7.0, w.y));
      c = mix(c, c * vec3(1.03, 1.02, 1.0), smoothstep(25.0, 45.0, w.y) * 0.6);
      // lichen spots, warm ochre and grey-green
      float li = step(0.78, fbm2(uv * 0.5 + seed * 2.0)) * step(0.5, vnoise(uv * 2.5));
      c = mix(c, mix(c, vec3(0.78, 0.66, 0.36), 0.5), li * 0.5);
      return c;
    }

    vec3 windows(vec3 col, vec2 uv, float seed, float fh, float sp, float pxm, float Htop, out float glass){
      glass = 0.0;
      vec2 cell = vec2(uv.x / sp, uv.y / fh);
      vec2 cid = floor(cell);
      vec2 f = fract(cell);
      float r1 = hash12(cid + seed * 13.1), r2 = hash12(cid + seed * 7.7 + 3.1), r3 = hash12(cid * 1.7 + seed);
      float hs = hash12(vec2(seed, 2.2)), hs2 = hash12(vec2(seed, 5.7));
      vec2 lp = vec2((f.x - 0.5) * sp, f.y * fh);       // metres from the cell's centre-bottom
      float detail = 1.0 - smoothstep(0.035, 0.11, pxm);
      float ground = step(cid.y, 0.5);
      float topFloor = step(Htop - (cid.y + 1.0) * fh, 0.6);
      // window sizes per house: tall arched, small square, or paired
      float ww = mix(0.85, 1.25, hs) * (ground > 0.5 ? 1.0 : 1.0);
      float sill = ground > 0.5 ? 0.0 : 0.85 + 0.2 * hs2;
      float h0 = ground > 0.5 ? 1.75 + 0.25 * hs : 1.0 + 0.35 * hs2;
      float isDoor = ground * step(0.5, r1);
      float shop = ground * step(0.78, r2) * (1.0 - isDoor);
      if(ground > 0.5){ ww = isDoor > 0.5 ? 1.25 : (shop > 0.5 ? min(sp - 0.6, 2.6) : ww); sill = isDoor + shop > 0.5 ? 0.0 : 0.95; h0 = isDoor + shop > 0.5 ? 1.95 : 1.1; }
      float blank = step(0.86, r3) * (1.0 - ground) + step(Htop - cid.y * fh, 1.8);
      float arch = archSD(lp - vec2(0.0, sill), ww, h0);
      float open = (1.0 - aaStep(0.0, arch, pxm)) * (1.0 - blank);
      float frame = (1.0 - aaStep(0.11, arch, pxm)) * (1.0 - open) * (1.0 - blank);
      // reveal shadow inside the opening: deep at the top of the arch and the sun side
      float rev = (1.0 - aaStep(-0.12, arch, pxm)) * open;
      // interior / glass: deep cool blue-violet with a pale reflection
      float gy = (lp.y - sill) / (h0 + ww * 0.5);
      vec3 inside = mix(vec3(0.2, 0.22, 0.38), vec3(0.32, 0.36, 0.52), smoothstep(0.0, 1.0, gy)) * (0.85 + 0.25 * r3);
      vec3 refl = mix(vec3(0.55, 0.7, 0.88), vec3(0.85, 0.92, 0.98), gy);
      float band = smoothstep(0.45, 0.55, gy + lp.x * 0.25 + (r2 - 0.5) * 0.4) * step(0.35, r1);
      vec3 glassC = mix(inside, refl, band * 0.65);
      // muntins in the glass
      float mun = (1.0 - aaStep(0.025, abs(lp.x), pxm * 0.5)) + (1.0 - aaStep(0.025, abs(lp.y - sill - h0 * 0.55), pxm * 0.5));
      glassC = mix(glassC, vec3(0.92, 0.94, 0.96), clamp(mun, 0.0, 1.0) * detail * (1.0 - ground));
      // cobalt shutters: open (flanking) / closed / half; louvres; or a painted door
      vec3 shC = vCol2 * (0.92 + 0.1 * r2);
      float shutMode = hash12(cid * 0.7 + seed * 3.3);
      float closed = step(0.72, shutMode) * (1.0 - shop);
      float louv = step(0.5, fract((lp.y - sill) * 9.0));
      vec3 shutter = mix(shC, shC * 0.8, louv * detail);
      vec3 openC = mix(glassC, shutter, closed);
      // half-drawn curtain
      float cur = step(0.65, r2) * (1.0 - closed) * step(abs(lp.x + (r3 - 0.5) * ww * 0.6), ww * 0.22) * step(lp.y - sill, h0 * 0.9);
      openC = mix(openC, vec3(0.95, 0.9, 0.82), cur * 0.85);
      // door: planks, studs, a fanlight in the arch
      if(isDoor > 0.5){
        float plank = step(0.92, fract((lp.x + ww * 0.5) / 0.21));
        vec3 dc = mix(shC, shC * 0.82, plank * detail);
        float stud = step(length(fract(vec2(lp.x / 0.3, (lp.y) / 0.35)) - 0.5), 0.12) * detail;
        dc = mix(dc, vec3(0.85, 0.75, 0.45), stud * 0.6);
        float fan = step(h0, lp.y) * step(arch, -0.08);
        dc = mix(dc, mix(inside, refl, 0.4), fan);
        float split = 1.0 - aaStep(0.02, abs(lp.x), pxm * 0.5);
        dc = mix(dc, dc * 0.6, split * step(lp.y, h0));
        openC = dc;
      }
      // shop: dark interior, goods hint, a counter
      if(shop > 0.5){
        openC = inside * 0.85;
        float goods = step(0.5, vnoise(vec2(lp.x * 3.0 + r1 * 9.0, floor(lp.y * 3.0)))) * step(lp.y, 1.4) * step(0.3, lp.y);
        vec3 gc = mix(vec3(0.85, 0.55, 0.3), vec3(0.4, 0.6, 0.45), r3);
        openC = mix(openC, gc * 0.7, goods * detail * 0.7);
        float counter = step(lp.y, 0.9) * step(0.75, lp.y);
        openC = mix(openC, vCol * 0.8, counter);
      }
      openC = mix(openC, openC * vec3(0.7, 0.72, 0.86), rev * 0.6 * (1.0 - isDoor));
      // the opened shutter leaves standing beside the window
      float side = abs(lp.x) - ww * 0.5 - 0.07;
      float leaf = step(0.0, side) * step(side, ww * 0.5) * step(sill - 0.02, lp.y) * step(lp.y, sill + h0 + ww * 0.42) * (1.0 - closed) * step(0.3, shutMode) * (1.0 - ground) * (1.0 - blank);
      // sill ledge + its shadow
      float sillL = (1.0 - aaStep(0.06, abs(lp.y - sill + 0.05), pxm * 0.5)) * step(abs(lp.x), ww * 0.5 + 0.12) * (1.0 - ground) * (1.0 - blank);
      float sillS = step(sill - 0.38, lp.y) * step(lp.y, sill - 0.1) * step(abs(lp.x), ww * 0.5 + 0.08) * (1.0 - ground) * (1.0 - blank);
      // potted geraniums on some sills
      float pot = step(0.7, hash12(cid + seed * 9.1)) * (1.0 - ground) * (1.0 - blank);
      vec2 pp = vec2(lp.x - (r1 - 0.5) * ww * 0.6, lp.y - sill);
      float potM = step(abs(pp.x), 0.16) * step(0.0, pp.y) * step(pp.y, 0.22);
      float bloomM = step(length((pp - vec2(0.0, 0.33)) * vec2(1.0, 1.4)), 0.24 + 0.05 * vnoise(pp * 20.0));
      vec3 c = col;
      c = mix(c, c * 1.04 + 0.03, frame * 0.7 * detail);
      c = mix(c, c * vec3(0.84, 0.85, 0.93), sillS * 0.6 * detail);
      c = mix(c, shutter, leaf * detail);
      c = mix(c, openC, open);
      c = mix(c, c * 1.08 + 0.04, sillL * detail);
      vec3 flo = mix(vec3(0.86, 0.18, 0.45), vec3(0.95, 0.4, 0.3), step(0.5, r3));
      flo = mix(flo, vec3(0.32, 0.55, 0.3), step(0.55, vnoise(pp * 28.0)));
      c = mix(c, vec3(0.72, 0.42, 0.3), potM * pot * detail);
      c = mix(c, flo, bloomM * pot * (1.0 - potM) * detail * (1.0 - step(lp.y - sill, 0.2)));
      glass = open * (1.0 - closed) * (1.0 - isDoor);
      // far: rows of openings read as soft value bands
      float aaY = clamp(fwidth(cell.y), 0.001, 0.5), aaX = clamp(fwidth(cell.x), 0.001, 0.5);
      float far = smoothstep(0.08, 0.35, max(aaX, aaY));
      float rowB = smoothstep(0.25, 0.35, f.y) * (1.0 - smoothstep(0.75, 0.85, f.y));
      float colB = 1.0 - smoothstep(0.25, 0.4, abs(f.x - 0.5));
      vec3 farC = mix(col, mix(vCol2, vec3(0.3, 0.32, 0.5), 0.5), 0.35 * mix(rowB * colB, 0.3, smoothstep(0.35, 0.5, max(aaX, aaY))) * (1.0 - blank));
      return mix(c, farC, far);
    }

    void main(){
      float kind = floor(vP.x + 0.5);
      float seed = vP.y;
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW);
      vec3 NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 w = vWorld;
      vec2 uv = vUv;
      float pxm = length(fwidth(w));
      vec3 col = vCol;
      float ao = 1.0;
      float glass = 0.0;
      float gloss = 0.0;
      float Htop = vE.w;
      float wall = 1.0 - smoothstep(0.55, 0.8, abs(N.y));

      if(kind == 0.0){
        col = stucco(col, uv, w, seed, pxm, Htop);
      } else if(kind == 1.0){
        col = stucco(col, uv, w, seed, pxm, Htop);
        // painted plinth band on some houses
        float pl = step(0.55, hash12(vec2(seed, 8.8)));
        col = mix(col, mix(vCol2, col, 0.35) * 0.95, pl * (1.0 - aaStep(0.55 + 0.3 * hash12(vec2(seed, 1.1)), uv.y, pxm)));
        col = windows(col, uv, seed, vP.z, vP.w, pxm, Htop, glass);
      } else if(kind == 2.0){
        // roof terrace: lime plaster, faint square tiles on some, stains from jars and puddles
        float tiled = step(0.68, hash12(vec2(seed, 4.4)));
        vec2 tq = fract(w.xz / 0.5);
        float tj = 1.0 - aaStep(0.04, min(min(tq.x, 1.0 - tq.x), min(tq.y, 1.0 - tq.y)), pxm * 1.5);
        col *= 0.95 + 0.08 * fbm2(w.xz * 0.3 + seed);
        col = mix(col, mix(col, vec3(0.9, 0.88, 0.86), 0.35), tiled);
        col = mix(col, col * 0.88, tj * tiled * (1.0 - smoothstep(0.02, 0.06, pxm)));
        float st = step(0.62, fbm2(w.xz * 0.25 + seed * 3.0));
        col = mix(col, col * vec3(0.88, 0.87, 0.92), st * 0.5);
      } else if(kind == 3.0){
        // glazed dome: tile courses around, ribs down, deep cobalt at the foot to turquoise crown
        float ring = fract(uv.y / 0.32);
        float rib = fract(uv.x / 1.1);
        float hgt = clamp(N.y, 0.0, 1.0);
        vec3 g = mix(vCol2, vCol, smoothstep(0.1, 0.9, hgt));
        g *= 0.93 + 0.1 * hash12(floor(vec2(uv.x / 0.55, uv.y / 0.32)) + seed);
        float jn = (1.0 - aaStep(0.06, min(ring, 1.0 - ring), pxm * 3.0)) + (1.0 - aaStep(0.03, min(rib, 1.0 - rib), pxm * 1.0)) * 0.6;
        g = mix(g, g * 0.8, clamp(jn, 0.0, 1.0) * (1.0 - smoothstep(0.04, 0.12, pxm)));
        col = g;
        gloss = 1.0;
      } else if(kind == 5.0){
        col = sandstone(col, uv, w, seed, pxm, vP.z, vE.w);
        // grip cracks: a few long jagged cracks run out from the fingers, a web near them, chunks out
        float cd = length(w - uCrack.xyz);
        float R = uCrack.w;
        // never on the gate towers (x > -26): cracks stay on the curtain wall under the hand
        // only faint cracks on the walkway top (the colossus dept draws the talon damage on the faces)
        if(R > 0.0 && cd < R + 2.0 && w.x < -26.0 && N.y > 0.6 && w.y < 50.5){
          vec2 cp = (abs(N.y) > 0.6 ? w.xz : vec2(w.x + w.z * 0.3, w.y));
          vec2 c0 = (abs(N.y) > 0.6 ? uCrack.xz : vec2(uCrack.x + uCrack.z * 0.3, uCrack.y));
          vec2 rd = cp - c0;
          float rl = length(rd);
          float ang = atan(rd.y, rd.x);
          // 7 main branches, wandering with distance, thinning toward their tips
          float wob = (fbm2(vec2(rl * 0.18, 3.0)) - 0.5) * 1.6 + (vnoise(vec2(rl * 1.3, 7.0)) - 0.5) * 0.35;
          float br = abs(fract((ang + wob / max(rl, 1.0) * 2.0) / 6.2831 * 7.0 + 0.13) - 0.5) * 6.2831 / 7.0 * rl;
          float reach = R * (0.55 + 0.45 * hash12(vec2(floor((ang + wob / max(rl, 1.0) * 2.0) / 6.2831 * 7.0 + 0.13), 4.0)));
          float bw = mix(0.12, 0.03, clamp(rl / reach, 0.0, 1.0)) + pxm * 0.5;
          float mainC = (1.0 - smoothstep(bw, bw + pxm + 0.02, br)) * step(rl, reach);
          // a web of short cracks close to the grip
          vec2 vo = voro2(cp * 0.7 + vec2(fbm2(cp * 0.6), fbm2(cp * 0.6 + 4.0)) * 0.8);
          float webR = R * 0.38;
          float web = (1.0 - smoothstep(0.03, 0.06 + pxm, vo.y)) * (1.0 - smoothstep(webR * 0.7, webR, rl + (vnoise(cp) - 0.5) * 2.0));
          // chunks knocked out near the fingers: dark hollows with a pale broken rim
          vec2 ch = vo;
          float chunkSel = step(0.6, hash12(floor(cp * 0.7 + vec2(fbm2(cp * 0.6), fbm2(cp * 0.6 + 4.0)) * 0.8) + 1.7)) * step(rl, webR * 0.8);
          float hollow = chunkSel * smoothstep(0.08, 0.14, ch.y);
          float rimC = chunkSel * (1.0 - smoothstep(0.04, 0.08, ch.y)) * smoothstep(0.0, 0.04, ch.y);
          col = mix(col, col * vec3(0.62, 0.56, 0.5), clamp(mainC + web * 0.6, 0.0, 1.0) * 0.6);
          col = mix(col, col * vec3(0.72, 0.66, 0.6), hollow * 0.5);
          col = mix(col, col * 1.08, rimC * 0.5);
          ao *= 1.0 - 0.12 * smoothstep(R, 0.0, rl);
          float clip = smoothstep(-26.0, -27.5, w.x);
          col = mix(sandstone(vCol, uv, w, seed, pxm, vP.z, vE.w), col, clip);
        }
      } else if(kind == 6.0){
        // striped canvas awning
        float s = step(0.5, fract(uv.x / 0.42));
        col = mix(vCol, vCol2, s);
        col *= 0.95 + 0.07 * vnoise(uv * vec2(0.8, 3.0) + seed);
        // scalloped valance darker
        col = mix(col, col * 0.9, smoothstep(0.8, 1.0, uv.y / max(vE.w, 0.01)));
      } else if(kind == 7.0){
        col = vec3(0.2, 0.19, 0.3) * (0.9 + 0.2 * vnoise(w.xy * 0.5 + w.z));
      } else if(kind == 8.0){
        float gr = vnoise(vec2(uv.x * 9.0, uv.y * 0.6 + seed));
        col *= 0.85 + 0.25 * gr;
      } else if(kind == 9.0){
        col *= 0.9 + 0.15 * vnoise(uv * 3.0 + seed);
        float band = step(0.5, fract(uv.y * 2.2)) * step(0.4, uv.y) * step(uv.y, 0.9);
        col = mix(col, col * 0.82, band * 0.4);
      } else if(kind == 10.0){
        float fold = 0.5 + 0.5 * sin(uv.x * 9.0 + seed * 6.0);
        col *= 0.92 + 0.12 * fold;
        float stripe = step(0.6, hash12(vec2(seed, 7.0))) * step(0.5, fract(uv.x * 2.5));
        col = mix(col, vCol2, stripe);
      } else if(kind == 12.0){
        // bronze gate: framed panels, rows of studs, a carved sun in the middle
        vec2 q = uv;                 // metres, u 0..16 across both leaves, v 0..24
        vec3 br = vCol;
        vec2 pc = vec2(q.x / 2.0, (q.y - 1.0) / 2.6);
        vec2 pf = fract(pc);
        float pe = min(min(pf.x, 1.0 - pf.x) * 2.0, min(pf.y, 1.0 - pf.y) * 2.6);
        float frameR = 1.0 - aaStep(0.28, pe, pxm);
        float frameIn = aaStep(0.18, pe, pxm) * frameR;
        br = mix(br, br * 1.18 + vec3(0.05, 0.04, 0.0), frameR * 0.6);
        br = mix(br, br * 0.72, frameIn * 0.5);
        vec2 sc = fract(vec2(q.x / 0.5, q.y / 0.5)) - 0.5;
        float stud = (1.0 - aaStep(0.16, length(sc), pxm * 2.0)) * frameR;
        br = mix(br, vec3(1.0, 0.86, 0.5), stud * 0.7);
        // a solemn carved sun: wedge rays (long and short), engraved rings, fluted disc, a boss
        vec2 sp = q - vec2(8.0, 13.0);
        float r = length(sp);
        float an = atan(sp.y, sp.x) / 6.2831 + 0.5;
        float a24 = fract(an * 24.0);                    // 24 rays, alternate long and short
        float longR = mod(floor(an * 24.0), 2.0) < 0.5 ? 6.6 : 5.3;
        float wedge = abs(a24 - 0.5) * 2.0;              // 0 at ray axis, 1 between rays
        float rayW = mix(0.62, 0.08, clamp((r - 3.6) / (longR - 3.6), 0.0, 1.0)); // tapers to a point
        float rays = (1.0 - aaStep(rayW, wedge, pxm * 2.5 / max(r, 1.0))) * step(3.55, r) * (1.0 - aaStep(longR, r, pxm));
        float rayAxis = (1.0 - aaStep(0.06, wedge, pxm * 2.0 / max(r, 1.0))) * rays;   // central ridge of each ray
        float disc = 1.0 - aaStep(3.4, r, pxm);
        vec3 gold = vec3(0.86, 0.64, 0.3);
        vec3 sunC = mix(gold, br, 0.3);
        br = mix(br, sunC, max(rays, disc));
        br = mix(br, sunC * 1.22 + 0.03, rayAxis * 0.7);                 // lit ridge
        // incised outline of every ray and the disc
        float rayEdge = rays * (1.0 - aaStep(rayW - 0.12, wedge, pxm * 2.5 / max(r, 1.0)));
        br = mix(br, br * 0.62, clamp(rays - rayEdge, 0.0, 1.0) * 0.8);
        // engraved concentric rings
        float rings = (1.0 - aaStep(0.09, abs(r - 3.35), pxm)) + (1.0 - aaStep(0.07, abs(r - 2.75), pxm)) + (1.0 - aaStep(0.07, abs(r - 1.25), pxm));
        br = mix(br, br * 0.5, clamp(rings, 0.0, 1.0));
        // fluting between rings: fine radial grooves
        float flute = (1.0 - aaStep(0.18, abs(fract(an * 48.0) - 0.5) * 2.0, pxm * 6.0 / max(r, 0.5))) * step(1.3, r) * step(r, 2.7);
        br = mix(br, br * 0.74, flute * 0.6);
        // a band of small bosses between the outer rings
        vec2 bq = vec2(fract(an * 36.0) - 0.5, (r - 3.05) / 0.4);
        float bossR = (1.0 - aaStep(0.11, length(bq * vec2(r * 6.2831 / 36.0, 0.4)), pxm)) * step(2.8, r) * step(r, 3.3);
        br = mix(br, sunC * 1.3 + 0.04, bossR * 0.8);
        // central boss: a domed hub with a dark rim and a lit highlight
        float hub = 1.0 - aaStep(1.0, r, pxm);
        float hubHi = 1.0 - aaStep(0.35, length(sp - vec2(-0.3, 0.35)), pxm);
        br = mix(br, sunC * (0.8 + 0.4 * (1.0 - r)), hub);
        br = mix(br, sunC * 1.4 + 0.06, hubHi * 0.6);
        // age: darker recesses around the emblem, patina pooling in the grooves
        float rec = clamp(rings + flute * 0.5 + (rays - rayEdge), 0.0, 1.0);
        br = mix(br, vec3(0.3, 0.56, 0.5), rec * smoothstep(0.4, 0.7, fbm2(q * 1.3 + 3.0)) * 0.6);
        // patina in the recesses, the split between the leaves
        float pat = smoothstep(0.55, 0.75, fbm2(q * 0.6) + frameIn * 0.3 - frameR * 0.2);
        br = mix(br, vec3(0.36, 0.62, 0.55), pat * 0.55);
        float split = 1.0 - aaStep(0.06, abs(q.x - 8.0), pxm);
        br = mix(br, vec3(0.12, 0.1, 0.14), split);
        col = br;
        gloss = 0.6;
      } else if(kind == 13.0){
        col = sandstone(col, uv, w, seed, pxm, vP.z, vE.w);
      } else if(kind == 14.0){
        // carved band: a frieze of rosettes between two fillets
        float v = uv.y - vE.z;
        float H = max(vE.w - vE.z, 0.1);
        float yn = v / H;
        float fil = 1.0 - aaStep(0.08, min(yn, 1.0 - yn), pxm / H);
        vec2 rq = vec2(fract(uv.x / 2.2) - 0.5, yn - 0.5) * vec2(2.2, H);
        float rr = length(rq);
        float ros = (1.0 - aaStep(H * 0.32, rr, pxm)) * (0.6 + 0.4 * step(0.5, fract(atan(rq.y, rq.x) / 6.2831 * 8.0)));
        col *= 0.95 + 0.1 * vnoise(uv * 2.0);
        col = mix(col, col * 1.1 + 0.03, fil);
        col = mix(col, col * 0.78, ros * (1.0 - fil) * (1.0 - smoothstep(0.06, 0.2, pxm)));
        float under = 1.0 - smoothstep(0.0, 0.12, yn);
        col = mix(col, col * vec3(0.84, 0.84, 0.92), under * 0.5);
      } else if(kind == 15.0){
        // broken interior: bare brick and old plaster, dark stains
        float bric = step(0.5, fract(uv.y / 0.25)) ;
        col *= 0.82 + 0.18 * vnoise(uv * 4.0 + seed);
        col = mix(col, col * 0.85, bric * 0.3);
      } else if(kind == 16.0){
        col *= 0.9 + 0.1 * vnoise(uv * 2.0);
        gloss = 0.5;
      } else if(kind == 17.0){
        // painted foliage: two greens in soft clumps, lighter toward the sky
        float lv = vnoise(w.xz * 1.1 + w.y * 0.8 + seed) * 0.6 + 0.4 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
        col = mix(vCol2, vCol, smoothstep(0.3, 0.7, lv));
      }

      // painted height gradient: tops warm and catch more sky, feet cool
      col *= mix(vec3(0.96, 0.97, 1.02), vec3(1.02, 1.01, 0.98), smoothstep(0.0, 18.0, w.y));

      vec3 outc = paintLight(col, N, w, 1.0, ao);
      if(uDbg > 0.5) outc = uDbg < 1.5 ? col : paintLight(vec3(1.0), N, w, 1.0, ao);
      if(uShadeDeep > 0.0){ float shK = smoothstep(0.35, 0.65, 1.0 - sunShadow(w, N)); outc = mix(outc, outc * vec3(0.48, 0.47, 0.7), shK * uShadeDeep); }

      // drawn corner highlights + a cool inner line: gives the cubes their crisp anime edge
      float eOK = step(0.05, vE.y - vE.x) * step(0.05, vE.w - vE.z) * step(vE.x, 9e4) * (1.0 - step(5.5, kind) * step(kind, 12.5) * (1.0 - step(9.5, kind) * step(kind, 10.5)) * 0.0);
      if(eOK > 0.5 && kind != 6.0 && kind != 10.0 && kind != 7.0 && kind != 17.0){
        float dL = uv.x - vE.x, dR = vE.y - uv.x, dB = uv.y - vE.z, dT = vE.w - uv.y;
        float ew = max(0.05, pxm * 1.1);
        float side = min(dL, dR);
        float eSide = 1.0 - smoothstep(ew, ew + pxm, side);
        float eTop = 1.0 - smoothstep(ew * 0.9, ew * 0.9 + pxm, dT);
        float eRim = 1.0 - smoothstep(ew, ew + pxm, min(min(dL, dR), min(dB, dT)));
        float hi = mix(eRim * step(0.5, N.y), max(eSide, eTop), wall);
        float inner = wall * (1.0 - smoothstep(ew * 2.6, ew * 2.6 + pxm, side)) * (1.0 - eSide) * (1.0 - eTop);
        float litK = smoothstep(-0.03, 0.15, dot(N, uSunDir));
        float fadeE = 1.0 - smoothstep(0.15, 0.6, pxm);
        vec3 hiC = outc * (1.16 + 0.16 * litK) + mix(uSkyTint * 0.04, uSunColor * 0.07, litK);
        outc = mix(outc, hiC, hi * 0.75 * fadeE);
        outc = mix(outc, outc * mix(vec3(0.88, 0.89, 0.97), vec3(0.95), litK), inner * 0.6 * fadeE);
        // contact shadow under the roof edge / parapet
        float under = wall * (1.0 - smoothstep(0.0, 0.35 + pxm, dT)) * step(0.3, dT) * 0.0;
        outc *= 1.0 - under;
      }
      vec3 V = normalize(cameraPosition - w);
      vec3 Rv = reflect(-V, N);
      float spec = pow(max(dot(Rv, uSunDir), 0.0), 60.0);
      float fr = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
      outc += uSunColor * step(0.5, spec) * gloss * uSunStrength * 0.6;
      outc += mix(uSkyTint, vec3(0.8, 0.9, 1.0), 0.5) * fr * gloss * 0.18;
      outc += uSunColor * pow(max(dot(Rv, uSunDir), 0.0), 30.0) * glass * 0.4 * uSunStrength;

      float id = uId;
      if(uInk > 0.5 && vDepth > uInkFar) id = 0.0;
      writeOut(outc, 1.0, NV, vDepth, id);
    }
  `;
  return mat(u, vs, fs);
}

// ---------------------------------------------------------------- paving + fields
// One ground shader for inside and outside: limestone flags in the town, the square's
// rosette, cobbled lanes; outside the wall grass with drawn tufts, fields, the dirt road.
export function groundMaterial(o = {}) {
  const u = { ...G, uId: { value: 0 }, uShadeDeep: TU.uShadeDeep };
  const vs = /* glsl */ `
    ${VERT_STD}
    void main(){ stdVertex(position, normal); }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${PAINT_LIGHT}
    ${HELP}
    uniform float uId, uShadeDeep;
    varying vec3 vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv;
    float wallInnerZ(float x){ x = clamp(x, -1499.0, 1499.0); return 1200.0 - sqrt(1500.0 * 1500.0 - x * x); }
    float roadX(float z){ float d = max(-314.0 - z, 0.0); return 9.0 * sin(d * 0.004) * smoothstep(0.0, 300.0, d) + 30.0 * sin(d * 0.0013 + 0.5) * smoothstep(100.0, 900.0, d); }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 w = vWorld;
      vec3 N = normalize(vNormalW);
      vec2 p = w.xz;
      float pxm = max(length(fwidth(w)), 1e-4);
      float outside = step(w.z, wallInnerZ(w.x) - 13.0);
      vec3 col;
      float ao = 1.0;
      if(outside < 0.5){
        // ---- limestone flags in courses (rows run east-west, turned on the main street)
        bool street = abs(p.x) < 7.0 && p.y < -150.0;
        vec2 q = street ? vec2(p.y, p.x) : p;
        float rowH = 0.9;
        float row = floor(q.y / rowH);
        float L = 0.9 + 0.7 * hash12(vec2(row, 3.0));
        float bx = (q.x + hash12(vec2(row, 7.0)) * 3.0) / L;
        vec2 fid = vec2(floor(bx), row);
        vec2 ff = vec2(fract(bx) * L, fract(q.y / rowH) * rowH);
        float h1 = hash12(fid), h2 = hash12(fid + 5.3);
        col = mix(vec3(0.9, 0.86, 0.78), vec3(0.95, 0.92, 0.86), h1);
        col = mix(col, vec3(0.87, 0.8, 0.72), step(0.82, h2) * 0.7);
        // the square: a big drawn rosette of darker and paler stone
        vec2 sq = p - vec2(0.0, -120.0);
        float r = length(sq);
        if(abs(sq.x) < 36.0 && abs(sq.y) < 30.0){
          float an = atan(sq.y, sq.x);
          float ringI = floor(r / 1.2);
          float seg = floor(an / 6.2831 * max(6.0, floor(r * 3.0)));
          fid = vec2(seg, ringI);
          ff = vec2(fract(an / 6.2831 * max(6.0, floor(r * 3.0))) * r * 6.2831 / max(6.0, floor(r * 3.0)), fract(r / 1.2) * 1.2);
          L = r * 6.2831 / max(6.0, floor(r * 3.0)); rowH = 1.2;
          col = mix(vec3(0.9, 0.86, 0.78), vec3(0.95, 0.92, 0.86), hash12(fid));
          float rose = step(r, 14.0) * step(0.5, fract(an / 6.2831 * 12.0 + r * 0.03));
          col = mix(col, vec3(0.8, 0.72, 0.62), rose * step(4.0, r) * 0.7);
          col = mix(col, vec3(0.5, 0.62, 0.78), (1.0 - aaStep(0.35, abs(r - 14.6), pxm)) * 0.85);
          col = mix(col, vec3(0.55, 0.66, 0.8), (1.0 - aaStep(3.6, r, pxm)) * 0.6);
        }
        float jw = max(0.025, pxm * 0.6);
        float joint = 1.0 - smoothstep(jw, jw * 2.0, min(min(ff.x, L - ff.x), min(ff.y, rowH - ff.y)));
        float fade = 1.0 - smoothstep(0.04, 0.2, pxm);
        col = mix(col, col * vec3(0.72, 0.7, 0.76), joint * fade);
        col *= 0.95 + 0.08 * vnoise(p * 3.0) * fade;
        // worn path in the middle of the street, grime at the walls, sand drifts
        col = mix(col, col * 1.04, (1.0 - smoothstep(0.0, 3.0, abs(p.x))) * step(p.y, -150.0) * 0.6);
        float dirt = smoothstep(0.55, 0.8, fbm2(p * 0.08));
        col = mix(col, col * vec3(0.92, 0.88, 0.82), dirt * 0.6);
        // blue-grey drain gutter down the main street
        col = mix(col, vec3(0.6, 0.62, 0.72), (1.0 - aaStep(0.18, abs(abs(p.x) - 5.4), pxm)) * step(p.y, -150.0) * step(-299.0, p.y) * 0.6);
        // grass in the cracks near the wall and along the canal
        float nearWall = 1.0 - smoothstep(0.0, 22.0, w.z - wallInnerZ(w.x));
        float weed = step(0.62, fbm2(p * 0.7)) * joint * max(nearWall, 0.3);
        col = mix(col, vec3(0.45, 0.6, 0.32), weed * 0.7 * fade);
      } else {
        // ---- outside: sunny meadow, field strips, the dirt road from the gate
        float n1 = fbm2(p * 0.004 + 3.0), n2 = fbm2(p * 0.03), n3 = vnoise(p * 0.6);
        vec3 g1 = vec3(0.47, 0.66, 0.3), g2 = vec3(0.62, 0.74, 0.34), g3 = vec3(0.76, 0.74, 0.4);
        col = mix(g1, g2, smoothstep(0.35, 0.65, n1));
        // field patches: wheat gold, fresh green, lavender rows
        vec2 fc = floor((p + vec2(0.0, 400.0)) / vec2(160.0, 110.0));
        float fh = hash12(fc + 2.0);
        float farFromWall = smoothstep(120.0, 220.0, wallInnerZ(w.x) - 14.0 - w.z);
        if(fh > 0.55){
          vec3 fcol = fh > 0.85 ? vec3(0.86, 0.74, 0.4) : (fh > 0.7 ? vec3(0.66, 0.75, 0.36) : vec3(0.74, 0.7, 0.42));
          vec2 fl = fract((p + vec2(0.0, 400.0)) / vec2(160.0, 110.0));
          float inF = step(0.04, fl.x) * step(fl.x, 0.96) * step(0.05, fl.y) * step(fl.y, 0.95);
          float rows = step(0.5, fract(p.x / 2.2 + p.y * 0.1)) * (1.0 - smoothstep(0.05, 0.3, pxm));
          fcol = mix(fcol, fcol * 0.9, rows * 0.5);
          col = mix(col, fcol, inF * farFromWall);
        }
        col *= 0.92 + 0.14 * n2;
        // drawn grass tufts: little dark strokes with a lit tip
        vec2 tq = p * 1.6;
        vec2 ti = floor(tq), tf = fract(tq) - 0.5;
        vec2 jo = hash22(ti) - 0.5;
        vec2 d = tf - jo * 0.6;
        float tuft = step(0.45, hash12(ti + 9.0)) * (1.0 - smoothstep(0.12, 0.16, length(d * vec2(1.8, 0.8))));
        float fine = 1.0 - smoothstep(0.02, 0.08, pxm);
        col = mix(col, col * vec3(0.72, 0.8, 0.7), tuft * fine * 0.8);
        col = mix(col, col * 1.12 + vec3(0.03, 0.03, 0.0), step(0.75, hash12(ti + 3.0)) * (1.0 - smoothstep(0.05, 0.08, length(d - vec2(0.0, 0.08)))) * fine);
        // wildflowers
        float fl2 = step(0.965, hash12(floor(p * 2.3) + 1.0)) * (1.0 - smoothstep(0.03, 0.12, pxm));
        col = mix(col, mix(vec3(1.0, 0.96, 0.85), vec3(0.95, 0.75, 0.25), step(0.5, hash12(floor(p * 2.3)))), fl2);
        // a beaten earth band along the wall foot
        float foot = 1.0 - smoothstep(4.0, 14.0, (wallInnerZ(w.x) - 14.0) - w.z);
        col = mix(col, vec3(0.78, 0.68, 0.52) * (0.92 + 0.1 * n3), foot * 0.85);
        // the road: pale dusty earth with wheel ruts and grass on the crown
        float rx = abs(p.x - roadX(p.y));
        float rw = 4.5;
        float road = (1.0 - aaStep(rw, rx + (n3 - 0.5) * 0.8, pxm)) * step(p.y, -312.0);
        vec3 rc = vec3(0.85, 0.76, 0.6) * (0.93 + 0.1 * n3);
        float rut = (1.0 - aaStep(0.35, abs(rx - 1.5), pxm)) * (1.0 - smoothstep(0.05, 0.25, pxm));
        rc = mix(rc, rc * 0.84, rut);
        rc = mix(rc, mix(rc, g2, 0.6), (1.0 - aaStep(0.4, rx, pxm)) * step(0.4, n3));
        col = mix(col, rc, road);
        // the gate apron: broad pale stone paving outside the gate
        float apron = (1.0 - aaStep(14.0, abs(p.x), pxm)) * step(-336.0, p.y);
        col = mix(col, vec3(0.86, 0.8, 0.7) * (0.94 + 0.08 * n3), apron * 0.9);
        ao = 1.0;
      }
      vec3 outc = paintLight(col, N, w, 1.0, ao);
      if(uShadeDeep > 0.0){ float shK = smoothstep(0.35, 0.65, 1.0 - sunShadow(w, N)); outc = mix(outc, outc * vec3(0.48, 0.47, 0.7), shK * uShadeDeep); }
      writeOut(outc, 1.0, normalize(vNormalV), vDepth, uId);
    }
  `;
  return mat(u, vs, fs);
}

// ---------------------------------------------------------------- canal water
export function waterMaterial() {
  const u = { ...G };
  const vs = /* glsl */ `
    ${VERT_STD}
    void main(){ stdVertex(position, normal); }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${HELP}
    varying vec3 vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 w = vWorld;
      vec2 p = w.xz;
      float pxm = max(length(fwidth(w)), 1e-4);
      float t = uDrawTime;
      // across the canal: deep turquoise in the middle, lighter jade at the quays, dark quay reflections
      float dz = abs(p.y - 60.0);
      vec3 deep = vec3(0.07, 0.5, 0.58), shal = vec3(0.32, 0.74, 0.72);
      vec3 col = mix(deep, shal, smoothstep(2.0, 6.8, dz));
      float reflBand = smoothstep(4.0, 6.9, dz);
      col = mix(col, vec3(0.1, 0.32, 0.42), reflBand * 0.45);
      // sky reflection streaks
      float sk = fbm2(vec2(p.x * 0.05 + t * 0.05, p.y * 0.6));
      col = mix(col, vec3(0.56, 0.84, 0.92), smoothstep(0.55, 0.7, sk) * 0.5);
      // drawn ripple lines: wobbling contour lines that drift
      float rn = fbm2(vec2(p.x * 0.18 + t * 0.12, p.y * 0.9 - t * 0.05));
      float rl = abs(fract(rn * 6.0) - 0.5);
      float rip = (1.0 - smoothstep(0.03, 0.03 + pxm * 2.0, rl)) * step(0.45, vnoise(p * vec2(0.15, 0.7) + t * 0.1));
      col = mix(col, vec3(0.75, 0.95, 0.95), rip * 0.75);
      // sun glints: sparkles that blink on threes
      vec3 V = normalize(cameraPosition - w);
      vec3 Rv = reflect(-V, vec3(0.0, 1.0, 0.0));
      float sunR = pow(max(dot(Rv, uSunDir), 0.0), 6.0);
      vec2 gc = floor(p * vec2(1.4, 3.0));
      float tw = hash12(gc + floor(uDrawTime * 8.0) * 3.1);
      float glint = step(0.93 - sunR * 0.25, tw) * step(0.4, vnoise(p * 0.3 + t * 0.2));
      vec2 gf = fract(p * vec2(1.4, 3.0)) - 0.5;
      glint *= 1.0 - smoothstep(0.08, 0.2, length(gf * vec2(1.0, 2.5)));
      col = mix(col, vec3(1.0, 0.99, 0.94) * 1.4, glint * (0.4 + 0.6 * sunR));
      // foam line at the quay foot
      col = mix(col, vec3(0.88, 0.98, 0.97), (1.0 - smoothstep(6.6, 6.95, dz)) * 0.0 + smoothstep(6.75, 6.98, dz) * 0.7);
      col *= mix(vec3(1.0), uSunColor * 1.02, 0.3 * uSunStrength);
      col = mix(col * uShadeTint * 1.2, col, 0.4 + 0.6 * uSunStrength);
      writeOut(col, 1.0, normalize(vNormalV), vDepth, 0.0);
    }
  `;
  return mat(u, vs, fs);
}

// ---------------------------------------------------------------- distant mountains
// A painted band of blue ranges far to the north (and around the sides).
export function mountainMaterial() {
  const u = { ...G };
  const vs = /* glsl */ `
    varying vec3 vWorld; varying float vDepth; varying vec2 vUv;
    void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vUv = uv; vec4 mv = viewMatrix * wp; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    varying vec3 vWorld; varying float vDepth; varying vec2 vUv;
    float ridge(float x, float s){ float r = 0.0, a = 0.5; for(int i = 0; i < 6; i++){ r += a * (1.0 - abs(vnoise(vec2(x * s, 3.0 + float(i))) * 2.0 - 1.0)); x *= 2.1; a *= 0.5; } return r; }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      float x = vUv.x, y = vUv.y;       // x: metres along the band, y: 0..1 height
      float hb = 0.25 + 0.6 * ridge(x, 0.0007);          // back range
      float hf = 0.12 + 0.42 * ridge(x + 9000.0, 0.0012);   // front range
      if(y > hb) discard;
      vec3 skyC = mix(uSkyTint, vec3(0.75, 0.85, 0.97), 0.5);
      vec3 back = mix(vec3(0.52, 0.64, 0.86), skyC, 0.35);
      vec3 front = vec3(0.42, 0.56, 0.8);
      // snow on the highest back peaks, sunlit facets
      float face = vnoise(vec2(x * 0.004, y * 6.0));
      vec3 c = back * (0.94 + 0.1 * face);
      float snow = step(0.62, y) * step(hb - 0.1 - 0.06 * vnoise(vec2(x * 0.02, 1.0)), y);
      c = mix(c, vec3(0.93, 0.95, 1.0), snow * 0.9);
      if(y < hf){
        float lit = step(0.5, vnoise(vec2(x * 0.003 + y * 3.0, 2.0)));
        c = front * (0.9 + 0.12 * lit);
        c = mix(c, vec3(0.5, 0.64, 0.7), smoothstep(0.1, 0.0, y) * 0.5);
      }
      c = mix(c, skyC, 0.15);
      writeOut(c, 1.0, vec3(0.0, 0.0, 1.0), vDepth, 0.0);
    }
  `;
  return mat(u, vs, fs, { side: THREE.DoubleSide });
}
