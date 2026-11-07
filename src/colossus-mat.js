import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { makeBronzeAtlas } from './colossus-tex.js';

// COLOSSUS dept: cel verdigris bronze (adapted from the Leviathan archer material, MIT).
// Two hard cel tones, hard-banded painted sky reflections in the metal, the bronze panel atlas,
// gold worn plate edges, pale patina runs below seams, emissive classes:
//   emis 1 chest core / inner light, 2 visor slit, 3 vent throats.
// Each material instance has its own state uniforms (the giant and the walkers differ).
export function bronzeMaterial(panelTex, o = {}) {
  const u = {
    ...G,
    uPanel: { value: panelTex },
    uFlat: G.uFlat,
    uVisor: { value: o.visor ?? 0.6 },
    uCore: { value: 0.3 },
    uVent: { value: 0.4 },
    uGlow: { value: 0 },          // breach: seams and plates burn white-cyan from inside
    uDissolve: { value: 0 },      // 0..1 dissolves the geometry away (hidden in FX steam)
    uChromeK: { value: o.chrome ?? 1 },
    uPat: { value: o.patina ?? 1 },   // patina noise frequency scale (<1 = broader, smoother weathering)
    uWearK: { value: o.wear ?? 1 },
  };
  const vs = /* glsl */ `
    attribute vec3 aCol;
    attribute vec4 aMat;
    attribute vec3 aEx;
    varying vec3 vCol, vLocal, vLocalN;
    varying vec4 vMat;
    varying vec3 vEx;
    ${VERT_STD}
    void main(){ vCol = aCol; vMat = aMat; vEx = aEx; vLocal = position; vLocalN = normal; stdVertex(position, normal); }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform sampler2D uPanel;
    uniform float uFlat, uVisor, uCore, uVent, uGlow, uDissolve, uChromeK, uPat, uWearK;
    varying vec3 vWorld, vNormalW, vNormalV, vCol, vLocal, vLocalN;
    varying vec4 vMat;
    varying vec3 vEx;
    varying float vDepth;
    varying vec2 vUv;

    vec3 chromeEnv(vec3 R, vec3 p){
      float wob = 0.0;   // clean bands: a noisy horizon made blotchy dark ovals that read as see-through
      float e = R.y + wob;
      vec3 c;
      if(e > 0.70) c = vec3(0.62, 0.80, 1.00);
      else if(e > 0.34) c = vec3(0.84, 0.93, 1.02);
      else if(e > 0.10) c = vec3(1.02, 1.01, 0.96);
      else if(e > 0.0) c = vec3(1.10, 1.02, 0.86);
      else if(e > -0.12) c = vec3(0.46, 0.44, 0.52);
      else c = vec3(0.86, 0.76, 0.62);
      return c;
    }

    void main(){
      float idF = floor(vMat.w + 0.5);
      // dissolve: a clean wipe from the feet up with a big lobed edge (billow-sized, no fine grain), and a hard
      // white-hot rim just above the cut. The FX steam billows cover it.
      float dRim = 0.0;
      if(uDissolve > 0.001){
        float lob = vnoise3(vWorld * 0.045 + 3.0) * 0.7 + vnoise3(vWorld * 0.11 + 9.0) * 0.3;
        float hcut = mix(-14.0, 112.0, uDissolve);
        float e = vWorld.y + (lob - 0.5) * 22.0 - hcut;
        if(e < 0.0) discard;
        dRim = 1.0 - step(1.6, e);
      }
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW);
      vec3 NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 col = vCol;
      float metal = vMat.x, detail = vMat.y, emis = vMat.z;
      float edge = vEx.x, wearK = vEx.y * uWearK;
      vec3 r = vLocal * uPat;

      // ---- panel atlas
      vec4 d = texture(uPanel, vUv);
      float lineMask = d.a;
      col = mix(col, d.rgb * mix(vec3(1.0), col * 1.5, 0.5), d.a * detail);
      float near = smoothstep(260.0, 60.0, vDepth);
      if(near > 0.001){
        vec4 d2 = texture(uPanel, vUv * 3.3 + vec2(0.37, 0.11));
        col = mix(col, d2.rgb * mix(vec3(1.0), col * 1.4, 0.5), d2.a * detail * near * 0.75);
        lineMask = max(lineMask, d2.a * near);
      }
      float weathered = 1.0 - uFlat;
      // ---- clean cel bronze: no fine-grain speckle (it turns to pixel noise at a distance). Only a few
      //      deliberate verdigris streaks running down from plate tops, broad and soft-edged in shape, hard in tone.
      float rs = fbm3(vec3(r.x * 3.2, r.y * 0.22, r.z * 3.2) + 7.0);
      float run = step(0.7, rs) * step(0.5, fbm3(r * 0.7 + 1.3)) * weathered * wearK;
      col = mix(col, mix(col, vec3(0.70, 0.93, 0.84), 0.45), run);
      // ---- worn plate edges: polished gold, the signature trim
      vec3 gold = vec3(1.0, 0.80, 0.40);
      col = mix(col, gold, smoothstep(0.1, 0.9, edge) * (0.65 + 0.35 * step(0.4, vnoise3(r * 9.0))));

      // ---- lighting: two hard tones
      float ndl = dot(N, uKeyDir);
      float sh = sunShadow(vWorld, N);
      float lit = smoothstep(-0.03, 0.05, ndl) * sh;
      vec3 litCol = col * mix(uSkyTint, uSunColor * 1.08, uSunStrength);
      float up = smoothstep(-0.7, 0.6, N.y);
      vec3 shadeCol = col * uShadeTint * mix(uBounce, vec3(1.0), up);
      vec3 outc = mix(mix(shadeCol, litCol, 0.12), litCol, lit);
      float deep = step(ndl, -0.55) * step(N.y, -0.35);
      outc = mix(outc, col * uDeepTint, deep * 0.85);

      // ---- painted sky in the metal
      vec3 R = reflect(-V, N);
      vec3 env = chromeEnv(R, vLocal);
      // far away the painted-sky reflection lines up with the real horizon and reads as see-through glass:
      // fade the mirror out with distance so the bronze stays a solid cel body in the wide shots
      float farK = smoothstep(90.0, 280.0, vDepth);
      float mt = metal * uChromeK * (1.0 - 0.85 * farK);
      vec3 chrome = col * env * mix(0.86, 1.06, lit);
      outc = mix(outc, chrome, mt * mix(0.4, 0.6, lit));

      vec3 H = normalize(uKeyDir + V);
      float sp = dot(N, H);
      float spec = step(0.9955, sp) * lit;
      outc = mix(outc, vec3(1.1, 1.06, 0.96), spec * (0.3 + 0.5 * metal) * (1.0 - 0.7 * lineMask));
      float fres = 1.0 - max(dot(N, V), 0.0);
      float rimL = smoothstep(0.72, 0.76, fres) * lit;
      outc = mix(outc, vec3(1.08, 1.06, 1.0), rimL * 0.45 * metal);
      // and a touch more body (darker, richer) at distance, against the aerial haze
      outc = mix(outc, outc * vec3(0.86, 0.9, 0.9), 0.6 * farK);

      // ---- emissive classes
      if(emis > 0.5 && emis < 1.5){
        float fac = 0.6 + 0.4 * vnoise3(vLocal * 6.0 + uDrawTime * 2.0);
        outc = mix(vec3(0.16, 0.34, 0.40), vec3(0.78, 1.0, 1.06) * (1.0 + 1.4 * uCore), clamp(uCore * fac * 1.4, 0.0, 1.0));
      } else if(emis > 1.5 && emis < 2.5){
        // the visor slit: white-hot core, cyan fringe, flickers a little on twos
        float fl = 0.92 + 0.08 * vnoise3(vec3(uDrawTime * 7.0));
        float coreL = smoothstep(0.55, 0.95, abs(dot(NV, vec3(0.0, 0.0, 1.0))));
        vec3 hot = mix(vec3(0.45, 0.95, 1.1), vec3(1.25, 1.3, 1.3), coreL) * (1.0 + 1.3 * uVisor) * fl;
        outc = mix(vec3(0.05, 0.1, 0.14), hot, clamp(uVisor * 1.3, 0.0, 1.0));
      } else if(emis > 2.5){
        float fl = 0.8 + 0.2 * vnoise3(vLocal * 8.0 + uDrawTime * 3.0);
        outc = mix(vec3(0.06, 0.12, 0.14), vec3(0.62, 0.96, 1.05) * (0.8 + 1.2 * uVent) * fl, clamp(uVent * 1.4, 0.0, 1.0));
      }

      // ---- breach glow: seams burn first, then whole plates go white-cyan
      if(uGlow > 0.001){
        float seamG = max(lineMask, step(0.5, edge));
        vec3 hotc = vec3(0.86, 1.08, 1.12);
        outc = mix(outc, hotc * 1.25, clamp(seamG * uGlow * 2.0, 0.0, 1.0));
        float bands = step(0.5, fbm3(vLocal * 0.9 + uDrawTime * 0.6));
        outc = mix(outc, mix(outc, hotc, 0.75), smoothstep(0.35, 1.0, uGlow) * (0.5 + 0.5 * bands));
      }
      outc = mix(outc, vec3(1.25, 1.28, 1.22), dRim);
      writeOut(outc, 1.0, NV, vDepth, idF);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide, transparent: false });
}

let atlas = null;
export function bronzeAtlas() { if (!atlas) atlas = makeBronzeAtlas(2048); return atlas; }
