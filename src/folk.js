import * as THREE from 'three';
import { buildCritter } from './folk-rig.js';
import { FOX, HARE, LYNX, BADGER, PIGLET, GOAT, KIDGOAT } from './folk-species.js';
import { STEPS } from './layout.js';
import { furMaterial } from './folk-mat.js';
import { paint, hex } from './folk-geo.js';
import { kidsPose, castPose } from './folk-act.js';
import { buildCrowd } from './folk-crowd.js';
import { buildLaundry, buildSling } from './folk-props.js';

// FOLK department: the three kids (fox, hare, lynx), the badger mother + piglet (s04), the goat mother + baby (s07),
// the crowd in the square (s14/s16), street extras (s12) and runners (s28). All poses are pure functions of state.t.
const P = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _q2 = new THREE.Quaternion();
const YFLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

export async function createFolk(ctx) {
  const { scene } = ctx;
  const group = new THREE.Group(); group.name = 'folk';
  scene.add(group);

  // stand-in steps / quay / ground: ONLY for working without the town (?folkStand=1), off by default
  if (P.get('folkStand') === '1') {
    const m = furMaterial({ color: '#efe6d6', id: 3, fur: 0 });
    const sg = new THREE.Group();
    for (let i = 0; i < STEPS.n; i++) {
      const y = -STEPS.rise * (i + 1), z0 = STEPS.zTop - (i + 1);
      const h = y + 6.3;
      const b = new THREE.Mesh(paint(new THREE.BoxGeometry(STEPS.x1 - STEPS.x0, h, 1), () => hex('#ffffff')), m);
      b.position.set((STEPS.x0 + STEPS.x1) / 2, (y - 6.3) / 2, z0 + 0.5); sg.add(b);
    }
    const q = new THREE.Mesh(paint(new THREE.BoxGeometry(80, 1, 40), () => hex('#ffffff')), m); q.position.set(-40, -0.5, 93); sg.add(q);
    const ground = new THREE.Mesh(paint(new THREE.BoxGeometry(400, 1, 500), () => hex('#e8dcc8')), furMaterial({ color: '#ffffff', id: 4, fur: 0 })); ground.position.set(0, -0.5, -200); sg.add(ground);
    const water = new THREE.Mesh(paint(new THREE.BoxGeometry(300, 0.2, 14), () => hex('#4a9ac8')), furMaterial({ color: '#ffffff', id: 5, fur: 0 })); water.position.set(0, -3.4, 60); sg.add(water);
    const roof = new THREE.Mesh(paint(new THREE.BoxGeometry(12, 1, 12), () => hex('#f2ece0')), m); roof.position.set(-70, 10, -64); sg.add(roof);
    scene.add(sg);
  }

  const kids = { fox: buildCritter(FOX), hare: buildCritter(HARE), lynx: buildCritter(LYNX) };
  const cast = { badger: buildCritter(BADGER), piglet: buildCritter(PIGLET), goat: buildCritter(GOAT), baby: buildCritter(KIDGOAT) };
  for (const r of [...Object.values(kids), ...Object.values(cast)]) group.add(r.root);
  const sling = buildSling(cast.goat);
  const crowd = buildCrowd(group);
  const laundry = buildLaundry(group, ctx);

  // s03: the fox's pebble (in the hand, then a ballistic arc into the canal) and two ripple rings where it lands
  const pebble = new THREE.Mesh(paint(new THREE.SphereGeometry(0.022, 12, 8).scale(1, 0.75, 0.9), () => hex('#8a8078')), furMaterial({ color: '#ffffff', id: 58, fur: 0 }));
  pebble.name = 'pebble'; group.add(pebble);
  const ripples = [0, 1].map(() => {
    const m = new THREE.Mesh(paint(new THREE.TorusGeometry(1, 0.035, 6, 48).rotateX(Math.PI / 2), () => hex('#f4fbff')), furMaterial({ color: '#ffffff', id: 59, fur: 0, rim: 0 }));
    m.name = 'ripple'; group.add(m); return m;
  });
  const PEB = { tRel: 3.958, p0: [-38.934, -0.075, 71.813], v: [-0.07, 1.3, -6.12], tFly: 0.95 };
  const _h = new THREE.Vector3();
  function updatePebble(t, st) {
    const on = st.set === 'steps' && t > 3.3 && t < 7.5;
    pebble.visible = false; for (const r of ripples) r.visible = false;
    if (!on) return;
    if (t < PEB.tRel) { kids.fox.anchor('handR', _h); pebble.position.copy(_h).add(_p.set(0, -0.01, 0.02)); pebble.visible = true; }
    else if (t < PEB.tRel + PEB.tFly) {
      const u = t - PEB.tRel;
      pebble.position.set(PEB.p0[0] + PEB.v[0] * u, PEB.p0[1] + PEB.v[1] * u - 4.9 * u * u, PEB.p0[2] + PEB.v[2] * u);
      pebble.rotation.set(u * 14, u * 9, 0); pebble.visible = true;
    }
    const tl = PEB.tRel + PEB.tFly;
    ripples.forEach((r, i) => {
      const a = t - tl - i * 0.18;
      if (a < 0 || a > 1.1) return;
      const rad = 0.05 + 0.5 * Math.sqrt(a);
      r.position.set(PEB.p0[0] + PEB.v[0] * PEB.tFly, -3.29, PEB.p0[2] + PEB.v[2] * PEB.tFly);
      r.scale.set(rad, Math.max(0.05, 1 - a), rad);   // the band thins out as it spreads
      r.visible = true;
    });
  }

  // QA colliders: every rigid part of every character
  const contactFor = { fox: ['steps'], hare: ['steps'], lynx: ['steps'], badgerMom: ['alley', 'ground'], piglet: ['alley', 'ground'], goatMom: ['laundryRoof'], babyGoat: [] };
  const reg = (rig, contact) => {
    for (const m of rig.parts) ctx.colliders.push({ name: m.name, dept: 'folk', obj: m, kind: 'body', contact: rig.contactParts.has(m) ? contact : [] });
  };
  for (const r of [...Object.values(kids), ...Object.values(cast)]) reg(r, contactFor[r.name] ?? []);
  for (const r of crowd.rigs) reg(r, ['ground', 'street', 'square']);
  ctx.shadowRoots.push(group);

  // a rig carried by another: place its root in the carrier's chest frame
  function attach(rig, carrier, local, yawFlip, blend = 1, from = null) {
    carrier.chest.updateWorldMatrix(true, false);
    _p.set(...local).applyMatrix4(carrier.chest.matrixWorld);
    carrier.chest.getWorldQuaternion(_q);
    if (yawFlip) _q.multiply(YFLIP);
    if (from && blend < 1) {
      rig.root.position.set(...from.pos).lerp(_p, blend);
      _q2.setFromAxisAngle(new THREE.Vector3(0, 1, 0), from.yaw ?? 0).slerp(_q, blend);
      rig.root.quaternion.copy(_q2);
    } else { rig.root.position.copy(_p); rig.root.quaternion.copy(_q); }
    rig.root.updateWorldMatrix(true, true);
  }
  // held poses (FK only: no world targets)
  const pigHeld = (f) => ({
    pos: [0, 0, 0], yaw: 0, hip: [0, 0, 0], hipRot: [0.2, 0, 0], spine: [-0.1, 0, 0], neck: [0.1, 0, 0], head: [0.15, 0.6, 0.15],
    legs: { L: { thigh: [-1.2, 0, 0.35], knee: 1.3 }, R: { thigh: [-1.1, 0, -0.35], knee: 1.2 } },
    arms: { L: { sh: [-2.2, 0, 0.5], el: 1.3, curl: 0.7 }, R: { sh: [-2.2, 0, -0.5], el: 1.3, curl: 0.7 } },
    face: f, ears: [0.3, 0.2], tail: [0.4, 0],
  });
  const babyHeld = (f, turn) => ({
    pos: [0, 0, 0], yaw: 0, hip: [0, 0, 0], hipRot: [0.1, 0, 0], spine: [0.1, 0, 0], neck: [0, turn * 0.5, 0], head: [-0.1, turn * 0.6, 0.1 * turn],
    legs: { L: { thigh: [-1.3, 0, 0.6], knee: 1.2 }, R: { thigh: [-1.3, 0, -0.6], knee: 1.2 } },
    arms: { L: { sh: [-1.9, 0, 0.4], el: 1.1, curl: 0.8 }, R: { sh: [-1.7, 0, -0.5], el: 1.3, curl: 0.8 } },
    face: f, ears: [0.1 * turn, 0], tail: [0.5, 0],
  });

  const api = {
    kids: {},
    group,
    update(st) {
      const t = st.t;
      const k = kidsPose(t, st);
      for (const n of ['fox', 'hare', 'lynx']) kids[n].setPose(k[n]);
      updatePebble(t, st);
      const c = castPose(t, st);
      cast.badger.setPose(c.badger);
      cast.goat.setPose(c.goat);
      sling.visible = c.goat.visible !== false;
      if (c.piglet.attach) {
        cast.piglet.setPose(pigHeld(c.piglet.face));
        attach(cast.piglet, cast.badger, [0.06, -0.16, 0.25], true, c.piglet.held, { pos: [-62.02, 0.25, -20.5], yaw: 0 });
      } else cast.piglet.setPose(c.piglet);
      if (c.baby.attach) {
        cast.baby.setPose(babyHeld(c.baby.face, c.baby.headTurn));
        const D = cast.goat.D;
        attach(cast.baby, cast.goat, [0, D.chestCY - 0.17, -D.chest[2] - 0.17], true);
      } else cast.baby.setPose(c.baby);
      laundry.update(t, st);
      crowd.update(t, st);
    },
  };
  for (const n of ['fox', 'hare', 'lynx']) api.kids[n] = { root: kids[n].root, anchor: kids[n].anchor, rig: kids[n] };
  api.cast = cast;
  api.crowd = crowd;
  ctx.folk = api;
  return api;
}
