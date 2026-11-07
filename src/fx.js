import * as THREE from 'three';
import {
  hash, hr, ID, KIND, PAL, GEO, PuffBatch, puffMaterial, ChunkBatch, chunkMaterial, LineBatch, boltMaterial, boltPts,
  GlowBatch, glowMaterial, GLOW, QuadBatch, mistMaterial, domeMaterial, planeRingMaterial, screenFlashMaterial,
} from './fx-core.js';
import { COLOSSUS, GATE, PLACES, STEPS, WALL, stepY, wallInnerZ, wallOuterZ } from './layout.js';
import { clamp, smooth, invLerp, easeOut, onThrees, onTwos } from './util.js';

// FX department: bolt, flash dome, shock ring, steam (column, vents, dissolve), grip chips,
// gate burst, boulders + house hit, dust columns, dust wave, petals, gate dust trickle.
// Everything is a pure function of state.t; FX are drawn on threes (petals on twos).

const V = THREE.Vector3;
// sandstone as it reads next to the town's wall (desaturated: the cel light and grade push it warmer)
const STONE_A = '#e9cfb8', STONE_B = '#d4ad92', STONE_C = '#c99c80';
const G_ACC = 9.8;

const toV = (p, out = new V()) => (p == null ? null : p.isVector3 ? out.copy(p) : Array.isArray(p) ? out.set(p[0], p[1], p[2]) : out.set(p.x, p.y, p.z));

export async function createFx(ctx) {
  const { scene, overlay, engine, camera, CUES } = ctx;
  const S = engine.S;
  const C = CUES;

  // ------------------------------------------------------------------ batches
  const puffs = new PuffBatch(puffMaterial(S), 8000);
  const stoneMat = chunkMaterial({ id: ID.STONE });
  const rocks = new ChunkBatch(GEO.rock(3, 1), stoneMat, 400);
  const blocks = new ChunkBatch(GEO.block(5), chunkMaterial({ id: ID.STONE }), 200);
  const bronze = new ChunkBatch(GEO.block(9), chunkMaterial({ id: ID.BRONZE, rim: 1, sat: 1 }), 40);
  const stucco = new ChunkBatch(GEO.block(13), chunkMaterial({ id: ID.STUCCO }), 80);
  const pebbles = new ChunkBatch(GEO.rock(7, 0), chunkMaterial({ id: ID.PEBBLE }), 300);
  const petals = new ChunkBatch(GEO.petal(), chunkMaterial({ id: ID.PETAL, sat: 1 }), 80);
  scene.add(puffs.mesh, rocks.mesh, blocks.mesh, bronze.mesh, stucco.mesh, pebbles.mesh, petals.mesh);

  const mist = new QuadBatch(mistMaterial(), 400, { iPos: 3, iS: 4, iC: 4, iTop: 3, iBot: 3 });
  const lines = new LineBatch(boltMaterial(S), 24000);
  const glows = new GlowBatch(glowMaterial(S), 200);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), domeMaterial());
  dome.frustumCulled = false; dome.visible = false;
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), planeRingMaterial());
  ring.frustumCulled = false; ring.visible = false;
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), screenFlashMaterial());
  flash.frustumCulled = false; flash.visible = false;
  mist.mesh.renderOrder = 1; ring.renderOrder = 2; dome.renderOrder = 3; glows.mesh.renderOrder = 4; lines.mesh.renderOrder = 5; flash.renderOrder = 10;
  overlay.add(mist.mesh, ring, dome, glows.mesh, lines.mesh, flash);
  flash.material.uniforms.uRes.value.set(engine.IW, engine.IH);

  // debug stand-in wall + ground for testing FX before the town exists (?fxwall=1, never on by default)
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('fxwall') === '1') {
    const wm = chunkMaterial({ id: 5 });
    const one = (geo, col, x, y, z) => { const m = new THREE.InstancedMesh(geo, wm, 1); m.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x, y, z)); m.setColorAt(0, new THREE.Color(col)); scene.add(m); };
    one(new THREE.BoxGeometry(900, 50, 14), '#efcfb0', 0, 25, -307);
    one(new THREE.BoxGeometry(2000, 1, 2000), '#e8e0d0', 0, -0.5, 0);
    for (let i = 0; i < 60; i++) one(new THREE.BoxGeometry(12, 10, 12), '#f6f2ea', hr(i, 0, 1, -200, 200), 5, hr(i, 0, 2, -290, 50));
  }

  // ------------------------------------------------------------------ frame state
  const I = { t: 0, tq: 0, draw: 0, L: new V(), cam: new V() };
  const _v = new V(), _w = new V(), _u = new V();
  const groundY = (x, z) => { try { const g = ctx.town?.groundY?.(x, z); return Number.isFinite(g) ? g : 0; } catch { return 0; } };
  function anchor(obj, name, fb) {
    try {
      if (obj && typeof obj.anchor === 'function') {
        const v = new V();
        const r = obj.anchor(name, v);
        if (r && r.isVector3) return r.clone();
        if (Array.isArray(r)) return new V(r[0], r[1], r[2]);
        if (v.lengthSq() > 0) return v;
      }
    } catch { /* fall back */ }
    return new V(fb[0], fb[1], fb[2]);
  }
  // billows outside the town never poke through the wall: below the wall top they stay beyond the outer face
  function outside(x, y, z, r) {
    if (y - r * 0.75 > WALL.h + 1.5) return z;
    return Math.min(z, wallOuterZ(x) - r * 0.9);
  }
  function inkZ(x, y, z) {
    const m = camera.matrixWorldInverse.elements;
    return Math.max(-(m[2] * x + m[6] * y + m[10] * z + m[14]), 0.5);
  }
  // shade comes from the whole mass first: puffs on the far side of the light are drawn in shade
  function massTone(x, y, z, cx, cy, cz, R, base = 0) {
    const L = I.L;
    const d = ((x - cx) * L.x + (y - cy) * L.y + (z - cz) * L.z) / R;
    return base - 0.55 * Math.tanh(d * 1.3);
  }
  function veil(x, y, z, sx, sy, seed, op, top, bot, soft = 20, tone = 0, hard = 0.3, rot = 0) {
    if (op <= 0.004) return;
    mist.push([x, y, z], [sx, sy, seed % 37, op], [soft, rot, tone, hard], top, bot);
  }
  const DUSTTOP = [0.99, 0.92, 0.78], DUSTBOT = [0.80, 0.70, 0.70];
  const PALETOP = [1.0, 0.98, 0.95], PALEBOT = [0.84, 0.80, 0.90];

  // ballistic flight with one bounce and a short slide; returns { p, land (time of first contact), settled, ts }
  function flight(out, p0, v0, a, floorY, rest = 0.28, fric = 0.45) {
    const res = { land: Infinity, settled: false, ts: a };
    const dy = p0.y - floorY;
    const t1 = dy >= 0 ? (v0.y + Math.sqrt(Math.max(v0.y * v0.y + 2 * G_ACC * dy, 0))) / G_ACC : 0;
    res.land = t1;
    if (a <= t1) { out.set(p0.x + v0.x * a, p0.y + v0.y * a - 0.5 * G_ACC * a * a, p0.z + v0.z * a); return res; }
    const P1x = p0.x + v0.x * t1, P1z = p0.z + v0.z * t1;
    const vyL = v0.y - G_ACC * t1;
    const bvx = v0.x * fric, bvz = v0.z * fric, bvy = -vyL * rest;
    const t2 = (2 * bvy) / G_ACC;
    const b = a - t1;
    if (b <= t2) { out.set(P1x + bvx * b, floorY + bvy * b - 0.5 * G_ACC * b * b, P1z + bvz * b); res.ts = a; return res; }
    const P2x = P1x + bvx * t2, P2z = P1z + bvz * t2;
    const c = b - t2, tau = 0.35;
    const k = tau * (1 - Math.exp(-c / tau)) * 0.6;
    out.set(P2x + bvx * k, floorY, P2z + bvz * k);
    res.settled = c > 0.8;
    res.ts = t1 + t2 + Math.min(c, 0.5) * 0.5;
    return res;
  }

  // ================================================================== 1. BOLT + FLASH
  const BOLT_T = C.bolt, FLASH_T = C.flash;
  const STRIKE = new V(0, 0, COLOSSUS.pos[2]);
  const BOLT_POW = [1.0, 0.3, 1.0, 0.9, 0.0, 1.0, 0.75];
  const CYAN = [0.35, 0.88, 1.0];
  function bolt(st) {
    const t = I.t;
    if (t < BOLT_T || t > FLASH_T + 0.35) return 0;
    const rel = Math.floor((t - BOLT_T) * 8 + 1e-6);
    let pw = rel < BOLT_POW.length ? BOLT_POW[rel] : 0.6 * (1 - clamp((t - FLASH_T) / 0.35));
    if (!(pw > 0)) return 0;
    // view axes so the zigzag always reads on screen
    const R = _u.set(1, 0, 0).applyQuaternion(camera.quaternion).clone();
    const U = new V(0, 1, 0).applyQuaternion(camera.quaternion);
    const top = new V(-40, 1500, STRIKE.z - 260), hit = STRIKE.clone();
    // the channel keeps its shape; each drawing redraws its small kinks
    // three channel shapes strobe through the drawings
    const trunk = boltPts(top, hit, 1777 + (rel % 3) * 5, R, U, 0.12, 7);
    const tw = (s) => 1.15 - 0.4 * s;
    // fat outer glow channel, then the white-hot core channel
    lines.push(trunk, { px: 9, m: 4.5, width: tw, color: CYAN, power: 0.55 * pw, soft: 30, mode: 0, bias: 4, rim: 1.0 });
    lines.push(trunk, { px: 4.5, m: 1.8, width: tw, color: CYAN, power: 1.6 * pw, soft: 10, mode: 0, bias: 4, rim: 0.9 });
    // forks
    const nF = 7;
    for (let i = 0; i < nF; i++) {
      if (hash(i, rel, 41) < 0.25) continue;
      const s = 0.12 + 0.75 * hash(i, 1, 42);
      const a = trunk[Math.floor(s * (trunk.length - 1))];
      const side = hash(i, 1, 43) < 0.5 ? -1 : 1;
      const len = hr(i, 1, 44, 120, 420) * (1 - s * 0.5) * (i < 3 ? 1.5 : 1);
      const b = a.clone().add(new V(side * len * hr(i, 1, 45, 0.5, 1.1), -len * hr(i, 1, 46, 0.4, 1.0), hr(i, 1, 47, -80, 80)));
      const fp = boltPts(a, b, 300 + i * 7 + rel, R, U, 0.16, 5);
      const big = i < 3;
      lines.push(fp, { px: big ? 3.2 : 1.8, m: big ? 1.0 : 0.4, width: (q) => 1 - 0.85 * q, color: CYAN, power: 1.2 * pw, soft: big ? 12 : 6, mode: 0, bias: 4, rim: 0.7 });
      // twigs
      for (let j = 0; j < 2; j++) {
        const q = fp[Math.floor(hr(i, j, 48, 0.3, 0.8) * (fp.length - 1))];
        const e = q.clone().add(new V(side * hr(i, j, 49, 30, 110), -hr(i, j, 50, 20, 90), 0));
        lines.push(boltPts(q, e, 900 + i * 13 + j + rel, R, U, 0.2, 4), { px: 1.0, width: (u) => 1 - 0.9 * u, color: CYAN, power: 1.1 * pw, soft: 6, mode: 0, bias: 4, rim: 0.4 });
      }
    }
    // secondary strikes along the wall on some drawings (the sky splits)
    for (let k = 0; k < 4; k++) {
      if (hash(k, rel, 61) > 0.45) continue;
      const x = (k < 2 ? -1 : 1) * hr(k, 0, 62, 70, 260);
      const p0 = new V(x * 0.6, hr(k, 0, 63, 700, 1100), STRIKE.z - 300);
      const p1 = new V(x, 0, STRIKE.z - hr(k, 0, 64, 20, 120));
      lines.push(boltPts(p0, p1, 500 + k * 31 + rel, R, U, 0.1, 5), { px: 1.8, m: 0.5, width: (q) => 0.6 + 0.4 * q, color: CYAN, power: 0.75 * pw, soft: 6, mode: 0, bias: 4, rim: 0.5 });
    }
    // light at the strike point behind the wall
    glows.push(new V(0, 40, STRIKE.z), { kind: GLOW.soft, m: 150, color: [0.55, 0.92, 1.0], power: 0.4 * pw, mode: 0, bias: 0 });
    glows.push(new V(0, 48, STRIKE.z + 34), { kind: GLOW.soft, m: 110, aspect: 2.2, color: [0.6, 0.95, 1.0], power: 0.3 * pw, mode: 2 });
    // ground-contact flare: a spiky burst at the foot of the channel, its top showing over the wall
    glows.push(new V(0, 18, STRIKE.z), { kind: GLOW.burst, m: 95, color: [0.7, 0.97, 1.0], power: 1.1 * pw, mode: 0, bias: 0, seed: 0.13 + 0.07 * (rel % 3) });
    glows.push(new V(0, 10, STRIKE.z), { kind: GLOW.soft, m: 260, color: [0.5, 0.9, 1.0], power: 0.35 * pw, mode: 2 });
    return pw;
  }

  function flashes(st) {
    const t = I.t;
    let a = 0;
    // bolt drawings blink the frame
    if (t >= BOLT_T && t < FLASH_T) {
      const rel = Math.floor((t - BOLT_T) * 8 + 1e-6);
      a = Math.max(a, (BOLT_POW[Math.max(rel, 0)] ?? 0) * 0.34);
    }
    // the white-out
    if (t >= FLASH_T - 0.05 && t < FLASH_T + 1.0) {
      const k = t < FLASH_T + 0.04 ? smooth(invLerp(FLASH_T - 0.05, FLASH_T + 0.04, t)) : t < FLASH_T + 0.12 ? 1 : 1 - smooth(invLerp(FLASH_T + 0.12, FLASH_T + 0.42, t));
      a = Math.max(a, 0.97 * k);
    }
    const fu = flash.material.uniforms;
    fu.uA.value = a;
    fu.uColor.value.setRGB(0.86, 0.97, 1.0);
    const sp = _v.copy(STRIKE).setY(40).project(camera);
    fu.uCenter.value.set(clamp(sp.x * 0.5 + 0.5, -0.5, 1.5), clamp(sp.y * 0.5 + 0.5, -0.5, 1.5));
    flash.visible = a > 0.002;

    // the dome swells over the wall
    const du = I.t - FLASH_T;
    if (du >= -0.02 && du < 1.3) {
      const k = easeOut(clamp((onThrees(I.t) - FLASH_T + 0.06) / 0.95), 2.4);
      const R = 30 + 150 * k;
      dome.position.set(0, -R * 0.08, STRIKE.z);
      dome.scale.set(R, R * 0.92, R * 0.5);
      dome.material.uniforms.uPower.value = (1 - smooth(invLerp(0.4, 1.0, du))) * smooth(invLerp(-0.02, 0.06, du));
      dome.material.uniforms.uDrawing.value = I.draw;
      dome.visible = true;
      glows.push(new V(0, 60, STRIKE.z), { kind: GLOW.soft, m: R * 1.4, color: [0.5, 0.9, 1.0], power: 0.45 * dome.material.uniforms.uPower.value, mode: 0, bias: 0 });
    } else dome.visible = false;
  }

  // ================================================================== 2. SHOCK
  function shock(st) {
    const t = I.tq, u = t - C.shock;
    const ru = ring.material.uniforms;
    ring.visible = false;
    if (u < -0.2 || u > 2.6) return;
    if (u >= 0 && u < 1.9) {
      const R = 30 + 330 * u - 20 * u * u;
      ru.uR.value.set(0, STRIKE.z, R, 1 - smooth(invLerp(1.2, 1.9, u)));
      ru.uY.value = 13;
      ru.uDrawing.value = I.draw;
      ru.uCamPos.value.copy(camera.position);
      ru.uCam.value.copy(camera.matrixWorld);
      const th = Math.tan((camera.fov * Math.PI) / 360);
      ru.uTan.value.set(th * camera.aspect, th);
      ring.visible = true;
      // the dust collar: a rolling bank of billows riding the front, low over the roofs,
      // with a lower row of roof dust lifted behind it
      const n = 170;
      for (let i = 0; i < n; i++) {
        const row = i % 3 === 0 ? 1 : 0;
        const az = (i / n - 0.5) * Math.PI * 1.3 + (hash(i, 7, 1) - 0.5) * 0.03;
        const ua = u - (row ? 0.12 : 0) - hash(i, 7, 2) * 0.04;
        if (ua <= 0) continue;
        const Ri = (30 + 330 * ua - 20 * ua * ua) * (row ? 0.9 : 0.985 + 0.015 * hash(i, 7, 3));
        const x = Math.sin(az) * Ri, z = STRIKE.z + Math.cos(az) * Ri;
        if (z < wallInnerZ(x) + 4) continue;
        const y = (row ? 9 : 13) + 5 * hash(i, 7, 4);
        const r = (row ? 7.5 : 7) * (0.8 + 0.6 * hash(i, 7, 5)) * (0.7 + 0.5 * clamp(ua));
        const fade = clamp(invLerp(1.05, 1.9, ua + hash(i, 7, 6) * 0.3));
        if (fade > 0.98) continue;
        const dx = x / Ri, dz = (z - STRIKE.z) / Ri;
        const tn = massTone(x, y, z, x - dx * 8, y - 5, z - dz * 8, 12, 0.08);
        puffs.inkZ = 0;
        // the front row is torn air streaking outward; the row behind is ochre roof dust boiling up
        if (!row && i % 2 === 0 && ua < 1.2) puffs.push(x - dx * r, y, z - dz * r, r * 0.8, r * 3.2, 0.35, 0.35, dx, 0.12, dz, i % 97, tn - 0.15, fade, KIND.TONGUE, PAL.PALE, ID.DUST[Math.floor(i / 12) % 3]);
        else puffs.push(x, y + (row ? 12 * clamp(ua * 1.5) : 0), z, r * (row ? 1.25 : 1), 0, 1, 0.6, 0, 1, 0, i % 97, tn, fade, KIND.PUFF, row ? PAL.DUST : PAL.PALE, ID.DUST[Math.floor(i / 12) % 3]);
      }
      // tall plumes kicked off the roofs where the front has passed
      for (let i = 0; i < 46; i++) {
        const az = (hash(i, 8, 1) - 0.5) * Math.PI * 1.25;
        const D = hr(i, 8, 2, 50, 330);
        const ub = (-330 + Math.sqrt(330 * 330 - 4 * 20 * (D - 30))) / (-40);   // when the front reaches D
        const a = u - ub;
        if (a < 0) continue;
        const x = Math.sin(az) * D, z = STRIKE.z + Math.cos(az) * D;
        if (z < wallInnerZ(x) + 6) continue;
        const g = 1 - Math.exp(-a / 0.45);
        const H = hr(i, 8, 3, 8, 22) * g;
        const fade = clamp(invLerp(0.9, 1.9, a + hash(i, 8, 4) * 0.4));
        if (fade > 0.98) continue;
        for (let q = 0; q < 3; q++) {
          const y = 8 + H * (q / 2.5) + 2 * q;
          const r = (2.4 + 2.2 * hash(i, 8, 5 + q)) * (0.5 + 0.7 * g) * (1 - 0.18 * q);
          const ox = Math.sin(az) * 6 * g * q * 0.4, oz = Math.cos(az) * 6 * g * q * 0.4;
          const tn = massTone(x + ox, y, z + oz, x, 8 + H * 0.4, z, 6 + H * 0.5, 0.12);
          puffs.push(x + ox, y, z + oz, r, 0, 1, 0.6, 0, 1, 0, (i * 5 + q) % 97, tn, fade, KIND.PUFF, PAL.DUST, ID.DUST[i % 3]);
        }
      }
      // bits flung outward: laundry, leaves, awning scraps
      const BITS = ['#e8574a', '#3c6fd8', '#f4ead2', '#5aa83c', '#4c9a34', '#e58a2c', '#f2f0ea', '#2f8f7a'];
      for (let i = 0; i < 70; i++) {
        const az = (hash(i, 18, 1) - 0.5) * Math.PI * 1.25;
        const D = hr(i, 18, 2, 40, 300);
        const ub = (-330 + Math.sqrt(330 * 330 - 4 * 20 * (D - 30))) / (-40);
        const a = u - ub;
        if (a < 0 || a > 2.6) continue;
        const dx = Math.sin(az), dz = Math.cos(az);
        const v = hr(i, 18, 3, 18, 40), vy = hr(i, 18, 4, 6, 16);
        const drag = (1 - Math.exp(-a / 0.6)) * 0.6;
        const s = v * drag + 4 * a;
        const x = dx * (D + s), z = STRIKE.z + dz * (D + s);
        const y = 12 + hr(i, 18, 5, 0, 8) + vy * 1.6 * a - 0.5 * 6 * a * a;
        if (y < 2) continue;
        const sz = hr(i, 18, 6, 2.5, 5);
        const sp = a * hr(i, 18, 7, 4, 11);
        const col = BITS[i % BITS.length];
        if (i % 8 === 3 || i % 8 === 4) petals.push(x, y, z, sp, sp * 0.7, sp * 1.3, sz, sz * 0.8, sz, col);
        else stucco.push(x, y, z, sp, sp * 0.6, sp * 1.2, sz, 0.12, sz * 0.65, col);
      }
      puffs.inkZ = 0;
    }
    // dust thrown off the wall top as the front crosses it
    puffs.inkZ = 0;
    for (let i = 0; i < 60; i++) {
      const x = (hash(i, 9, 1) - 0.5) * 560;
      const b = C.shock + Math.abs(x) / 900 - 0.12;
      const a = t - b;
      if (a < 0 || a > 2.6) continue;
      const z = wallInnerZ(x) - 6 + 8 * hash(i, 9, 2);
      const g = 1 - Math.exp(-a / 0.5);
      const px = x + (hash(i, 9, 3) - 0.5) * 8 * g, py = 52 + 14 * g * hash(i, 9, 4) + 2, pz = z + 12 * g;
      const r = (3 + 5 * hash(i, 9, 5)) * (0.5 + 0.8 * g);
      const fade = clamp(invLerp(1.2, 2.6, a + hash(i, 9, 6) * 0.4));
      const tn = massTone(px, py, pz, x, 50, z, 10, 0.1);
      puffs.push(px, py, pz, r, 0, 1, 0.55, 0, 1, 0, (i * 3) % 97, tn, fade, KIND.PUFF, PAL.PALE, ID.DUST[i % 3]);
    }
  }

  // ================================================================== 3. STEAM
  const COL = { x: 0, z: COLOSSUS.pos[2] - 25 };
  // The steam tower: from 24.5 a huge, constantly boiling column rises from just behind the wall at the gate.
  // Billows are born hidden behind the wall and climb (stateless: birth index k, age a);
  // the column top reaches ~300 m by ~35 s and it widens from ~50 m at the wall top to 150 m+.
  const colY = (a) => 18 + 330 * (1 - Math.exp(-a / 4.5));   // height of a billow of age a (s)
  function steamColumn(st) {
    const t0 = C.steam, tEnd = C.rise + 0.6, life = 13, dt = 0.1;
    const t = I.tq;
    if (t < t0) return;
    // after the rise the old tower drifts off and breaks apart; the vents take over (the face must stay clear)
    const clr = smooth(invLerp(C.rise, C.head + 1.5, t));
    const k0 = Math.max(0, Math.ceil((t - life - t0) / dt)), k1 = Math.floor((Math.min(t, tEnd) - t0) / dt);
    puffs.inkZ = 0;
    for (let k = k0; k <= k1; k++) {
      const b = t0 + k * dt;
      const a = t - b;
      if (a < 0) continue;
      const h1 = hash(k, 1, 11), h2 = hash(k, 1, 12), h3 = hash(k, 1, 13), h4 = hash(k, 1, 14), h5 = hash(k, 1, 15), h6 = hash(k, 1, 16);
      // the first seconds burst out fatter and faster
      const burst = Math.exp(-(b - t0) / 2.0);
      const y = colY(a) * (1 + 0.25 * burst) + 6 * Math.sin(a * 1.3 + k);
      if (y > 360) continue;
      const halfW = 24 + 0.24 * Math.max(y - 50, 0) + 10 * burst;
      // position across the column: billows roll outward from the core as they climb
      const ang = h1 * Math.PI * 2;
      const rad = Math.sqrt(h2) * 0.6;
      const lean = 0.06 * Math.max(y - 50, 0);           // the tower leans a little with the wind
      const sway = 5 * Math.sin(t * 0.35 + y * 0.02);
      const x = COL.x + Math.cos(ang) * rad * halfW + lean + sway;
      const z = COL.z + Math.sin(ang) * rad * halfW * 0.7 - 0.04 * Math.max(y - 50, 0);
      const r0 = halfW * (0.5 + 0.28 * h4) * (1 - 0.3 * rad) * (0.6 + 0.4 * smooth(a / 1.2));
      // fade: dissipating at the top, thinning after the rise
      const topFade = clamp(invLerp(life - 3.5, life, a + h5 * 2));
      const fade = Math.max(topFade, clamp(clr * 1.2 - h5 * 0.3));
      if (fade > 0.9) continue;
      // big clean lobes never dissolve into holes: they shrink away instead
      const r = r0 * (1 - fade);
      // shade from the whole column: the side away from the light falls into lavender
      const tn = 0.6 * massTone(x, y, z, COL.x + lean, y + 6, COL.z, halfW, -0.05);
      // neighbouring billows sit on different ink layers, so every overlap gets a drawn line
      puffs.inkZ = inkZ(x, y, z) + (k % 4) * halfW * 0.5;
      puffs.push(x, y, outside(x, y, z, r), r, 0, 1, 0.16 + 0.1 * h6, 0, 1, 0, k % 97, tn, 0, KIND.PUFF, PAL.CLEAN, ID.STEAM[Math.floor(k / 13) % 3]);
    }
    puffs.inkZ = 0;
    // a warm glow at the base right after it starts
    const gk = smooth(invLerp(t0, t0 + 0.4, t)) * (1 - smooth(invLerp(t0 + 0.8, t0 + 4, t)));
    if (gk > 0) glows.push(new V(COL.x, 46, COL.z + 20), { kind: GLOW.soft, m: 70, aspect: 1.8, color: [1.0, 0.78, 0.5], power: 0.45 * gk, mode: 0, bias: 30 });
  }

  // steam boiling up the outer face and rolling over the wall top (the colossus crouches behind it)
  function wallBoil(st) {
    const t = I.tq, t0 = C.steam + 4, t1 = C.rise + 0.5, life = 4.2, dt = 0.12;
    if (t < t0) return;
    const k0 = Math.max(0, Math.ceil((t - life - t0) / dt)), k1 = Math.floor((Math.min(t, t1) - t0) / dt);
    for (let k = k0; k <= k1; k++) {
      const b = t0 + k * dt, a = t - b;
      if (a < 0) continue;
      const h1 = hash(k, 2, 11), h2 = hash(k, 2, 12), h3 = hash(k, 2, 13), h4 = hash(k, 2, 14);
      let x0 = (h1 - 0.5) * 2 * (22 + 26 * h2);
      if (Math.abs(x0 - COLOSSUS.gripHand[0]) < 32) x0 += x0 > COLOSSUS.gripHand[0] ? 32 : -32;   // keep the hand shot clear
      const g = 1 - Math.exp(-a / 1.3);
      const wz = wallInnerZ(x0);
      // up the outer face, over the parapet, a few metres in over the walkway, then lifting away
      const y = 38 + 18 * g + 3 * a;
      const z = wz - 16 + 9 * g * (0.5 + 0.5 * h3);
      const x = x0 + 3 * a;
      const r = (4 + 5 * h4) * (0.5 + 0.8 * g);
      const fade = clamp(invLerp(life * 0.55, life, a + h2 * 0.8));
      if (fade > 0.9) continue;
      const tn = massTone(x, y, z, x0, 50, wz - 10, 12, 0.15);
      puffs.inkZ = 0;
      const rr = r * (1 - fade);
      puffs.inkZ = inkZ(x, y, z) + (k % 3) * 6;
      puffs.push(x, y, outside(x, y, z, rr), rr, 0, 1, 0.2, 0, 1, 0, k % 97, 0.6 * tn, 0, KIND.PUFF, PAL.CLEAN, ID.STEAM[Math.floor(k / 7) % 3]);
    }
    puffs.inkZ = 0;
  }

  // steam jets from the colossus' vents
  let _vs = null;
  try { _vs = (await import('./colossus-pose.js')).ventStrength; } catch { _vs = null; }
  const ventStrength = (t) => { try { return _vs ? _vs(t) : 1; } catch { return 1; } };
  // where every vent was at a past moment: the body is re-posed at that time once and memoised,
  // so each puff stays where it was born instead of riding along with the moving vent
  const ventHist = new Map();
  let histOk = true;
  function ventsAt(k, dt, now) {
    let e = ventHist.get(k);
    if (e) return e;
    const C = ctx.colossus;
    if (!histOk || typeof C?.pose !== 'function') return null;
    try {
      C.pose(k * dt);
      e = (C.anchors('vents') || []).map((v) => ({ pos: toV(v.pos, new V()), dir: toV(v.dir, new V(0, 1, 0)).normalize() }));
      if (!e.length) e = null;
    } catch { histOk = false; e = null; }
    if (ventHist.size > 4000) ventHist.clear();
    if (e) ventHist.set(k, e);
    now.dirty = true;
    return e;
  }

  function vents(st) {
    let list = null;
    try { list = ctx.colossus?.anchors?.('vents'); } catch { list = null; }
    if (!Array.isArray(list) || !list.length) return;
    if (ctx.colossus && ctx.colossus.visible === false) return;
    const t = I.tq, life = 4.0, dt = 0.2;
    const n = Math.min(list.length, 20);
    const sNow = ventStrength(st.t) || 1;
    const kNow = Math.floor(t / dt);
    const now = { dirty: false };
    // gather the birth poses first (re-posing the body), then put it back exactly as the colossus left it
    const births = [];
    for (let q = 0; q < Math.ceil(life / dt); q++) {
      const k = kNow - q, a = t - k * dt;
      if (a < 0 || a > life) continue;
      births.push([k, a, ventsAt(k, dt, now)]);
    }
    if (now.dirty) { try { ctx.colossus.pose(st.t); } catch { /* keep going */ } }
    // keep the face clear: billows born where the head used to be are pushed out of a sphere round the head now
    const head = anchor(ctx.colossus, 'head', [COLOSSUS.pos[0], 80, COLOSSUS.pos[2]]);
    const HEAD_R = 7.5;
    for (let j = 0; j < n; j++) {
      const v = list[j];
      const pNow = toV(v.pos, new V()), dNow = toV(v.dir, new V(0, 1, 0)).normalize();
      const sj = clamp(v.strength ?? 1, 0, 3) / sNow;
      if (!pNow) continue;
      puffs.inkZ = 0;
      for (const [k, a, hist] of births) {
        // while the colossus crouches behind the wall the column is the steam; the vents start once it moves
        if (k * dt < C.hand + 1) continue;
        const legAct = k * dt > 54.6 && k * dt < 60.5;
        if (legAct && !(j >= 2 && j <= 5)) continue;
        const sb = ventStrength(k * dt) * sj;
        if (sb < 0.03) continue;
        const s = clamp(sb, 0, 3);
        const p = hist && hist[j] ? hist[j].pos : pNow, d = hist && hist[j] ? hist[j].dir : dNow;
        const V0 = 34 * Math.sqrt(s), tau = 0.5;
        const h1 = hash(k, j, 71), h2 = hash(k, j, 72), h3 = hash(k, j, 73);
        const travel = V0 * tau * (1 - Math.exp(-a / tau)) + 3 * a;
        // the plume billows outward and leans downwind (+X), each lobe wandering off the centre line
        const wind = 6.5 * a + 1.2 * a * a;
        let x = p.x + d.x * travel + wind + (h1 - 0.5) * (1.5 + 4 * a);
        let y = p.y + d.y * travel + 2.2 * a * a + (hash(k, j, 74) - 0.5) * 2 * a;
        let z = p.z + d.z * travel + (h2 - 0.5) * (1.5 + 4 * a);
        // hot jet first (narrow, fast), then it blooms into billows that keep swelling
        const bloom = smooth(invLerp(0.18, 0.7, a));
        const r = (0.7 + 0.6 * a + 6.5 * bloom * (1 + 1.3 * a / life)) * (0.75 + 0.5 * h3) * Math.sqrt(s) * 1.2;
        const rk = legAct ? 0.5 : 1;
        // billows that drift into the head dissolve before they reach the face
        const dHead = Math.hypot(x - head.x, y - head.y, z - head.z) - HEAD_R - r * 0.6;
        const faceCut = clamp(1 - dHead / Math.max(2, r));
        if (faceCut > 0.97) continue;
        const fade = Math.max(faceCut, clamp(invLerp(life * 0.55, life, a + 0.4 * h3)));
        const tongue = a < 0.32;
        const tn = massTone(x, y, z, p.x + d.x * travel * 0.5, p.y, p.z + d.z * travel * 0.5, 4 + travel * 0.5, 0.0);
        // clean cel lobes: no dissolve holes, they shrink away; a tight hot jet at the nozzle first
        // old lobes shrink only a little and break up at the top, so no little ball caps the plume
        const rr = r * rk * (1 - 0.35 * fade);
        if (rr < (tongue ? 0.3 : 1.2)) continue;
        // one ink layer per vent: the lobes of a plume merge, ink only on its silhouette
        puffs.inkZ = inkZ(pNow.x, pNow.y, pNow.z) + j * 3;
        if (tongue) puffs.push(x, y, outside(x, y, z, rr), rr, rr * 4, 0.6, 0.1, d.x, d.y, d.z, (k + j * 7) % 97, -0.3, 0, KIND.TONGUE, PAL.FLASH, ID.STEAM[j % 3]);
        else puffs.push(x, y, outside(x, y, z, rr), rr, 0, 1, 0.22, d.x, d.y, d.z, (k + j * 7) % 97, 0.6 * tn, clamp(invLerp(0.45, 1, fade)), KIND.PUFF, PAL.CLEAN, ID.STEAM[j % 3]);
      }
    }
    puffs.inkZ = 0;
  }

  // ================================================================== 9. DISSOLVE
  function dissolve(st) {
    const t = I.tq, t0 = C.breach;
    if (t < t0) return;
    const chest = anchor(ctx.colossus, 'chest', [0, 62, COLOSSUS.pos[2]]);
    const cx = chest.x, cz = chest.z;
    // the body bursts into steam from the inside out: billows swell over its whole height, then the bloom climbs
    const n = 110;
    puffs.inkZ = 0;
    for (let i = 0; i < n; i++) {
      const b = t0 + 0.2 + 1.6 * Math.pow(hash(i, 3, 1), 1.3);
      const a = t - b;
      if (a < 0) continue;
      const hy = hash(i, 3, 2);
      const y0 = 6 + 86 * hy;
      const halfW = y0 > 64 ? 15 : 22;
      const x0 = cx + (hash(i, 3, 3) - 0.5) * 2 * halfW;
      const z0 = cz + (hash(i, 3, 4) - 0.5) * 16;
      const g = 1 - Math.exp(-a / 0.9);
      const out = 18 * g;
      const dx = (x0 - cx) / halfW;
      const climb = 7 * a + 1.6 * a * a * (0.5 + hy);
      const x = x0 + dx * out + 4 * a, y = y0 + climb + 8 * g, z = z0 - 8 * g * hash(i, 3, 5);
      const r = (4.5 + 9 * Math.pow(hash(i, 3, 6), 1.5)) * (0.3 + 1.4 * g) * (1 + 0.12 * a);
      // thins from the bottom up as it climbs, so the walkers read against it
      const fade = clamp(invLerp(3.6, 6.6, a + hash(i, 3, 7) * 1.5 + (1 - hy) * 0.8));
      if (fade > 0.98) continue;
      const tn = 0.6 * massTone(x, y, z, cx + 4 * a, 55 + climb, cz, 55, -0.04);
      const rr = r * 1.25 * (1 - fade);
      if (rr < 0.5) continue;
      puffs.inkZ = inkZ(cx, 60, cz) + (i % 3) * 25;
      puffs.push(x, y, outside(x, y, z, rr), rr, 0, 0.9, 0.2, 0, 1, 0, (i * 7) % 97, tn, 0, KIND.PUFF, PAL.CLEAN, ID.STEAM[Math.floor(i / 9) % 3]);
    }
    puffs.inkZ = 0;
    // a white glow inside the steam as the body goes
    const gk = smooth(invLerp(t0, t0 + 0.6, t)) * (1 - smooth(invLerp(t0 + 1.4, t0 + 2.8, t)));
    if (gk > 0) glows.push(new V(cx, 50, cz + 10), { kind: GLOW.soft, m: 90, color: [0.7, 0.95, 1.0], power: 0.7 * gk, mode: 0, bias: 30 });
  }

  // thin steam wisps curling up from the hot rubble in the breach (s29 and after)
  function rubbleWisps(st) {
    const t = I.tq, t0 = C.kick + 3;
    if (t < t0) return;
    // a few soft clean plumes rising from the hot rubble: round lobes, one ink silhouette per plume
    const life = 4.5, dt = 0.35;
    for (let j = 0; j < 4; j++) {
      const sx = hr(j, 0, 91, -8, 8), sz = hr(j, 0, 92, -304, -290);
      const sy = groundY(sx, sz + 12) + hr(j, 0, 93, 0.5, 2);
      const kNow = Math.floor(t / dt);
      puffs.inkZ = inkZ(sx, sy + 4, sz) + j * 2;
      for (let q = 0; q < Math.ceil(life / dt); q++) {
        const k = kNow - q, b = k * dt, a = t - b;
        if (b < t0 || a < 0 || a > life) continue;
        const y = sy + 1 + 2.2 * a;
        const sway = Math.sin(a * 1.1 + j * 2) * 0.5 * a + 1.0 * a;
        const r = (1.1 + 0.7 * a) * (0.85 + 0.3 * hash(k, j, 94));
        const fade = clamp(invLerp(life * 0.5, life, a));
        const rr = r * (1 - 0.5 * fade) * smooth(a / 0.4);
        if (rr < 0.25) continue;
        puffs.push(sx + sway, y, sz + 0.3 * a, rr, 0, 0.9, 0.2, 0, 1, 0, (k + j * 5) % 97, 0.1, clamp(invLerp(0.5, 1, fade)), KIND.PUFF, PAL.CLEAN, ID.STEAM[j % 3]);
      }
    }
    puffs.inkZ = 0;
  }

  // ================================================================== 4. GRIP
  function grip(st) {
    const t = I.tq, t0 = C.hand + 0.33;   // the fingers hit the stone (colossus-pose: hand + 0.33)
    if (t < t0) return;
    const P = anchor(ctx.town, 'gripCrack', COLOSSUS.gripHand);
    const faceZ = wallInnerZ(P.x);
    // chips: thrown off the parapet, falling down the inner face, resting at its foot
    for (let i = 0; i < 30; i++) {
      const b = t0 + 0.04 + (i < 18 ? 0.08 * hash(i, 4, 1) : 0.3 + 1.6 * hash(i, 4, 1));
      const a = t - b;
      if (a < 0) continue;
      const sz = i < 18 ? hr(i, 4, 2, 0.25, 1.1) : hr(i, 4, 2, 0.15, 0.5);
      const p0 = _w.set(P.x + (hash(i, 4, 3) - 0.5) * 14, P.y + hr(i, 4, 4, -2, 2), faceZ + hr(i, 4, 5, 0.5, 3));
      const v0 = _u.set((hash(i, 4, 6) - 0.5) * 16, hr(i, 4, 7, 2, 13), hr(i, 4, 8, 1, 7));
      const floor = groundY(p0.x, faceZ + 4) + sz * 0.3;
      const f = flight(_v, p0, v0, a, floor, 0.2, 0.4);
      const sp = f.ts;
      const col = i % 5 === 0 ? STONE_B : STONE_A;
      if (sz > 0.5) rocks.push(_v.x, _v.y, _v.z, sp * hr(i, 4, 9, -5, 5), sp * hr(i, 4, 10, -5, 5), 0, sz, sz * 0.8, sz * 1.1, col);
      else pebbles.push(_v.x, _v.y, _v.z, sp * 4, sp * 3, 0, sz, sz, sz, col);
      // a puff where it lands
      const la = a - f.land;
      if (sz > 0.9 && la > 0 && la < 2.5) {
        const r = sz * (1 + 2.2 * (1 - Math.exp(-la / 0.4)));
        puffs.push(_v.x, _v.y + r * 0.5, _v.z + 0.5, r, 0, 1, 0.5, 0, 1, 0, i % 97, 0.1, clamp(invLerp(1.0, 2.5, la)), KIND.PUFF, PAL.PALE, ID.DUST[i % 3]);
      }
    }
    // the stone powder burst at the slam, and a curtain sliding down the face
    const a = t - t0;
    if (a < 4.5) {
      puffs.inkZ = inkZ(P.x, P.y, faceZ + 4);
      for (let i = 0; i < 18; i++) {
        const del = hash(i, 5, 1) * 0.15;
        const aa = a - del;
        if (aa < 0) continue;
        const g = 1 - Math.exp(-aa / 0.45);
        const az = (hash(i, 5, 2) - 0.5) * Math.PI;
        // burst at the slam, then everything slides outward and down off the fingers and thins by ~0.55 s
        const side = Math.sin(az) >= 0 ? 1 : -1;
        const off = Math.max(0, aa - 0.2);
        const x = P.x + Math.sin(az) * 9 * g + (hash(i, 5, 3) - 0.5) * 5 + side * (10 * off + 6 * off * off);
        const y = P.y + 0.5 + 4 * g * hash(i, 5, 4) - (i % 3 === 0 ? 14 * aa * hash(i, 5, 7) : 0) - 9 * off * off - 3 * off;
        const z = faceZ + 1.0 + Math.cos(az) * 3.5 * g + 2 * off;
        const r = (0.5 + 1.0 * hash(i, 5, 5)) * (0.4 + 0.9 * g);
        const fade = clamp(invLerp(0.3, 0.75, aa + hash(i, 5, 6) * 0.15));
        if (fade > 0.98) continue;
        const tn = massTone(x, y, z, P.x, P.y, faceZ, 10, 0.06);
        puffs.push(x, y, z, r, 0, 1, 0.55, 0, 1, 0, (i * 5) % 97, tn, fade, KIND.PUFF, PAL.PALE, ID.DUST[i % 3]);
      }
      puffs.inkZ = 0;
      for (let i = 0; i < 6; i++) {
        const k = smooth(a / 0.15) * (1 - smooth(invLerp(0.3, 0.6, a)));
        veil(P.x + (hash(i, 6, 1) - 0.5) * 20, P.y - 4 - 12 * a * hash(i, 6, 2), faceZ + 3, 7 + 4 * a, 5 + 3 * a, i + 3, 0.28 * k, PALETOP, PALEBOT, 6);
      }
    }
  }

  // ================================================================== 10. DUST over the gate
  function gateDust(st) {
    const t = I.tq;
    if (t < C.silence - 0.3 || t > C.kick + 0.05) return;
    const A = anchor(ctx.town, 'gateArch', [0, GATE.h, wallInnerZ(0)]);
    const SAND = ['#e9c99e', '#dcb68a', '#f3dcb8'];
    // fine sand falls: thin straight streams of grains shaken out of the arch joints
    for (let s = 0; s < 6; s++) {
      const sx = A.x + hr(s, 0, 81, -GATE.w * 0.42, GATE.w * 0.42);
      const sz0 = A.z + 0.8 + hr(s, 0, 85, 0, 0.6);
      const start = C.silence - 0.2 + hash(s, 0, 82) * 0.9;
      const on = smooth(invLerp(start, start + 0.25, t));
      if (on <= 0) continue;
      const floor = groundY(sx, A.z + 6);
      const top = A.y - 0.5, H = top - floor;
      const thick = s === 2 ? 1.6 : 1;
      // the stream itself: a thin straight vertical streak growing down from the arch
      const GS = G_ACC * 2.2;   // sand already moving when it leaves the joint
      const fallT = Math.sqrt(2 * H / GS);
      const reach = Math.min(1, 0.5 * GS * Math.pow(t - start, 2) / H);
      // one straight streak, broken into grain by the dissolve noise
      if (reach > 0.01) {
        const len = H * reach, w = 0.06 * thick * on;
        puffs.push(sx, top - len, sz0, w, len, 0.6, 0, 0, 1, 0, s * 7 % 97, -0.4, 0.3, KIND.DROP, PAL.DUST, ID.FINE);
      }
      // grains travelling down the stream
      for (let g = 0; g < 16; g++) {
        const ph = ((t - start) / fallT * 1.3 + hash(g, s, 88)) % 1;
        const y = top - H * ph * ph;
        if (t - start < ph * fallT) continue;
        const gz = hr(g, s, 89, 0.07, 0.15) * thick;
        pebbles.push(sx + hr(g, s, 90, -0.12, 0.12) * (1 + ph * 2), y, sz0 + hr(g, s, 91, -0.1, 0.1), ph * 9, ph * 7, 0, gz, gz, gz, SAND[g % 3]);
      }
      // small puffs where the sand lands
      if (reach >= 1) {
        const dtp = 0.18, kNow = Math.floor(t / dtp);
        for (let q = 0; q < 8; q++) {
          const k = kNow - q, a = t - k * dtp - start - fallT;
          if (a < 0 || a > 1.4) continue;
          const r = (0.18 + 0.35 * a) * thick * (0.8 + 0.4 * hash(k, s, 92));
          const ang = hash(k, s, 93) * 6.28;
          puffs.push(sx + Math.cos(ang) * 0.5 * a, floor + 0.12 + 0.5 * a, sz0 + Math.sin(ang) * 0.5 * a, r, 0, 1, 0.45, 0, 1, 0, (k + s) % 97, 0.05, clamp(invLerp(0.6, 1.4, a)), KIND.PUFF, PAL.DUST, ID.FINE);
        }
        // a little cone of sand piling up
        const pile = Math.min(0.35, 0.18 * (t - start - fallT)) * thick;
        if (pile > 0.02) pebbles.push(sx, floor + pile * 0.2, sz0, 0, s, 0, pile * 1.6, pile * 0.5, pile * 1.6, SAND[s % 3]);
      }
    }
    // dust motes drifting in the light under the arch
    for (let m = 0; m < 70; m++) {
      const ph = t * hr(m, 0, 94, 0.05, 0.14) + hash(m, 0, 95);
      const x = A.x + hr(m, 0, 96, -GATE.w * 0.7, GATE.w * 0.7) + 0.6 * Math.sin(ph * 6.28);
      const y = groundY(x, A.z + 6) + 0.6 + ((ph * 3.5 + hash(m, 0, 97) * A.y) % (A.y * 0.95));
      const z = A.z + hr(m, 0, 98, 1, 9) + 0.4 * Math.cos(ph * 5);
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + m);
      const k = smooth(invLerp(C.silence - 0.3, C.silence + 0.5, t));
      glows.push(new V(x, y, z), { kind: GLOW.soft, px: 3.2 + 2 * hash(m, 0, 99), color: [1.0, 0.9, 0.7], power: 0.55 * k * (0.5 + 0.5 * tw), mode: 0, bias: 1 });
    }
    // the whole arch breathes a fine veil
    const k = smooth(invLerp(C.silence, C.silence + 0.6, t));
    veil(A.x, A.y - 4, A.z + 2, GATE.w * 0.6, 5, 11, 0.12 * k, DUSTTOP, DUSTBOT, 4);
  }

  // ================================================================== 5. GATE BURST
  const CAM25 = new V(PLACES.gateInside[0], 3, PLACES.gateInside[2]);
  const GATE_Z = wallInnerZ(0);
  const STREET_CAMS = [new V(PLACES.streetView[0], 2, PLACES.streetView[2]), CAM25];
  const gatePieces = [];
  {
    for (let i = 0; i < 44; i++) {
      const isDoor = i < 10;
      const sz = isDoor ? [hr(i, 2, 1, 2.2, 4.2), hr(i, 2, 2, 3, 6), hr(i, 2, 3, 0.5, 0.8)] : [hr(i, 2, 1, 0.9, 3.4), hr(i, 2, 2, 0.8, 2.4), hr(i, 2, 3, 0.9, 2.8)];
      const p0 = new V(hr(i, 2, 4, -GATE.w * 0.42, GATE.w * 0.42), isDoor ? hr(i, 2, 5, 2, GATE.h - 4) : hr(i, 2, 5, GATE.h - 5, GATE.h + 6), GATE_Z - (isDoor ? 6 : 2));
      const v0 = new V(p0.x * hr(i, 2, 6, 0.3, 1.0) + hr(i, 2, 7, -3, 3), hr(i, 2, 8, 1, 8), isDoor ? hr(i, 2, 9, 9, 18) : hr(i, 2, 9, 9, 22));
      const del = hash(i, 2, 10) * 0.12 + (isDoor ? 0 : 0.05);
      // keep the lens clear: nudge sideways until the path misses the burst camera by 8 m
      for (let tries = 0; tries < 12; tries++) {
        let hit = false;
        for (let s = 0; s < 40; s++) {
          const a = s * 0.05;
          const f = flight(_v, p0, v0, a, groundY(p0.x, p0.z + 30) + sz[1] * 0.38);
          void f;
          if (STREET_CAMS.some((c) => _v.distanceTo(c) < 4.5 + Math.max(...sz) * 0.6)) { hit = true; break; }
        }
        if (!hit) break;
        v0.x += (p0.x >= 0 ? 1 : -1) * 4;
        v0.y += 1.5;
      }
      // big pieces come to rest in the plaza (z < -262), never in the street the folk run down
      for (let tries = 0; tries < 10; tries++) {
        flight(_v, p0, v0, 20, groundY(p0.x, p0.z + 30) + sz[1] * 0.38, 0.25, 0.4);
        if (_v.z < -264 || isDoor === false && Math.max(...sz) < 1.2) break;
        v0.z *= 0.85;
      }
      gatePieces.push({ isDoor, sz, p0, v0, del, rot: [hr(i, 2, 11, -6, 6), hr(i, 2, 12, -4, 4), hr(i, 2, 13, -6, 6)] });
    }
  }
  function gateBurst(st) {
    const t = I.tq;
    if (t < C.kick) return;
    for (let i = 0; i < gatePieces.length; i++) {
      const g = gatePieces[i];
      const a = t - C.kick - g.del;
      if (a < 0) continue;
      const floor = groundY(g.p0.x, g.p0.z + 30) + g.sz[1] * 0.38;
      const f = flight(_v, g.p0, g.v0, a, floor, 0.25, 0.4);
      const s = f.ts;
      if (g.isDoor) bronze.push(_v.x, _v.y, _v.z, g.rot[0] * s * 0.6, g.rot[1] * s * 0.6, g.rot[2] * s * 0.6, g.sz[0], g.sz[1], g.sz[2], i % 3 ? '#9a6a36' : '#7a5230');
      else (i % 3 === 0 ? rocks : blocks).push(_v.x, _v.y, _v.z, g.rot[0] * s, g.rot[1] * s, g.rot[2] * s, g.sz[0], g.sz[1], g.sz[2], i % 4 ? STONE_C : STONE_B);
      // dust kicked where it lands
      const la = a - f.land;
      if (la > 0 && la < 3) {
        const r = Math.max(...g.sz) * (0.4 + 0.9 * (1 - Math.exp(-la / 0.35)));
        puffs.push(_v.x, _v.y + r * 0.3, _v.z, r, 0, 1, 0.55, 0, 1, 0, i % 97, 0.12, clamp(invLerp(1.2, 3, la)), KIND.PUFF, PAL.DUST, ID.DUST[i % 3]);
      }
    }
    // small stones in the burst
    for (let i = 0; i < 90; i++) {
      const a = t - C.kick - hash(i, 8, 1) * 0.2;
      if (a < 0) continue;
      const p0 = _w.set(hr(i, 8, 2, -GATE.w * 0.5, GATE.w * 0.5), hr(i, 8, 3, 1, GATE.h + 4), GATE_Z - 3);
      const v0 = _u.set(p0.x * hr(i, 8, 4, 0.5, 2.5), hr(i, 8, 5, 0, 14), hr(i, 8, 6, 10, 30));
      const sz = hr(i, 8, 7, 0.15, 0.6);
      const f = flight(_v, p0, v0, a, groundY(p0.x, p0.z + 20) + sz * 0.3, 0.3, 0.5);
      if (_v.distanceTo(CAM25) < 2.5) continue;
      pebbles.push(_v.x, _v.y, _v.z, f.ts * 9, f.ts * 7, 0, sz, sz * 0.8, sz, i % 3 ? STONE_A : '#cfa284');
    }
    // the dust explosion rushing in through the breach, then hanging over the plaza
    const a = t - C.kick;
    if (a < 9) {
      puffs.inkZ = 0;
      for (let i = 0; i < 80; i++) {
        const aa = a - 0.06 - hash(i, 10, 1) * 0.35;
        if (aa < 0) continue;
        const g = 1 - Math.exp(-aa / 0.9);
        const reach = hr(i, 10, 2, 6, 26);
        const x = hr(i, 10, 3, -GATE.w * 0.5, GATE.w * 0.5) * (1 + 1.6 * g) + 2 * aa;
        const y = hr(i, 10, 4, 0.5, GATE.h + 4) * (0.6 + 0.6 * g) + 2.5 * aa;
        const z = GATE_Z + reach * g + 1.2 * aa - 4;
        const r = hr(i, 10, 5, 2, 4.5) * (0.3 + 1.3 * g);
        // after the s25 burst, half the billows thin away so the street and the torn house read through it
        const thin = hash(i, 10, 9) < 0.5 ? smooth(invLerp(C.kick + 1.2, C.kick + 2.6, t)) : 0;
        const fade = Math.max(thin, clamp(invLerp(1.8, 4.4, aa + hash(i, 10, 6) * 1.4)));
        if (fade > 0.98) continue;
        const tn = massTone(x, y, z, 0, 10, GATE_Z + 8, 20, 0.12);
        const dir = aa < 0.4;
        puffs.push(x, y, z, r, dir ? r * 2.5 : 0, dir ? 0.4 : 1, 0.55, x * 0.05, 0.2, 1, (i * 3) % 97, tn, fade, dir ? KIND.TONGUE : KIND.PUFF, PAL.DUST, ID.DUST[i % 3]);
      }
      for (let i = 0; i < 10; i++) {
        const k = smooth(a / 0.4) * (1 - smooth(invLerp(1.6, 4, a)));
        veil(hr(i, 11, 1, -20, 20), hr(i, 11, 2, 3, 22), GATE_Z + 6 + 22 * (1 - Math.exp(-a / 0.8)) * hash(i, 11, 3), 14 + 3 * a, 10 + 2 * a, i + 5, 0.22 * k, DUSTTOP, DUSTBOT, 10);
      }
    }
    if (a >= 0 && a < 0.5) glows.push(new V(0, 10, GATE_Z + 2), { kind: GLOW.soft, m: 40, color: [1.0, 0.92, 0.75], power: 0.6 * (1 - a / 0.5), mode: 0, bias: 8 });
  }

  // ================================================================== 6. BOULDERS + HOUSE HIT
  const boulders = [];
  {
    let i = 0, tries = 0;
    while (boulders.length < 15 && tries < 400) {
      tries++;
      const s = 900 + tries;
      const lx = hr(s, 1, 1, -150, 150), lz = hr(s, 1, 2, -255, -105);
      if (Math.abs(lx) < 24) continue;                       // the main street (cameras, running folk)
      if (Math.abs(lx) < 44 && lz > -165 && lz < -80) continue;   // the square (crowd)
      if (Math.abs(lx - PLACES.houseHit[0]) < 10 && Math.abs(lz - PLACES.houseHit[2]) < 12) continue;
      // nothing leaves the gate before the kick: launches spread from just after it
      const tl = C.kick + 1.5 + (i / 14) * 6.2 + hr(s, 1, 3, -0.3, 0.3);
      const T = Math.min(hr(s, 1, 4, 3.2, 4.4), tl - C.kick - 0.1);
      const p0 = new V(hr(s, 1, 5, -16, 16), hr(s, 1, 6, 22, 44), GATE_Z - 8);
      const sz = hr(s, 1, 7, 2.5, 6.5);
      const p1 = new V(lx, sz * 0.35, lz);
      const v0 = new V((p1.x - p0.x) / T, (p1.y - p0.y + 0.5 * G_ACC * T * T) / T, (p1.z - p0.z) / T);
      boulders.push({ b: tl - T, T, p0, v0, sz, s, rot: [hr(s, 1, 8, -2, 2), hr(s, 1, 9, -2, 2), hr(s, 1, 10, -2, 2)] });
      i++;
    }
  }
  // two hero blocks for s26: they sail over the street view (camera at x -4, z -224 looking up at x 12, z -262)
  for (const [lx, lz, tl, sz] of [[46, -196, 61.1, 4.5], [52, -140, 61.5, 5.5], [70, -232, 60.7, 3.8]]) {
    const T = Math.min(3.0, tl - C.kick - 0.1);
    const p0 = new V(lx > 0 ? 6 : -6, 34, GATE_Z - 8);
    const p1 = new V(lx, sz * 0.35, lz);
    const v0 = new V((p1.x - p0.x) / T, (p1.y - p0.y + 0.5 * G_ACC * T * T) / T, (p1.z - p0.z) / T);
    boulders.push({ b: tl - T, T, p0, v0, sz, s: 990 + boulders.length, rot: [1.3, -0.8, 0.9] });
  }
  // impacts (for sound / camera shake): [{ t, pos, size }]
  const impacts = boulders.map((b) => ({ t: b.b + b.T, pos: b.p0.clone().addScaledVector(b.v0, b.T).setY(0), size: b.sz }));
  const HIT_T = C.houseHit;
  const hitBlock = { sz: 4.2, launch: C.debris - 0.1 };
  impacts.push({ t: HIT_T, pos: null, size: 4.2, houseHit: true });

  function boulderDust(x, z, a, sz, seed) {
    // the impact dust: a fat skirt, then a column rising over the roofs
    if (a < 0 || a > 9) return;
    puffs.inkZ = inkZ(x, 10, z);
    const n = sz < 2 ? 10 : 22;
    for (let i = 0; i < n; i++) {
      const g = 1 - Math.exp(-a / 0.5);
      const az = hash(i, seed, 1) * Math.PI * 2;
      const up = hash(i, seed, 2);
      const cap = up > 0.7 ? (up - 0.7) / 0.3 : 0;
      const rad = (3 + 9 * g) * (0.3 + 0.7 * hash(i, seed, 3)) * (1 - up * 0.6) + cap * (3 + sz * 1.0) * (1 - Math.exp(-a / 2.5));
      const H = (7 + sz * 3) * (1 - Math.exp(-a / 2.2));
      const y = 2 + up * H + up * 3 * a;
      const px = x + Math.cos(az) * rad + 2.5 * a * up, pz = z + Math.sin(az) * rad;
      const r = (1.2 + sz * 0.5) * (0.5 + 0.9 * g) * (0.8 + 0.5 * hash(i, seed, 4)) * (1 + 0.15 * a) * (1 + 0.6 * cap);
      const fade = clamp(invLerp(3, 6.5, a + hash(i, seed, 5) * 1.5));
      if (fade > 0.98) continue;
      const tn = massTone(px, y, pz, x, H * 0.5, z, 8 + H * 0.4, 0.08);
      puffs.push(px, y, pz, r, 0, 1, 0.55, 0, 1, 0, (i + seed) % 97, tn, fade, KIND.PUFF, PAL.DUST, ID.DUST[(i + seed) % 3]);
    }
    puffs.inkZ = 0;
    const k = smooth(a / 0.3) * (1 - smooth(invLerp(4, 9, a)));
    veil(x, 6 + 3 * a, z, 12 + 2.5 * a, 9 + 2 * a, seed, 0.3 * k, DUSTTOP, DUSTBOT, 12);
  }

  function boulderTrail(px, py, pz, vx, vy, vz, sz, a, seed) {
    // dust streaming off a flying block
    for (let k = 1; k <= 5; k++) {
      const back = k * 0.07;
      if (a - back < 0) break;
      const x = px - vx * back, y = py - vy * back + 0.5 * G_ACC * back * back * 0.3, z = pz - vz * back;
      const r = sz * (0.4 + 0.1 * k);
      puffs.push(x, y, z, r, 0, 1, 0.5, 0, 1, 0, (seed + k) % 97, 0.15, clamp(k / 6 + 0.1), KIND.PUFF, PAL.DUST, ID.DUST[k % 3]);
    }
  }

  function boulderRain(st) {
    const t = I.tq;
    if (t < C.kick) return;
    for (const B of boulders) {
      const a = t - B.b;
      if (a < 0) continue;
      const floor = groundY(B.p0.x + B.v0.x * B.T, B.p0.z + B.v0.z * B.T) + B.sz * 0.35;
      const f = flight(_v, B.p0, B.v0, a, floor, 0.18, 0.3);
      const s = f.ts;
      blocks.push(_v.x, _v.y, _v.z, B.rot[0] * s, B.rot[1] * s, B.rot[2] * s, B.sz, B.sz * 0.75, B.sz * 0.9, B.s % 3 ? STONE_A : STONE_B);
      if (a < f.land) boulderTrail(_v.x, _v.y, _v.z, B.v0.x, B.v0.y - G_ACC * a, B.v0.z, B.sz, a, B.s);
      boulderDust(B.p0.x + B.v0.x * B.T, B.p0.z + B.v0.z * B.T, a - f.land, B.sz, B.s % 50);
    }
    // the house hit: a block arrives at the facade exactly at C.houseHit
    const F = anchor(ctx.town, 'houseHitFacade', [PLACES.houseHit[0] - 7, 6, PLACES.houseHit[2]]);
    const T = HIT_T - hitBlock.launch;
    const L0 = _w.set(-3, 26, GATE_Z - 6);
    const hv = new V((F.x - L0.x) / T, (F.y - L0.y + 0.5 * G_ACC * T * T) / T, (F.z - L0.z) / T);
    const a = t - hitBlock.launch;
    if (a >= 0) {
      const sz = hitBlock.sz;
      let rx;
      if (a <= T) {
        _v.copy(L0).addScaledVector(hv, a); _v.y -= 0.5 * G_ACC * a * a;
        rx = a;
        boulderTrail(_v.x, _v.y, _v.z, hv.x, hv.y - G_ACC * a, hv.z, sz, a, 77);
      } else {
        // it smashes through and drops into the house
        const vIn = new V(hv.x * 0.25 + 3, (hv.y - G_ACC * T) * 0.2, hv.z * 0.2);
        const f = flight(_v, F, vIn, a - T, groundY(F.x + 3, F.z) + sz * 0.35, 0.1, 0.3);
        rx = T + f.ts * 0.3;
      }
      blocks.push(_v.x, _v.y, _v.z, rx * 1.4, rx * 0.8, rx * 1.1, sz, sz * 0.8, sz * 0.9, STONE_A);
    }
    // facade pieces scatter at the hit
    const ha = t - HIT_T;
    if (ha >= 0) {
      const nx = -1; // facade faces the street (west, -x)
      for (let i = 0; i < 34; i++) {
        const aa = ha - hash(i, 12, 1) * 0.08;
        if (aa < 0) continue;
        const p0 = _w.set(F.x + hr(i, 12, 2, -0.5, 1), F.y + hr(i, 12, 3, -5, 5), F.z + hr(i, 12, 4, -5, 5));
        const v0 = _u.set(nx * hr(i, 12, 5, -2, 4.5) + 2, hr(i, 12, 6, 1, 10), hv.z * hr(i, 12, 7, 0.15, 0.5) + hr(i, 12, 8, -4, 4));
        const sz = hr(i, 12, 9, 0.35, 1.8);
        const f = flight(_v, p0, v0, aa, groundY(p0.x, p0.z) + sz * 0.25, 0.25, 0.4);
        const s = f.ts;
        const isShutter = i % 7 === 0;
        stucco.push(_v.x, _v.y, _v.z, s * hr(i, 12, 10, -7, 7), s * hr(i, 12, 11, -7, 7), s * 3, sz, isShutter ? sz * 1.4 : sz * 0.7, isShutter ? 0.12 : sz * 0.5, isShutter ? '#2f5fc4' : i % 3 ? '#f6f0e6' : '#ecdcc4');
      }
      // the house dust stays small and clears fast: the torn facade must read in s26
      const bq = puffs.buds; puffs.buds = 0;
      boulderDust(F.x + 6, F.z, ha * 3, 0.7, 61);
      if (ha < 3) {
        puffs.inkZ = inkZ(F.x, F.y, F.z);
        for (let i = 0; i < 24; i++) {
          const g = 1 - Math.exp(-ha / 0.35);
          const x = F.x - 1 - 6 * g * hash(i, 13, 1), y = F.y + (hash(i, 13, 2) - 0.5) * 7 * (0.5 + g), z = F.z + (hash(i, 13, 3) - 0.3) * 9 * g;
          const r = (0.6 + 1.3 * hash(i, 13, 4)) * (0.5 + g);
          puffs.push(x, y, z, r, ha < 0.3 ? r * 2 : 0, 0.5, 0.55, -1, 0.2, 0.4, i % 97, massTone(x, y, z, F.x, F.y, F.z, 6, 0.12), clamp(invLerp(0.5, 1.5, ha + hash(i, 13, 5) * 0.6)), ha < 0.3 ? KIND.TONGUE : KIND.PUFF, PAL.DUST, ID.DUST[i % 3]);
        }
        puffs.inkZ = 0;
      }
      puffs.buds = bq;
    }
  }

  // ================================================================== 7. DUST WAVE
  function dustWave(st) {
    const t = I.tq, t0 = C.run - 0.4;
    if (t < t0 || t >= C.breach) return;
    const u = t - t0;
    let zf = GATE_Z + 26 + 30 * u;
    // never over the lens: stop short of whatever camera looks down the street
    if (st.sid === 's28' && st.cam) zf = Math.min(zf, st.cam.pos[2] - 14);
    const fadeAll = 0;
    puffs.inkZ = 0;
    const n = 150;
    for (let i = 0; i < n; i++) {
      const h1 = hash(i, 14, 1), h2 = hash(i, 14, 2), h3 = hash(i, 14, 3), h4 = hash(i, 14, 4);
      const back = Math.pow(h1, 1.6) * 44;
      const roofs = i % 4 === 0;
      const x = roofs ? (h2 - 0.5) * 50 : (h2 - 0.5) * 13;
      const H = 14 + back * 0.35 + (roofs ? 10 : 0);
      // rolling: billows turn over the front like a wheel
      const ph = u * 2.2 + h3 * 6.28;
      const rr = 2 + 3 * h4;
      const y = Math.max(1.5, h4 * H + Math.sin(ph) * rr + (roofs ? 8 : 0));
      const z = zf - back + Math.cos(ph) * rr * 0.6;
      const r = (2.8 + 3.4 * hash(i, 14, 5)) * (1 + back / 50) * (roofs ? 1.6 : 1);
      const front = back < 6 && !roofs;
      const tn = massTone(x, y, z, 0, H * 0.4, zf - 12, 16, 0.2) + 0.2 * (back / 50);
      puffs.push(x, y, z, r, front ? r * 2.2 : 0, front ? 0.35 : 1, 0.55, 0, 0.05, 1, i % 97, tn, Math.max(fadeAll, 0), front ? KIND.TONGUE : KIND.PUFF, PAL.OCHRE, ID.DUST[Math.floor(i / 7) % 3]);
    }
    // the foot of the wave: low curling skirt licking forward along the paving, grit skittering ahead
    for (let i = 0; i < 44; i++) {
      const h1 = hash(i, 17, 1), h2 = hash(i, 17, 2), h3 = hash(i, 17, 3);
      const x = (h1 - 0.5) * 14;
      const ph = u * 3.1 + h2 * 6.28;
      const lead = 1.5 + 2.5 * h3 + Math.sin(ph) * 1.2;
      const y = 0.6 + 1.6 * h2 + 0.5 * Math.cos(ph);
      const r = 0.9 + 1.4 * hash(i, 17, 4);
      const z = zf + lead - 3;
      const tn = 0.12 + 0.25 * (1 - h2) + massTone(x, y, z, 0, 2, zf - 3, 6, 0) * 0.5;
      const tongue = i % 3 === 0;
      puffs.push(x, y, z, r, tongue ? r * 2 : 0, tongue ? 0.4 : 1, 0.55, 0, 0.1, 1, (i * 5) % 97, tn, 0, tongue ? KIND.TONGUE : KIND.PUFF, PAL.OCHRE, ID.DUST[i % 3]);
    }
    for (let i = 0; i < 26; i++) {
      const c = (u * hr(i, 17, 5, 1.2, 2.2) + hash(i, 17, 6)) % 1;
      const x = hr(i, 17, 7, -6.5, 6.5) + Math.sin(c * 9 + i) * 0.4;
      const z = zf + 1 + 7 * c;
      const y = groundY(x, z) + 0.08 + Math.abs(Math.sin(c * 14 + i)) * 0.5 * (1 - c);
      const sz = hr(i, 17, 8, 0.07, 0.2);
      pebbles.push(x, y, z, c * 20, c * 13, 0, sz, sz * 0.8, sz, i % 3 ? STONE_B : STONE_C);
    }
    puffs.inkZ = 0;
    for (let i = 0; i < 12; i++) {
      veil(hr(i, 15, 1, -10, 10), hr(i, 15, 2, 2, 14), zf - hr(i, 15, 3, 4, 40), 10, 8, i + 9, 0.45 * (1 - fadeAll), DUSTTOP, DUSTBOT, 8);
    }
  }

  // ================================================================== 8. PETALS
  function petalsFx(st) {
    const t = onTwos(st.t);
    if (t > 1.7) return;
    // the s01 close-up looks down the steps toward (-35.6, -1, 70.4); the breeze blows across it to screen right
    const F = [-35.4, 70.9], W = [0.84, -0.54], Lat = [0.54, 0.84];
    const cols = ['#ec3fa8', '#d82c98', '#f466bc', '#c42290'];
    for (let i = 0; i < 46; i++) {
      const sp = hr(i, 16, 1, 0.5, 1.5);
      const along = hr(i, 16, 2, -2.8, 0.6), lat = hr(i, 16, 3, -1.6, 1.6);
      const a = t + hash(i, 16, 4) * 0.3;
      // gusting: skitter, pause, skitter
      const gust = a + 0.3 * Math.sin(a * 4.3 + i);
      const s = along + sp * gust;
      const wob = 0.12 * Math.sin(a * 2.1 + i * 1.7);
      const x = F[0] + W[0] * s + Lat[0] * (lat + wob);
      const z = F[1] + W[1] * s + Lat[1] * (lat + wob);
      const air = i % 6 === 0;   // a few ride the air
      const hop = air ? 0.15 + 0.25 * Math.abs(Math.sin(a * 1.7 + i)) : Math.abs(Math.sin(a * hr(i, 16, 5, 6, 11) + i)) * hr(i, 16, 6, 0.0, 0.06);
      const y = stepY(z) + 0.012 + hop;
      const sz = hr(i, 16, 7, 0.05, 0.08);
      const tum = hop > 0.02 ? 1 : 0.15;
      petals.push(x, y, z, Math.sin(a * 7 + i) * 1.1 * tum, a * hr(i, 16, 8, -5, 5) + i, Math.cos(a * 6 + i) * 0.8 * tum, sz, sz, sz, cols[i % 4]);
    }
  }

  // ================================================================== update
  const LV = new V(-0.45, 0.78, 0.44).normalize();
  // debug: ?fxoff=bolt,flashes skips effects
  const FXOFF = (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('fxoff') ?? '' : '').split(',');
  const api = {
    impacts,
    _dbg: { puffs, rocks, blocks },
    boulders: () => boulders,
    update(st) {
      I.t = st.t;
      I.tq = onThrees(st.t);
      I.draw = Math.floor(I.tq * 8 + 0.5);
      I.cam.copy(camera.position);
      camera.updateMatrixWorld();
      // drawn light: mostly the sun, cheated toward the upper left of the frame
      I.L.copy(LV).transformDirection(camera.matrixWorld).multiplyScalar(0.55).addScaledVector(ctx.G.uKeyDir.value, 0.45).normalize();
      try {
        const au = engine.mAtmos?.uniforms, pu = puffs.mesh.material.uniforms;
        if (au && pu.uFogD) { pu.uFogD.value = au.uFogDensity.value; pu.uFogC.value.copy(au.uFogCool.value).lerp(au.uFogWarm.value, 0.5); }
      } catch { /* no atmosphere: no compensation */ }
      puffs.begin(I.cam); rocks.begin(); blocks.begin(); bronze.begin(); stucco.begin(); pebbles.begin(); petals.begin();
      mist.begin(); lines.begin(); glows.begin();
      puffs.mesh.material.uniforms.uDrawing.value = I.draw;
      mist.mesh.material.uniforms.uDrawing.value = I.draw;
      const steps = [petalsFx, bolt, flashes, shock, steamColumn, wallBoil, vents, grip, gateDust, gateBurst, boulderRain, dustWave, dissolve, rubbleWisps];
      // the colossus face stays clear in its close and medium shots (45–56 s): nothing may sit in front of the visor
      puffs.guard = null;
      if (I.tq > 44 && I.tq < 56.5) {
        try {
          const hd = anchor(ctx.colossus, 'head', [0, 80, COLOSSUS.pos[2]]), vz = anchor(ctx.colossus, 'visor', [hd.x, hd.y, hd.z + 3]);
          puffs.guard = { x: (hd.x + vz.x) / 2, y: (hd.y + vz.y) / 2, z: (hd.z + vz.z) / 2, R: 7.5 };
        } catch { puffs.guard = null; }
      }
      let bodyGuard = null;
      // s23–s25 (55–60.5): the leg lift and the kick are the action — keep the whole body clear
      if (I.tq > 54.8 && I.tq < 60.5) {
        try {
          const g = [];
          for (const nm of ['head', 'chest', 'footR']) { const q = anchor(ctx.colossus, nm, [0, 40, COLOSSUS.pos[2]]); if (q) g.push({ x: q.x, y: q.y, z: q.z, R: nm === 'chest' ? 24 : 12 }); }
          const ch = anchor(ctx.colossus, 'chest', [0, 55, COLOSSUS.pos[2]]), fr = anchor(ctx.colossus, 'footR', [5, 3, COLOSSUS.pos[2]]);
          if (ch && fr) {
            for (const u of [0.3, 0.55, 0.8]) g.push({ x: ch.x + (fr.x - ch.x) * u, y: ch.y + (fr.y - ch.y) * u, z: ch.z + (fr.z - ch.z) * u, R: 15 });
            // the standing leg mirrored across the body centre
            for (const u of [0.45, 0.85]) g.push({ x: ch.x - (fr.x - ch.x) * u * 0.9, y: ch.y + (Math.min(fr.y, 8) - ch.y) * u, z: ch.z + (fr.z - ch.z) * u * 0.3, R: 14 });
          }
          if (g.length) bodyGuard = g;
        } catch { /* keep going */ }
      }
      const BUDS = { steamColumn: 0, wallBoil: 0, vents: 0, dissolve: 0, shock: 1, boulderRain: 2, gateBurst: 1 };
      for (const f of steps) { if (FXOFF.includes(f.name)) continue; puffs.buds = BUDS[f.name] ?? 0; const g0 = puffs.guard; if (f === vents && bodyGuard) puffs.guard = bodyGuard; try { f(st); } catch (e) { console.error(`[fx] ${f.name}: ${e.stack || e}`); } puffs.guard = g0; }
      puffs.end(); rocks.end(); blocks.end(); bronze.end(); stucco.end(); pebbles.end(); petals.end();
      mist.end(); lines.end(); glows.end();
    },
  };
  return api;
}
