import * as THREE from 'three';
import { furMaterial } from './folk-mat.js';
import { paint, hex, tube, ell, torus } from './folk-geo.js';
import { onTwos } from './util.js';
import { ROOF } from './folk-act.js';

// s07 laundry: two posts, a line, three sheets billowing in the breeze in front of the goat mother.
// Sheets are CPU-deformed planes (pure function of t, drawn on twos).
export function buildLaundry(group, ctx) {
  const [gx, gy, gz] = ROOF;
  const root = new THREE.Group(); root.name = 'folk.laundry';
  group.add(root);
  const wood = furMaterial({ color: '#ffffff', id: 55, fur: 0.3 });
  const lineY = gy + 1.86, lineZ = gz - 0.3;
  const x0 = gx - 2.6, x1 = gx + 2.4;
  const parts = [];
  for (const x of [x0, x1]) {
    const g = paint(new THREE.CylinderGeometry(0.045, 0.055, 2.05, 10), () => hex('#8a5a3a'));
    g.translate(x, gy + 1.025, lineZ);
    const m = new THREE.Mesh(g, wood); root.add(m); parts.push(m);
    const foot = paint(new THREE.CylinderGeometry(0.12, 0.14, 0.08, 12), () => hex('#6a4a34'));
    foot.translate(x, gy + 0.04, lineZ);
    const f = new THREE.Mesh(foot, wood); root.add(f); parts.push(f);
  }
  const rope = paint(tube([new THREE.Vector3(x0, lineY + 0.1, lineZ), new THREE.Vector3((x0 + x1) / 2, lineY - 0.04, lineZ), new THREE.Vector3(x1, lineY + 0.1, lineZ)], () => 0.009, 6, 24), () => hex('#e8dcc0'));
  const rm = new THREE.Mesh(rope, furMaterial({ color: '#ffffff', id: 57, fur: 0 })); root.add(rm); parts.push(rm);

  const sheetMat = furMaterial({ color: '#ffffff', id: 59, fur: 0, side: THREE.DoubleSide, rim: 0.5 });
  const sheets = [];
  const defs = [
    { cx: gx - 1.75, w: 1.15, h: 1.55, col: '#fbf8f2', ph: 0 },
    { cx: gx + 0.05, w: 1.05, h: 1.35, col: '#f4e8d0', ph: 1.7, held: true },
    { cx: gx + 1.6, w: 1.2, h: 1.6, col: '#e8f0fa', ph: 3.1 },
  ];
  for (const d of defs) {
    const g = new THREE.PlaneGeometry(d.w, d.h, 14, 18);
    g.translate(0, -d.h / 2, 0);
    // stripe trim on two sheets
    paint(g, (v) => { const k = d.held ? 1 : (Math.abs(v.y + d.h * 0.12) < 0.04 ? 0.82 : 1); const c = hex(d.col); return [c[0] * k, c[1] * k, c[2] * (d.held ? 1 : k * 1.02)]; });
    const rest = g.attributes.position.array.slice();
    const m = new THREE.Mesh(g, sheetMat);
    m.position.set(d.cx, lineY - 0.02, lineZ);
    root.add(m); parts.push(m);
    sheets.push({ m, g, rest, d });
    // pegs
    for (const s of [-1, 1]) {
      const pg = paint(new THREE.BoxGeometry(0.02, 0.07, 0.025), () => hex('#c89a5a'));
      pg.translate(d.cx + s * d.w * 0.42, lineY - 0.01, lineZ);
      const pm = new THREE.Mesh(pg, wood); root.add(pm); parts.push(pm);
    }
  }
  for (const m of parts) ctx.colliders.push({ name: 'folk.laundry.' + parts.indexOf(m), dept: 'folk', obj: m, kind: 'body', contact: ['laundryRoof'] });

  return {
    root,
    update(t, st) {
      root.visible = st.sid === 's07';
      if (!root.visible) return;
      const q = onTwos(t);
      for (const s of sheets) {
        const p = s.g.attributes.position, r = s.rest, d = s.d;
        for (let i = 0; i < p.count; i++) {
          const x = r[i * 3], y = r[i * 3 + 1];
          const dep = Math.min(1, Math.max(0, -y / d.h));   // 0 at the line .. 1 at the hem
          const gust = 0.5 + 0.5 * Math.sin(q * 1.3 + d.ph);
          const bill = Math.pow(dep, 1.2) * (0.22 + 0.16 * gust) * (d.held ? 0.5 : 1);
          const wave = Math.sin(x * 4.5 + q * 5.2 + d.ph + dep * 2.0) * 0.06 * dep + Math.sin(x * 9 - q * 7 + d.ph) * 0.015 * dep;
          // the wind blows south (toward +z, toward the camera): the hem lifts and swings
          const z = bill + wave;
          const yy = y + Math.pow(dep, 2) * (0.1 + 0.08 * gust) * (d.held ? 0.4 : 1);
          p.setXYZ(i, x + Math.sin(q * 2 + y * 3 + d.ph) * 0.02 * dep, yy, z);
        }
        p.needsUpdate = true;
        s.g.computeVertexNormals();
      }
    },
  };
}

// a cloth sling that holds the baby goat on its mother's back (child of her chest pivot)
export function buildSling(rig) {
  const D = rig.D;
  const [rx, ry, rz] = D.chest;
  const cy = D.chestCY - D.spine * 0.25;
  const band = torus(1, 0.06, 6, 36); band.rotateX(Math.PI / 2); band.rotateZ(0.5);
  band.scale(rx * 1.2, ry * 1.25, rz * 1.42); band.translate(0, cy + 0.02, -0.01);
  paint(band, () => hex('#d86a5a'));
  const pouch = ell(0.16, 0.13, 0.11, 18, 12);
  pouch.translate(0, cy - 0.06, -rz * 1.25 - 0.06);
  paint(pouch, (v) => (v.y > cy - 0.02 ? hex('#e88a72') : hex('#d86a5a')));
  const g = new THREE.Group(); g.name = 'goatMom.sling';
  const mat = furMaterial({ color: '#ffffff', id: 47, fur: 0.15 });
  const a = new THREE.Mesh(band, mat), b = new THREE.Mesh(pouch, mat);
  a.name = 'goatMom.slingBand'; b.name = 'goatMom.slingPouch';
  g.add(a, b);
  rig.chest.add(g);
  rig.parts.push(a, b);
  return g;
}
