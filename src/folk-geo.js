import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';

// Folk modelling kit: soft rounded volumes with per-vertex colour (aCol) so one mesh can carry
// a white muzzle, dark ear tips or a fold shadow without extra parts.

export const V3 = THREE.Vector3;
const _v = new V3(), _n = new V3();

// paint aCol from a function of (local position, local normal) -> [r,g,b] (multiplies the material colour)
export function paint(g, fn) {
  const p = g.attributes.position, n = g.attributes.normal, N = p.count;
  const a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    _v.fromBufferAttribute(p, i); _n.fromBufferAttribute(n, i);
    const c = fn ? fn(_v, _n) : null;
    if (c) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } else { a[i * 3] = a[i * 3 + 1] = a[i * 3 + 2] = 1; }
  }
  g.setAttribute('aCol', new THREE.BufferAttribute(a, 3));
  return g;
}
export const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// deform every vertex: fn(v) mutates v (local coords). Normals recomputed.
export function deform(g, fn) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); fn(_v, i); p.setXYZ(i, _v.x, _v.y, _v.z); }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export function ell(rx, ry, rz, ws = 28, hs = 20) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}

// limb along -Y from 0 to -len, radius r0 at the top, r1 at the bottom, rounded caps, optional elliptical section (sx, sz)
export function limb(len, r0, r1, seg = 16, o = {}) {
  const pts = [];
  const cap = 6;
  for (let i = 0; i <= cap; i++) { const a = (Math.PI / 2) * (i / cap); pts.push(new THREE.Vector2(Math.sin(a) * r1, -len - Math.cos(a) * r1 * 0.9)); }
  const mid = o.bulge ?? 0;
  for (let i = 1; i < 6; i++) { const t = i / 6; const r = r1 + (r0 - r1) * t + Math.sin(t * Math.PI) * mid; pts.push(new THREE.Vector2(r, -len + len * t)); }
  for (let i = 0; i <= cap; i++) { const a = (Math.PI / 2) * (i / cap); pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0 * 0.9)); }
  const g = new THREE.LatheGeometry(pts, seg);
  if (o.sx || o.sz) g.scale(o.sx ?? 1, 1, o.sz ?? 1);
  return g;
}

// garment shell: lathe from a profile [[r, y], ...] (top to bottom), with folds: radial ripples that grow toward the hem.
// opts: { seg, folds (count), depth (m), sx, sz, open (radians gap at the front for capes), back (z offset) }
export function garment(profile, o = {}) {
  const seg = o.seg ?? 40;
  // resample the profile densely so trims and folds get crisp edges; lathe wants bottom -> top for outward faces
  const dense = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    const n = Math.max(2, Math.ceil(Math.abs(y1 - y0) / 0.008));
    for (let k = 0; k < n; k++) dense.push([r0 + (r1 - r0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  dense.push(profile[profile.length - 1]);
  const pts = dense.map(([r, y]) => new THREE.Vector2(r, y)).reverse();
  const phi0 = o.open ? Math.PI / 2 + o.open / 2 : 0;
  const len = o.open ? Math.PI * 2 - o.open : Math.PI * 2;
  const g = new THREE.LatheGeometry(pts, seg, phi0, len);
  const y0 = profile[0][1], y1 = profile[profile.length - 1][1];
  const folds = o.folds ?? 9, depth = o.depth ?? 0.012, sx = o.sx ?? 1, sz = o.sz ?? 1, ph = o.phase ?? 0;
  const p = g.attributes.position;
  const fold = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const a = Math.atan2(_v.x, _v.z);
    const h = (y0 - _v.y) / Math.max(1e-6, y0 - y1);            // 0 top .. 1 hem
    const w = Math.sin(a * folds + ph + Math.sin(a * 3.0 + ph) * 0.8);
    const k = depth * (0.25 + 0.75 * h * h);
    const r = Math.hypot(_v.x, _v.z);
    const s = r > 1e-5 ? (r + w * k) / r : 1;
    _v.x *= s * sx; _v.z *= s * sz;
    if (o.back) _v.z += o.back * h;
    p.setXYZ(i, _v.x, _v.y, _v.z);
    fold[i] = w * Math.min(1, h * 1.4);
  }
  g.computeVertexNormals();
  g.userData.fold = fold;
  return g;
}
export function paintFolds(g, base, dark = 0.8) {
  const f = g.userData.fold;
  return paint(g, (v, n) => null) && (() => {
    const a = g.attributes.aCol.array;
    for (let i = 0; i < f.length; i++) { const k = 1 - (1 - dark) * Math.max(0, -f[i]); a[i * 3] = base[0] * k; a[i * 3 + 1] = base[1] * k; a[i * 3 + 2] = base[2] * k; }
    return g;
  })();
}

// tube along a polyline of Vector3s with radius function r(t)
export function tube(points, rFn, seg = 10, tseg = 20, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed);
  const g = new THREE.TubeGeometry(curve, tseg, 1, seg, closed);
  // rescale radii along the tube
  const p = g.attributes.position;
  const frames = curve.computeFrenetFrames(tseg, closed);
  for (let i = 0; i <= tseg; i++) {
    const t = i / tseg; const c = curve.getPointAt(t); const r = rFn(t);
    for (let j = 0; j <= seg; j++) {
      const k = i * (seg + 1) + j;
      _v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, _v.x, _v.y, _v.z);
    }
  }
  void frames;
  g.computeVertexNormals();
  return g;
}

// a flat-ish leaf/tuft shape (fur tuft, ear, petal) in the XY plane, thickness th, pointing +Y
export function tuft(w, h, th = 0.01, bend = 0, seg = 8) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.quadraticCurveTo(-w * 0.55, h * 0.55, 0, h);
  shape.quadraticCurveTo(w * 0.55, h * 0.55, w / 2, 0);
  shape.quadraticCurveTo(0, -h * 0.08, -w / 2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: true, bevelThickness: th * 0.5, bevelSize: Math.min(w, h) * 0.08, bevelSegments: 2, curveSegments: seg });
  g.translate(0, 0, -th / 2);
  if (bend) deform(g, (v) => { v.z += bend * (v.y / h) * (v.y / h); });
  return g;
}

export function merge(list) { return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false); }

export function torus(r, tube, rs = 10, ts = 32) { return new THREE.TorusGeometry(r, tube, rs, ts); }
