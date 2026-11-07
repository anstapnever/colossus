import * as THREE from 'three';
import { Rng } from './util.js';

// COLOSSUS dept: the bronze detail atlas. One repeating sheet of ancient cast-bronze panel work:
// recursive plate seams, rivet rows, engraved meanders and sun discs, louvre grilles, tonal patina
// blocks. Applied along every armour plate (box/patch UVs, 1 tile = TILE units), alpha = how much it shows.

const INK = '#16302c';
const SEAM_LIGHT = 'rgba(255,246,214,0.7)';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function seam(g, draw, w = 3.2) {
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  g.translate(1.6, 1.8); g.strokeStyle = SEAM_LIGHT; g.lineWidth = w * 0.7; g.beginPath(); draw(); g.stroke();
  g.restore();
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = INK; g.lineWidth = w; g.globalAlpha = 0.92; g.beginPath(); draw(); g.stroke();
  g.restore();
}
function rivet(g, x, y, r) {
  g.fillStyle = '#f3dc9a'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#9a7a3e'; g.beginPath(); g.arc(x + r * 0.3, y + r * 0.3, r * 0.74, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8c878'; g.beginPath(); g.arc(x - r * 0.12, y - r * 0.12, r * 0.55, 0, Math.PI * 2); g.fill();
  g.strokeStyle = INK; g.lineWidth = Math.max(1.5, r * 0.3); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
}
// greek-key meander along a band (engraved: ink line with a light lower lip)
function meander(g, x, y, len, h) {
  const u = h;
  const path = () => {
    let cx = x;
    g.moveTo(cx, y + h);
    while (cx + u * 1.6 < x + len) {
      g.lineTo(cx, y); g.lineTo(cx + u, y); g.lineTo(cx + u, y + h * 0.62); g.lineTo(cx + u * 0.38, y + h * 0.62);
      g.lineTo(cx + u * 0.38, y + h * 0.3); g.moveTo(cx + u, y + h); cx += u * 1.3; g.lineTo(cx, y + h);
    }
  };
  seam(g, path, Math.max(2, h * 0.11));
  seam(g, () => { g.moveTo(x, y - h * 0.3); g.lineTo(x + len, y - h * 0.3); g.moveTo(x, y + h * 1.3); g.lineTo(x + len, y + h * 1.3); }, Math.max(2, h * 0.09));
}
// sun disc: concentric rings with rays (the town's emblem, cast into the old machine)
function sunDisc(g, cx, cy, r) {
  g.fillStyle = 'rgba(240,206,120,0.5)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  seam(g, () => { g.arc(cx, cy, r, 0, Math.PI * 2); }, 3);
  seam(g, () => { g.moveTo(cx + r * 0.5, cy); g.arc(cx, cy, r * 0.5, 0, Math.PI * 2); }, 2.4);
  seam(g, () => {
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.moveTo(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6); g.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9); }
  }, 2.2);
}

export function makeBronzeAtlas(size = 2048) {
  const rng = new Rng(9137);
  const [c, g] = canvas(size, size);
  const S = size / 2048;
  const leaves = [];
  const split = (x, y, w, h, d) => {
    const can = d < 6 && (w > 120 * S || h > 120 * S);
    if (can && (d < 2 || rng.next() < 0.84)) {
      if (w > h * rng.range(0.8, 1.25)) { const k = rng.range(0.3, 0.7) * w; split(x, y, k, h, d + 1); split(x + k, y, w - k, h, d + 1); }
      else { const k = rng.range(0.3, 0.7) * h; split(x, y, w, k, d + 1); split(x, y + k, w, h - k, d + 1); }
    } else leaves.push([x, y, w, h, d]);
  };
  split(0, 0, size, size, 0);
  // tonal blocks: pale verdigris crusts, deeper teal, warm bare-bronze patches
  for (const [x, y, w, h] of leaves) {
    const r = rng.next();
    if (r < 0.24) { g.fillStyle = `rgba(28,70,72,${rng.range(0.08, 0.16)})`; g.fillRect(x, y, w, h); }
    else if (r < 0.46) { g.fillStyle = `rgba(214,250,232,${rng.range(0.06, 0.14)})`; g.fillRect(x, y, w, h); }
    else if (r < 0.54) { g.fillStyle = `rgba(196,140,70,${rng.range(0.05, 0.1)})`; g.fillRect(x, y, w, h); }
  }
  for (const [x, y, w, h, d] of leaves) seam(g, () => { g.rect(x, y, w, h); }, (d < 3 ? 4.6 : 3.0) * S);
  for (const [x, y, w, h] of leaves) {
    const m = 12 * S, iw = w - m * 2, ih = h - m * 2;
    if (iw < 26 * S || ih < 26 * S) continue;
    const r = rng.next();
    if (r < 0.36) {
      const br = rng.range(5, 8) * S;
      const n = Math.max(2, Math.floor(w / (34 * S)));
      for (let i = 0; i <= n; i++) { rivet(g, x + m + (iw * i) / n, y + m, br); rivet(g, x + m + (iw * i) / n, y + h - m, br); }
      if (h > 160 * S) { const k = Math.floor(h / (34 * S)); for (let i = 1; i < k; i++) { rivet(g, x + m, y + m + (ih * i) / k, br); rivet(g, x + w - m, y + m + (ih * i) / k, br); } }
    } else if (r < 0.52 && iw > 80 * S && ih > 60 * S) {
      const ins = rng.range(14, 30) * S;
      // outline only: a filled inset read as a dark smudge through the plate at a distance
      seam(g, () => { g.roundRect(x + ins, y + ins, w - ins * 2, h - ins * 2, 10 * S); }, 2.8 * S);
    } else if (r < 0.66 && iw > 110 * S) {
      const hh = rng.range(16, 26) * S;
      meander(g, x + m, y + h / 2 - hh / 2, iw, hh);
    } else if (r < 0.76 && iw > 70 * S && ih > 70 * S) {
      void sunDisc;   // (sun discs removed: on curved plates they read as olive ovals showing through)
    } else if (r < 0.88 && iw > 60 * S) {
      const n = rng.int(3, 7), vw = Math.min(iw * 0.7, 120 * S), vh = 7 * S, gap = 15 * S;
      const vy = y + h / 2 - (n * gap) / 2;
      for (let i = 0; i < n && gap * i < ih - 10 * S; i++) {
        g.fillStyle = '#183230'; g.fillRect(x + w / 2 - vw / 2, vy + i * gap, vw, vh);
        g.fillStyle = 'rgba(255,240,200,0.6)'; g.fillRect(x + w / 2 - vw / 2, vy + i * gap + vh, vw, 2 * S);
      }
    }
  }
  // long cast seams across panels
  for (let i = 0; i < 14; i++) {
    const x = rng.range(0, size), y = rng.range(0, size), len = rng.range(160, 620) * S;
    seam(g, () => { if (i % 2) { g.moveTo(x, y); g.lineTo(x + len, y); } else { g.moveTo(x, y); g.lineTo(x, y + len); } }, 2.2 * S);
  }
  for (let i = 0; i < 22; i++) {
    const x = rng.range(0, size), y = rng.range(0, size), n = rng.int(6, 16), st = rng.range(18, 30) * S, dirX = rng.next() < 0.5;
    for (let k = 0; k < n; k++) rivet(g, x + (dirX ? k * st : 0), y + (dirX ? 0 : k * st), 4 * S);
  }
  // pits and specks of corrosion
  for (let i = 0; i < 0; i++) {   // (specks removed: they read as noise at a distance)
    g.fillStyle = rng.next() < 0.55 ? 'rgba(22,50,48,0.5)' : 'rgba(226,255,240,0.5)';
    const s = rng.range(1, 3.4) * S; g.fillRect(rng.range(0, size), rng.range(0, size), s, s * rng.range(0.6, 1.6));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
