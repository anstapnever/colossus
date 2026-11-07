// Dump the live sync data the soundtrack needs from the film itself -> out/cues_live.json
//   node audio/tools/dump_cues.mjs
// Reads window.FILM.ctx.fx.impacts (boulder landings + house hit), the CUES, the colossus visor ignite time,
// and for every impact its distance / pan / in-front relative to the camera of the shot it lands in.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, serve, launch, openFilm } from '../../tools/env.mjs';

const OUT = path.join(ROOT, 'out', 'cues_live.json');
const srv = await serve();
const browser = await launch();
try {
  const { page, errors } = await openFilm(browser, srv.url, 'scale=0.25');
  const ok = await page.evaluate(() => window.FILM_READY === true && !!window.FILM);
  if (!ok) throw new Error('FILM did not become ready');
  const data = await page.evaluate(async () => {
    const F = window.FILM;
    const imp = F.ctx.fx && F.ctx.fx.impacts;
    if (!Array.isArray(imp)) throw new Error('FILM.ctx.fx.impacts missing');
    let visorIgnite = null;
    try { visorIgnite = (await import('/src/colossus-pose.js')).VISOR_IGNITE ?? null; } catch (e) { /* optional */ }
    const HOUSE = [16, 0, -252];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const impacts = imp.map((m) => {
      const pos = m.pos ? [m.pos.x, m.pos.y, m.pos.z] : HOUSE;
      const frame = Math.round(m.t * F.FPS);
      const st = F.stateFor(frame);
      const c = st.cam;
      const fwd = norm(sub(c.look, c.pos));
      const right = norm(cross(fwd, [0, 1, 0]));
      const rel = sub(pos, c.pos);
      const dist = Math.hypot(...rel);
      const r = norm(rel);
      return {
        t: m.t, pos, size: m.size, houseHit: !!m.houseHit, posGuessed: !m.pos,
        shot: st.sid, cam: c.pos, dist, pan: dot(r, right), front: dot(r, fwd),
      };
    }).sort((a, b) => a.t - b.t);
    return { generated: new Date().toISOString(), FPS: F.FPS, cues: F.CUES, colossus: { visorIgnite }, impacts };
  });
  if (errors.length) console.warn(errors.slice(0, 10).join('\n'));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1));
  console.log(`wrote ${OUT}: ${data.impacts.length} impacts`);
  for (const m of data.impacts) console.log(`${m.t.toFixed(2)}  ${m.shot}  size ${m.size.toFixed(1)}  dist ${m.dist.toFixed(0)}  pan ${m.pan.toFixed(2)}  front ${m.front.toFixed(2)}${m.houseHit ? '  HOUSE' : ''}`);
} finally {
  await browser.close();
  srv.close();
}
