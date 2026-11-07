import * as THREE from 'three';

// Folk heads as signed distance fields, meshed with surface nets and projected back onto the surface.
// One smooth skin: cranium + cheeks + jaw + a tapered (optionally upturned) muzzle + fur tufts/ruff/bangs,
// all smooth-unioned, so the silhouette carries the species (fox tufts, lynx ruff, long deer muzzle) without
// stuck-on parts or ink seams. Units: everything is designed in head radii (R = 1) and scaled at the end.

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function sdEll(x, y, z, c, r) {
  const px = x - c[0], py = y - c[1], pz = z - c[2];
  const k0 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
  const k1 = Math.hypot(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
  return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : k0 * (k0 - 1) / k1;
}
// round cone between a (radius r1) and b (radius r2), iq
function sdRoundCone(x, y, z, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
  const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
}

// head description (R = 1). H: { hw, hh, cheek:[w,y,z,r], jaw, muzzle:{len,r0,r1,y,up,sx,sy,z0}, tufts:[[base,tip,r]], bangs:[...], wool }
export function headSDF(H) {
  const prims = [];
  const M = H.muzzle;
  let mA, mB, mC, rm;
  if (M) {
    mA = [0, M.y, M.z0 ?? 0.42];
    mC = [0, M.y + (M.up ?? 0), (M.z0 ?? 0.42) + M.len];
    mB = [0, M.y - (M.up ?? 0) * 0.15 - (M.sag ?? 0), (mA[2] + mC[2]) / 2];
    rm = (M.r0 + M.r1) / 2 + (M.belly ?? 0);
  }
  const sx = M?.sx ?? 1, sy = M?.sy ?? 1, sMin = Math.min(sx, sy, 1);
  const tufts = H.tufts ?? [], bangs = H.bangs ?? [], wool = H.wool ?? [];
  if (H.woolCap) {
    // a cap of wool curls over the crown and the back of the head
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996, yy = 0.25 + 0.75 * ((i * 0.618034) % 1);
      const r = Math.sqrt(1 - yy * yy), dx = Math.cos(a) * r, dz = Math.sin(a) * r;
      if (dz > 0.55 && yy < 0.6) continue;     // keep the face clear
      wool.push([dx * 0.95, yy * 0.92 + 0.04, dz * 0.92 - 0.02, 0.2 + 0.04 * Math.sin(i * 3.1)]);
    }
  }
  const f = (x, y, z) => {
    let d = sdEll(x, y, z, [0, H.cy ?? 0.04, H.cz ?? -0.02], [H.hw ?? 1.02, H.hh ?? 0.95, H.hd ?? 0.95]);
    const ck = H.cheek ?? [0.42, -0.3, 0.25, 0.4];
    const ax = Math.abs(x);
    d = smin(d, sdEll(ax, y, z, [ck[0], ck[1], ck[2]], [ck[3] * (H.cheekW ?? 1.05), ck[3] * 0.88, ck[3]]), 0.28);
    if (H.jaw) d = smin(d, sdEll(x, y, z, [0, H.jaw[0], H.jaw[1]], [H.jaw[2], H.jaw[3], H.jaw[2]]), 0.22);
    if (M) {
      const X = x / sx, Y = (y - M.y) / sy + M.y;
      const dm = Math.min(sdRoundCone(X, Y, z, mA, mB, M.r0, rm), sdRoundCone(X, Y, z, mB, mC, rm, M.r1)) * sMin;
      d = smin(d, dm, M.k ?? 0.3);
    }
    for (const t of tufts) {
      const [b, e, r, k] = t;
      d = smin(d, sdRoundCone(ax, y, z, b, e, r, 0.03), k ?? 0.07);
    }
    for (const t of bangs) {
      const [b, e, r, k] = t;
      d = smin(d, sdRoundCone(x, y, z, b, e, r, 0.03), k ?? 0.06);
    }
    for (const w of wool) d = smin(d, Math.hypot(x - w[0], y - w[1], z - w[2]) - w[3], 0.08);
    return d;
  };
  return { f, muzzleTip: M ? mC : [0, -0.2, 0.95], muzzleR1: M ? M.r1 : 0.3, muzzle: M };
}

// surface nets mesher with Newton projection; returns an indexed BufferGeometry (positions scaled by R)
export function meshSDF(f, bmin, bmax, h, R) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / h) + 1, ny = Math.ceil((bmax[1] - bmin[1]) / h) + 1, nz = Math.ceil((bmax[2] - bmin[2]) / h) + 1;
  const V = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) V[id(i, j, k)] = f(bmin[0] + i * h, bmin[1] + j * h, bmin[2] + k * h);
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cell = new Int32Array(cx * cy * cz).fill(-1);
  const cid = (i, j, k) => i + cx * (j + cy * k);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { const o = corners[c]; cv[c] = V[id(i + o[0], j + o[1], k + o[2])]; if (cv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]), oa = corners[a], ob = corners[b];
      sx += oa[0] + (ob[0] - oa[0]) * t; sy += oa[1] + (ob[1] - oa[1]) * t; sz += oa[2] + (ob[2] - oa[2]) * t; n++;
    }
    cell[cid(i, j, k)] = pos.length / 3;
    pos.push(bmin[0] + (i + sx / n) * h, bmin[1] + (j + sy / n) * h, bmin[2] + (k + sz / n) * h);
  }
  const idx = [];
  const quad = (a, b, c, d) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 0; i < cx; i++) {
    if ((V[id(i, j, k)] < 0) === (V[id(i + 1, j, k)] < 0)) continue;
    quad(cell[cid(i, j - 1, k - 1)], cell[cid(i, j, k - 1)], cell[cid(i, j, k)], cell[cid(i, j - 1, k)]);
  }
  for (let k = 1; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 1; i < cx; i++) {
    if ((V[id(i, j, k)] < 0) === (V[id(i, j + 1, k)] < 0)) continue;
    quad(cell[cid(i - 1, j, k - 1)], cell[cid(i, j, k - 1)], cell[cid(i, j, k)], cell[cid(i - 1, j, k)]);
  }
  for (let k = 0; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 1; i < cx; i++) {
    if ((V[id(i, j, k)] < 0) === (V[id(i, j, k + 1)] < 0)) continue;
    quad(cell[cid(i - 1, j - 1, k)], cell[cid(i, j - 1, k)], cell[cid(i, j, k)], cell[cid(i - 1, j, k)]);
  }
  // project onto the surface, normals from the gradient
  const e = h * 0.35;
  const grad = (x, y, z) => [f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)];
  const nrm = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    let x = pos[v], y = pos[v + 1], z = pos[v + 2];
    for (let it = 0; it < 3; it++) {
      const d = f(x, y, z), g = grad(x, y, z), gl = g[0] * g[0] + g[1] * g[1] + g[2] * g[2] + 1e-12;
      const s = d * (2 * e) / gl;
      const mx = h * 0.6;
      x -= Math.max(-mx, Math.min(mx, s * g[0])); y -= Math.max(-mx, Math.min(mx, s * g[1])); z -= Math.max(-mx, Math.min(mx, s * g[2]));
    }
    const g = grad(x, y, z), l = Math.hypot(g[0], g[1], g[2]) || 1;
    pos[v] = x * R; pos[v + 1] = y * R; pos[v + 2] = z * R;
    nrm[v] = g[0] / l; nrm[v + 1] = g[1] / l; nrm[v + 2] = g[2] / l;
  }
  // winding: face normal must agree with the field gradient
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * (nrm[a] + nrm[b] + nrm[c]) + fy * (nrm[a + 1] + nrm[b + 1] + nrm[c + 1]) + fz * (nrm[a + 2] + nrm[b + 2] + nrm[c + 2]) < 0) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

// surface point + normal along a direction from the head centre (bisection on the field), in metres
export function surfFn(f, R) {
  return (dir) => {
    const d = dir.clone().normalize();
    let lo = 0, hi = 2.5;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(d.x * m, d.y * m, d.z * m) < 0) lo = m; else hi = m; }
    const t = (lo + hi) / 2, x = d.x * t, y = d.y * t, z = d.z * t, e = 0.004;
    const n = new THREE.Vector3(f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)).normalize();
    return { p: new THREE.Vector3(x * R, y * R, z * R), n };
  };
}

// cut the part of the head mesh around an eye into its own geometry, expressed in the eye pivot's
// unit frame (x, y in eye radii, z in rz) and lifted a hair off the skin: the eye is painted ON the face.
export function eyePatch(headGeo, piv, rx, ry, rz, lift) {
  const inv = new THREE.Matrix4().compose(piv.position, piv.quaternion, new THREE.Vector3(1, 1, 1)).invert();
  const p = headGeo.attributes.position, n = headGeo.attributes.normal, ix = headGeo.index.array;
  const map = new Map(), P = [], N = [], I = [];
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  const nm = new THREE.Matrix3().setFromMatrix4(inv);
  const local = (i) => { v.fromBufferAttribute(p, i); w.fromBufferAttribute(n, i); v.addScaledVector(w, lift).applyMatrix4(inv); return v; };
  for (let t = 0; t < ix.length; t += 3) {
    let inside = 0, front = true;
    for (let k = 0; k < 3; k++) {
      const q = local(ix[t + k]);
      if ((q.x / rx) ** 2 + (q.y / ry) ** 2 < 1.6) inside++;
      if (q.z < -rz * 0.5) front = false;
    }
    if (!inside || !front) continue;
    for (let k = 0; k < 3; k++) {
      const i = ix[t + k];
      if (!map.has(i)) {
        const q = local(i);
        map.set(i, P.length / 3);
        P.push(q.x / rx, q.y / ry, q.z / rz);
        w.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
        N.push(w.x * rx, w.y * ry, w.z * rz);   // pre-scaled: the mesh scale (rx, ry, rz) divides normals back
      }
      I.push(map.get(i));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  return g;
}

// fallback head from the old face parameters (muzzle length/width)
export function deriveHead(fc) {
  const mz = fc.muzzle ?? 0.4, mw = fc.muzzleW ?? 0.55;
  const pat = fc.pattern === 'face' ? 5 : fc.pattern === 'mask' ? 3 : fc.pattern === 'stripe' ? 4 : 2;
  return {
    cheek: [0.42, -0.3, 0.22, 0.36 + (fc.cheek ?? 0.12) * 0.4],
    muzzle: { len: 0.1 + mz * 0.8, r0: 0.3, r1: 0.1 + mw * 0.2, y: -0.24, up: 0.03, sx: 0.8 + mw * 0.4, sy: 0.85, z0: 0.45 },
    pat, p: [0.4, -0.32, 0.3, 0], ymouth: 0,
  };
}
