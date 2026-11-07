import * as THREE from 'three';

// Geometry builder for the town: every surface carries its painting data in vertex attributes
// so whole districts merge into one draw call.
//   aCol  base colour      aCol2 accent (shutters, stripes, glaze)
//   aP    kind, seed, floor height, window spacing
//   aE    face extents in uv metres (u0, u1, v0, v1) for drawn corner highlights
//   uv    metres (u along the face, v up)
// kinds: 0 plain stucco  1 stucco with windows  2 flat roof  3 glazed dome  5 sandstone blocks
//        6 striped awning  7 dark void  8 wood  9 clay  10 cloth  12 bronze door  13 limestone ashlar
//        14 carved band  15 broken plaster edge / interior  16 leaves
export const K = { PLAIN: 0, WIN: 1, ROOF: 2, DOME: 3, SAND: 5, AWN: 6, VOID: 7, WOOD: 8, CLAY: 9, CLOTH: 10, BRONZE: 12, LIME: 13, BAND: 14, INTER: 15, METAL: 16, FOLI: 17 };

const _c = new THREE.Color();
export function col(hex) { _c.set(hex); return [_c.r, _c.g, _c.b]; }

export class GeoB {
  constructor() {
    this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.col2 = []; this.p = []; this.e = []; this.idx = [];
    this.n = 0;
  }
  // a = { c:[r,g,b], c2:[r,g,b], kind, seed, fh, sp }
  vert(x, y, z, nx, ny, nz, u, v, a, e) {
    this.pos.push(x, y, z); this.nrm.push(nx, ny, nz); this.uv.push(u, v);
    this.col.push(a.c[0], a.c[1], a.c[2]);
    const c2 = a.c2 || a.c;
    this.col2.push(c2[0], c2[1], c2[2]);
    this.p.push(a.kind ?? 0, a.seed ?? 0, a.fh ?? 3.4, a.sp ?? 3);
    this.e.push(e[0], e[1], e[2], e[3]);
    return this.n++;
  }
  // quad from 4 corners (bl, br, tr, tl), uv rect (u0,v0)-(u1,v1)
  quad(p0, p1, p2, p3, a, u0, v0, u1, v1, e) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const ee = e || [u0, u1, v0, v1];
    const i0 = this.vert(...p0, nx, ny, nz, u0, v0, a, ee);
    const i1 = this.vert(...p1, nx, ny, nz, u1, v0, a, ee);
    const i2 = this.vert(...p2, nx, ny, nz, u1, v1, a, ee);
    const i3 = this.vert(...p3, nx, ny, nz, u0, v1, a, ee);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }
  // oriented box: centre x,z, base y0, size w (local x) h d (local z), rotation ry.
  // a: attrs or function(face) -> attrs, face in 'px','nx','pz','nz','top','bot'
  // vBase: v coordinate at y0 (so facade windows line up with the house base)
  box(cx, y0, cz, w, h, d, ry, a, o = {}) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (lx, ly, lz) => [cx + lx * c + lz * s, y0 + ly, cz - lx * s + lz * c];
    const hw = w / 2, hd = d / 2;
    const vb = o.vBase ?? 0;
    const A = (f) => (typeof a === 'function' ? a(f) : a);
    const skip = o.skip || {};
    // sides: u runs left->right when seen from outside
    if (!skip.pz) this.quad(P(-hw, 0, hd), P(hw, 0, hd), P(hw, h, hd), P(-hw, h, hd), A('pz'), 0, vb, w, vb + h);
    if (!skip.nz) this.quad(P(hw, 0, -hd), P(-hw, 0, -hd), P(-hw, h, -hd), P(hw, h, -hd), A('nz'), 0, vb, w, vb + h);
    if (!skip.px) this.quad(P(hw, 0, hd), P(hw, 0, -hd), P(hw, h, -hd), P(hw, h, hd), A('px'), 0, vb, d, vb + h);
    if (!skip.nx) this.quad(P(-hw, 0, -hd), P(-hw, 0, hd), P(-hw, h, hd), P(-hw, h, -hd), A('nx'), 0, vb, d, vb + h);
    if (!skip.top) this.quad(P(-hw, h, hd), P(hw, h, hd), P(hw, h, -hd), P(-hw, h, -hd), A('top'), 0, 0, w, d);
    if (!skip.bot) this.quad(P(-hw, 0, -hd), P(hw, 0, -hd), P(hw, 0, hd), P(-hw, 0, hd), A('bot'), 0, 0, w, d);
  }
  // axis-aligned helper by min/max
  boxMM(x0, y0, z0, x1, y1, z1, a, o) { this.box((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, 0, a, o); }
  // vertical cylinder (open or capped). side uv: u = arc metres, v = y (+vBase)
  cyl(cx, y0, cz, r, h, seg, a, o = {}) {
    const vb = o.vBase ?? 0;
    const r1 = o.rTop ?? r;
    const base = this.n;
    const L = 2 * Math.PI * r;
    const e = [-1e5, 1e5, vb, vb + h];
    const slope = (r - r1) / h;
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const nx = Math.cos(t), nz = Math.sin(t);
      const nl = Math.hypot(1, slope);
      this.vert(cx + nx * r, y0, cz + nz * r, nx / nl, slope / nl, nz / nl, (i / seg) * L, vb, a, e);
      this.vert(cx + nx * r1, y0 + h, cz + nz * r1, nx / nl, slope / nl, nz / nl, (i / seg) * L, vb + h, a, e);
    }
    for (let i = 0; i < seg; i++) {
      const a0 = base + i * 2, b0 = a0 + 2;
      this.idx.push(a0, b0 + 1, b0, a0, a0 + 1, b0 + 1);
    }
    if (o.cap !== false) this.disc(cx, y0 + h, cz, r1, seg, o.capA || a, 1);
    if (o.capBot) this.disc(cx, y0, cz, r, seg, o.capA || a, -1);
  }
  disc(cx, y, cz, r, seg, a, up = 1) {
    const e = [-1e5, 1e5, -1e5, 1e5];
    const c0 = this.vert(cx, y, cz, 0, up, 0, 0, 0, a, e);
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      this.vert(cx + Math.cos(t) * r, y, cz + Math.sin(t) * r, 0, up, 0, Math.cos(t) * r, Math.sin(t) * r, a, e);
    }
    for (let i = 0; i < seg; i++) {
      if (up > 0) this.idx.push(c0, c0 + 2 + i, c0 + 1 + i); else this.idx.push(c0, c0 + 1 + i, c0 + 2 + i);
    }
  }
  // dome (hemisphere, optionally onion-pointed). v = metres along the meridian
  dome(cx, y0, cz, r, seg, a, o = {}) {
    const rows = o.rows ?? Math.max(6, seg >> 1);
    const hk = o.hk ?? 1;            // height factor
    const point = o.point ?? 0;      // onion tip
    const base = this.n;
    const e = [-1e5, 1e5, -1e5, 1e5];
    for (let j = 0; j <= rows; j++) {
      const ph = (j / rows) * Math.PI / 2;
      let rr = Math.cos(ph) * r, yy = Math.sin(ph) * r * hk;
      if (point) { rr *= 1 + point * Math.sin(ph * 2) * 0.25 * (1 - j / rows); yy += point * r * Math.pow(j / rows, 6) * 0.5; }
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        const nx = Math.cos(t) * Math.cos(ph), ny = Math.sin(ph) / hk, nz = Math.sin(t) * Math.cos(ph);
        const nl = Math.hypot(nx, ny, nz);
        this.vert(cx + Math.cos(t) * rr, y0 + yy, cz + Math.sin(t) * rr, nx / nl, ny / nl, nz / nl, (i / seg) * 2 * Math.PI * r, (j / rows) * r * 1.57, a, e);
      }
    }
    const W = seg + 1;
    for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) {
      const a0 = base + j * W + i, b0 = a0 + W;
      this.idx.push(a0, b0 + 1, a0 + 1, a0, b0, b0 + 1);
    }
  }
  // lathe profile [[r, y], ...] around a vertical axis (jars, finials, bells)
  lathe(cx, y0, cz, prof, seg, a) {
    const base = this.n;
    const e = [-1e5, 1e5, -1e5, 1e5];
    let vacc = 0;
    for (let j = 0; j < prof.length; j++) {
      const [r, y] = prof[j];
      const p0 = prof[Math.max(0, j - 1)], p1 = prof[Math.min(prof.length - 1, j + 1)];
      const dr = p1[0] - p0[0], dy = p1[1] - p0[1];
      let nr = dy, ny = -dr; const nl = Math.hypot(nr, ny) || 1; nr /= nl; ny /= nl;
      if (j > 0) vacc += Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]);
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        this.vert(cx + Math.cos(t) * r, y0 + y, cz + Math.sin(t) * r, Math.cos(t) * nr, ny, Math.sin(t) * nr, (i / seg) * Math.PI * 2 * Math.max(r, 0.05), vacc, a, e);
      }
    }
    const W = seg + 1;
    for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < seg; i++) {
      const a0 = base + j * W + i, b0 = a0 + W;
      this.idx.push(a0, b0 + 1, a0 + 1, a0, b0, b0 + 1);
    }
  }
  // append an arbitrary BufferGeometry (transformed by m4); uv from geometry (scaled) or planar
  addGeo(g, m4, a, o = {}) {
    const gg = g.index ? g : g;
    const P = gg.attributes.position, N = gg.attributes.normal, U = gg.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(m4);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const base = this.n;
    const e = o.e || [-1e5, 1e5, -1e5, 1e5];
    const us = o.uvScale ?? 1;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m4);
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      let u = 0, w = 0;
      if (o.planar) {
        // project on the dominant axis
        const ax = Math.abs(n.x), az = Math.abs(n.z), ay = Math.abs(n.y);
        if (ay > ax && ay > az) { u = v.x; w = v.z; } else if (ax > az) { u = v.z; w = v.y; } else { u = v.x; w = v.y; }
      } else if (U) { u = U.getX(i) * us; w = U.getY(i) * us; }
      this.vert(v.x, v.y, v.z, n.x, n.y, n.z, u, w, typeof a === 'function' ? a(v, n) : a, e);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aCol2', new THREE.Float32BufferAttribute(this.col2, 3));
    g.setAttribute('aP', new THREE.Float32BufferAttribute(this.p, 4));
    g.setAttribute('aE', new THREE.Float32BufferAttribute(this.e, 4));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Plain closed mesh for QA colliders (position + index only)
export function plainBoxes(list) {
  // list of [x0,y0,z0,x1,y1,z1] or {c:[x,y,z], s:[w,h,d], ry}
  const pos = [], idx = [];
  let n = 0;
  const addBox = (P) => {
    // P: 8 corners in order (---,+--,++-,-+-, --+,+-+,+++,-++)
    for (const p of P) pos.push(...p);
    const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]];
    for (const t of f) idx.push(n + t[0], n + t[1], n + t[2]);
    n += 8;
  };
  for (const b of list) {
    if (Array.isArray(b)) {
      const [x0, y0, z0, x1, y1, z1] = b;
      addBox([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
    } else if (b.corners) addBox(b.corners);
    else {
      const [cx, y0, cz] = b.c, [w, h, d] = b.s, ry = b.ry || 0;
      const c = Math.cos(ry), s = Math.sin(ry);
      const P = (lx, ly, lz) => [cx + lx * c + lz * s, y0 + ly, cz - lx * s + lz * c];
      addBox([P(-w / 2, 0, -d / 2), P(w / 2, 0, -d / 2), P(w / 2, h, -d / 2), P(-w / 2, h, -d / 2), P(-w / 2, 0, d / 2), P(w / 2, 0, d / 2), P(w / 2, h, d / 2), P(-w / 2, h, d / 2)]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
