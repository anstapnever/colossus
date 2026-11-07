# COLOSSUS — production contract

A 77.5-second, 24 fps, 1920×1080 anime short rendered in the browser with three.js r170 (WebGL2), captured frame by
frame with headless Chrome and encoded with ffmpeg. It is a **shot-for-shot retelling of the ACTIONS** of a famous
anime scene (a walled town in peace → a lightning flash outside the wall → a giant's hand grips the wall top → its head
rises over the wall and stares down at the town → it kicks the gate in → boulders rain on the town → people run →
the giant vanishes in steam → smaller giants walk toward the breach). **Everything visual is our own design**: the
reference must be recognisable ONLY by what happens and by the camera work, never by how anything looks.

## Hard rules (client's words)
- Copy the **actions, staging, camera angles, lens feel, camera moves and timing** of the reference 1:1.
- **Never copy the look**: no orange tiled roofs, no half-timber houses, no grey concrete wall, no red muscle giant
  with exposed teeth, no human soldiers, no red scarf, no 18th-century European town. See *Designs* for what we draw.
- **Bright, high-key, theatrical cel anime**: crisp two-tone cel shading with cool lavender-blue shadows, confident ink
  lines, gouache painted backgrounds. Must NOT read as CGI, vector art, low-poly or "Minecraft blocks". Drama comes from
  scale, contrast, timing — never from murk.
- **Dense detail and real volume**: sculpted silhouettes, surfaces with wear, cracks, ornaments, small props. Never paste
  flat 2D sprites in for main subjects; never let things float: contact and scale must read.
- **Weight and timing**: characters animate on twos (`onTwos`), FX on threes (`onThrees`); held poses, snappy accents;
  huge things move slowly with mass. Natural joints, no sliding feet, heads stay on necks.
- **No clipping, ever**: no body part inside another body, prop, wall, step or ground (see QA).
- **Budget**: this whole film is made in one night. Deliver a complete working pass of everything you own EARLY,
  then improve it. A finished simple version beats an unfinished fancy one.

## Reference
`ref/clip.mp4` (23.976 fps, 176 s; not included in this repository) — the reference clip; `ref/shots.json` cut list; `ref/shots/sheet_00..09.jpg` contact sheets.
OPEN THE REFERENCE FRAMES OF YOUR SHOTS before you start (extract them yourself into your own scratch folder, e.g.
`ffmpeg -ss 82.5 -i ref/clip.mp4 -frames:v 1 out/ref/r31_a.jpg`, several per shot for the camera move) and
match composition, subject placement, lens, camera move and timing. Ref times are given per shot below (seconds in the clip).

## Story and shots (`src/shots.js`: SHOTS, CUES — film seconds)
| id | name | film time | ref time (s) | owner | what happens |
|---|---|---|---|---|---|
| s01 | petals | 0–1.5 | 0–1.2 | folk (+fx petals) | CU of sunlit pale stone steps by the canal; magenta bougainvillea petals skitter across in a breeze |
| s02 | sky | 1.5–3.5 | 1.2–4.2 | town | looking up past a white roof edge + a blue dome into deep cobalt sky and cumulus; slow tilt |
| s03 | kids | 3.5–7.5 | 4.2–10 | folk | the three kids (fox, hare, lynx) on the canal steps in the sun; small idle business, a laugh |
| s04 | hug | 7.5–10 | 10–12 | folk | narrow white alley: a piglet child runs into its badger mother's arms, she scoops it up |
| s05 | wall over roofs | 10–13 | 12–14.9 | town | low angle over flat roofs/domes: the great sandstone wall towers over the town |
| s06 | hare close | 13–15.5 | 14.9–25 | folk | close-up of the hare kid talking/looking up, eyes bright, wind in fur |
| s07 | laundry | 15.5–18 | 25–29.5 | folk | flat rooftop with laundry lines: goat mother hangs a sheet, baby goat on her back; wall behind |
| s08 | bolt | 18–21 | 29.5–33.2 | town (+fx bolt) | wide: the wall across the town; at CUES.bolt (20.3) a cyan-white bolt strikes just beyond the wall |
| s09 | flash | 21–22 | 33.2–33.5 | town (+fx flash) | a dome of white-cyan light swells over the wall, white-out |
| s10 | shock | 22–23.5 | 33.5–34.8 | town (+fx) | high aerial over the roofs: the shock ring races outward, awnings and laundry whip, dust lifts |
| s11 | startle | 23.5–24.5 | 34.8–35.5 | folk | the kids are thrown off balance on the steps, one tumbles down a step (no clipping!) |
| s12 | street steam | 24.5–28 | 35.5–42.4 | town (+fx steam, folk extras) | low on the main street toward the gate: folk picking themselves up; a column of steam rises behind the wall |
| s13 | kids turn | 28–31 | 42.4–54.2 | folk | the kids stand and turn toward the wall, the fox runs a few steps forward |
| s14 | crowd | 31–33.5 | 54.2–60 | folk | crowd of animal folk in the square, frozen, staring up at the wall top |
| s15 | fox face | 33.5–34.5 | 60–61 | folk | CU fox kid's face: alarm |
| s16 | crowd back | 34.5–38 | 61–66.8 | folk (+fx steam) | behind the crowd toward the wall: steam boils over the wall top, nobody moves |
| s17 | hand | 38–40.5 | 66.8–69.2 | colossus (+fx dust) | THE HAND: huge segmented bronze fingers slam onto the wall top and clamp; stone cracks, chips fall |
| s18 | eye | 40.5–42.5 | 76–78.5 | folk | ECU of the fox kid's eye; the pupil shrinks (the reflection of the head rising) |
| s19 | shadow | 42.5–45 | 78.5–82 | town (+colossus shadow) | over the roofs: a giant shadow slides across the town toward camera |
| s20 | head | 45–49.5 | 82–86.5 | colossus (+fx steam) | THE HEAD: rising slowly over the wall top, steam pouring off; visor slit ignites |
| s21 | wall head | 49.5–52 | 86.5–89.5 | colossus | wide along the wall: the head and shoulders loom over it, the town tiny |
| s22 | bell towers | 52–55 | 93.5–97.5 | colossus | from the square, up between the two bell towers: the face staring down |
| s23 | leg | 55–57.5 | 97.5–100.5 | colossus | outside, grass in the foreground: the colossus shifts weight and lifts its leg back |
| s24 | gate inside | 57.5–59 | 100.5–102.4 | town | just inside the gate: silence; dust trickles from the arch |
| s25 | burst | 59–60 | 102.4–103 | colossus (+fx, town gate) | at CUES.kick the gate bursts inward: doors and blocks explode toward camera |
| s26 | debris | 60–64 | 103–112 | town (+fx debris) | boulders arc over the roofs; at CUES.houseHit a block tears a house facade off |
| s27 | boulder rain | 64–66.5 | 112–115.7 | town (+fx) | wide: boulders falling across the town, dust columns rising |
| s28 | run | 66.5–68.5 | 115.7–118 | folk (+fx dust wave) | animal folk run down the street toward camera, a dust wave behind them |
| s29 | breach | 68.5–71 | 118–121 | colossus (+fx steam) | the broken gate, rubble, steam; the colossus beyond dissolves into steam and is gone |
| s30 | walkers | 71–74.5 | 121–127 | colossus | outside: smaller automatons (6–15 m) walk across the fields toward the breach |
| s31 | hare eyes | 74.5–77.5 | 147–171 | folk | CU hare kid, eyes wide and wet, it whispers; fade to black |

CUES: bolt 20.3, flash 21.0, shock 22.0, startle 23.5, steam 24.5, hand 38.0, rise 40.5, shadow 42.5, head 45.0,
headUp 49.5, legLift 55.0, silence 57.5, kick 59.0, debris 60.0, houseHit 61.6, run 66.5, breach 68.5, walkers 71.0, end 77.5.
The world must be **continuous in time**: e.g. steam keeps rising behind the wall in every shot after 24.5, the gate is
broken in every shot after 59.0, the colossus is gone after ~70. Everything is a pure function of `state.t`.

## Designs (ours — keep to them)
- **Town**: a sun-bleached hill town of **white and sand-coloured stucco**, mostly **3-storey** cubic houses with
  **flat roof terraces**, parapets, striped canvas **awnings** (teal, saffron, white), **turquoise-blue glazed domes**,
  **cobalt-blue doors and shutters**, arched windows, potted plants, bougainvillea (magenta) spilling over walls, laundry
  lines, water jars, rooftop stairs. A stone canal with a stone bridge. Two slender **bell towers** with open belfries
  and blue-tiled caps on the square. Pale limestone paving. NO pitched roofs, NO orange tiles, NO timber framing.
- **Wall**: ~50 m tall, **pale ochre-pink sandstone** blocks in visible courses, a crenellated parapet, **round
  towers** every ~130 m, carved bands, old streaks and patches; the gate is an arch with a **heavy bronze door carved with
  a sun emblem**, flanked by two round gate towers. NOT a smooth grey concrete wall.
- **Colossus**: an ancient **bronze automaton**, 90 m. **Verdigris teal-green** bronze with **gold-edged** plates, a
  **round mask face** with a **vertical glowing visor slit** (white-cyan) and **vents** on the cheeks; segmented
  fingers with knuckle plates; panel lines, rivets, patina streaks; steam jets out of every joint. It moves slowly,
  with immense mass. No skin, no teeth, no muscles. At the end it glows from inside and dissolves in steam.
  **Walkers**: smaller automatons of the same bronze family, clumsy and varied (6–15 m).
- **Folk** (all townsfolk are anthropomorphic animals, anime-cute, big expressive eyes, clothes):
  - **Fox kid** (hero, ~1.15 m): russet fur with white muzzle/chest, teal sleeveless tunic, ochre sash, sandals.
  - **Hare kid** (~1.2 m with ears): lilac-grey fur, long ears, big round glasses, cream shirt, green satchel.
  - **Lynx kid** (~1.15 m): sandy fur with dark ear tufts and cheek ruff, calm, mustard hooded cape.
  - **Badger mother** + **piglet child** (s04), **goat mother** + **baby goat** on her back (s07).
  - **Crowd**: 6–8 species (bear, deer, cat, dog, sheep, raccoon, otter, boar) in simple robes/aprons/hats.
- **Flash**: cyan-white, not yellow-green. Steam: white, billowing cel volumes with lavender shadow sides, inked.

## Map (`src/layout.js` — the one shared map, read it)
Ground y = 0. North (-Z) is the wall; the gate is at x = 0, z = -300 (inner face) / -314 (outer face). The colossus
stands outside at (0, 0, -334) facing +Z. Main street x∈[-6,6] from the gate to the square (center (0,0,-120)), bell
towers at (±30, 0, -156). The canal runs east-west at z = 60 (water y = -3.3); the kids' steps are on its south bank at
x∈[-48,-32], z 67..73 (`stepY(z)`). PLACES gives the alley, laundry roof, house that gets hit, gate plaza, outside field.
Sun: elevation 34°, azimuth 205° (from the south-south-west: lights the wall's inner face and the colossus' front).

## Departments and file ownership — edit ONLY your files
Others edit their files at the same time. Never edit, reformat or "fix" a file you don't own; put requests in your report.

| Department | Owns |
|---|---|
| Lead (main session) | `index.html`, `src/main.js`, `src/engine.js`, `src/glsl.js`, `src/materials.js`, `src/bgmaterials.js`, `src/passes-env.js`, `src/look.js`, `src/shots.js`, `src/layout.js`, `src/util.js`, `src/world*.js`, `src/tex-foliage.js`, `tools/*`, `CONTRACT.md` |
| Town | `src/town.js`, `src/town-*.js`, `src/cams/town.js` |
| Colossus | `src/colossus.js`, `src/colossus-*.js`, `src/cams/colossus.js` |
| Folk | `src/folk.js`, `src/folk-*.js`, `src/cams/folk.js` |
| FX | `src/fx.js`, `src/fx-*.js` |
| Sound | `audio/**` (output `out/soundtrack.wav`) |
You may copy code from `src/bgmaterials.js` / `src/materials.js` into your own files and adapt it there.
Read-only reference code (MIT, an earlier film made with this same engine): the Leviathan project source (not included)
(`archer-*.js` rigged cel robot with panels and decals, `lev-*.js` a huge creature, `fx-splash-*.js` / `fx-energy-*.js`
cel water/energy FX, `world-port.js` a city made with `cityMaterial`, `ships-*.js`). Read it, copy ideas and code into your
own files; never run anything inside that folder.

## Cameras and looks
Each owner fills `src/cams/<dept>.js` (the lead registers town, colossus, folk):
`export const CAMS = { s05: (lt, d, t, st) => ({ pos: [x,y,z], look: [x,y,z], fov, roll?, near?, far? }) };`
`export const LOOKS = { s05: (lt, d, t, st) => ({ k, sunElev, sunAz, shafts, shadow: {center, radius, depth}, key: [x,y,z], mistMul, fogMul, veil, exposure, paintRadius, inkWidth, fade, fadeColor }) };`
`lt` = seconds into the shot, `d` = shot length, `t` = film time. Default look = `{ k: 1, sunElev: 34, sunAz: 205 }`.
`look.k` 1 = clear day, 0.5 = dust (use after the kick: 0.75→0.55). `look.key` is the character key light (anime cheat).
`look.shadow` turns on the character shadow map around `center`; add your character roots to `ctx.shadowRoots`.
Cameras: live, slight handheld drift via `noise1` on close shots; heavy shake only on impacts (flash, hand, kick, boulders).
Lens: reference lens feel (long lens on faces and the wall, wide low angles on the colossus).

## Department APIs (what others can rely on)
Factories get `ctx` = `{ THREE, scene, overlay, engine, camera, atlas, G, CUES, SHOTS, FPS, W, H, shadowRoots, colliders }`
and later `ctx.world / town / colossus / folk / fx`. Update order each frame: world, town, colossus, folk, fx.
Factory names: `buildTown(ctx)` in town.js, `createColossus(ctx)` in colossus.js, `createFolk(ctx)` in folk.js,
`createFx(ctx)` in fx.js. Each returns `{ update(st), ...api }` (may be async).
- `ctx.town`: `groundY(x, z)`; `anchor(name, vec3)` for `gateArch` (top of the arch, inside), `gripCrack` (where the hand
  clamps), `houseHitFacade` (centre of the facade torn off at CUES.houseHit), `bellTowerL/R` (belfry centres).
  Town owns the gate's states (intact → burst open at CUES.kick: doors and the arch's blocks gone, rubble heap
  after) and the house facade loss at houseHit, and the cracks at the grip after CUES.hand. FX throws the flying pieces.
- `ctx.colossus`: `root`; `anchor(name, vec3)` for `head`, `visor`, `handR` (palm), `fingertipsR`, `chest`, `footR`,
  `vents` → `anchors('vents')` returns an array of `{ pos, dir, strength }` for the steam jets at the current t.
  `visible` (false before 24.5 and after ~70). The colossus is posed by `state.t` alone (CUES).
- `ctx.folk`: `kids` = { fox, hare, lynx } each with `root` and `anchor(name, vec3)` (head, eyeL, eyeR, handL, handR).
- `ctx.fx`: bolt, flash dome, shock ring, steam column behind the wall (24.5→), steam from colossus vents (reads
  `ctx.colossus.anchors('vents')`), stone chips at the grip, gate burst pieces, boulder arcs over town (land inside town
  between z -280 and -60, never on the camera), house-hit debris, dust columns, the dust wave in s28, petals in s01,
  dissolve steam at 68.5+. Cel FX ink ids 60–99, no-ink 100+.

## Engine facts
- Pass order: shadow → main MRT → paint (Kuwahara brush on painted pixels) → ink (cel pixels) → atmosphere →
  overlay sprites → bloom → grade. (`src/engine.js`, `src/glsl.js`.)
- Material ids in `writeOut`: 0 painted (brushwork, no ink), 1–99 inked cel, 100+ cel without ink. Parts of one
  character use different ids so ink lines fall at part boundaries; keep neighbours different.
  Id ranges: town 1–19 (+0 painted), colossus 20–39, folk 40–59, fx 60–99.
- `celMaterial` (src/materials.js): color, dark, id, weather [grime,chip,rust,algae], gloss, map, emissive, emisMode, det.
  Painted background materials in `src/bgmaterials.js` (`paintMaterial`, `cityMaterial`, `foliageMaterial`).
- Everything must be a pure function of `state.t` / CUES: frames render in random order. Seeded RNG from src/util.js,
  never `Math.random`. View depth > 8000 counts as sky; keep things within 8000 m of the camera.
- No `SkinnedMesh`: build characters as rigid parts in a hierarchy (pivots), or CPU-deform your own geometry. This is
  required by the QA tool.

## Tools
- `node tools/check.mjs 60` — loads the page headless, prints console errors.
- `node tools/snap.mjs --scale 1 t:40.2 t:46 f:1100` — stills into `out/snaps/` (`--sheet` for a contact sheet).
  Test cameras: `node tools/snap.mjs "q:test=1&cam=0,2,-200&at=0,40,-300&fov=40&t=46"`.
  Skip other departments for speed: add `&fx=0&folk=0` etc. to q:.
- **Look at your stills with the Read tool every time.** Compare them side by side with the reference frames.
- Several departments use the GPU at once: keep snaps small (`--scale 1`), never run full renders.

## QA (mandatory, the lead runs `node tools/qa.mjs` before the render)
- Register real geometry in `ctx.colliders.push({ name, dept, obj, kind, contact })`:
  `kind: 'solid'` (town: steps, quay, wall, gate, nearby facades, roof terrace; closed meshes, non-instanced) or
  `'body'` (characters: every rigid part; colossus hand/fingers/feet). `contact`: names of solids this body is meant
  to rest on (feet on steps etc.) — penetration up to 3 cm allowed there, 0 anywhere else.
- QA tests every body vertex against every solid and every other department's bodies with three-mesh-bvh, at every
  2nd frame of the shots where they are visible, and fails on any penetration > tolerance. It also fails if the camera
  near plane is inside a solid or below the ground.
- Test your own work the same way before you report (e.g. a small script with `window.FILM.poseFrame(n)` and BVH).

## Reporting
When done, report briefly: what you built, which shots you set cameras for, known weaknesses, anything you need from
another department. Include 2–4 paths of stills you are proudest of.
