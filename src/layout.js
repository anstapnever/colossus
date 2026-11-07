// COLOSSUS — the one shared map. Metres, Y up. North = -Z (the wall and the colossus), south = +Z.
// Every department places things from these numbers so nothing has to be negotiated later.
// The Town department MUST build the world to match them exactly. Lead owns this file.

export const GROUND_Y = 0;                       // the whole town is flat at y = 0 (outside fields too, near the wall)

// The wall: a gentle arc seen from inside the town. Inner face lies on a circle around WALL.c.
export const WALL = {
  c: [0, 1200],          // circle centre (x, z) — far south, inside the town
  rIn: 1500,             // inner face radius: at x = 0 the inner face is at z = -300
  thick: 14,             // outer face at radius 1514 (z = -314 at x = 0)
  h: 50,                 // height of the wall top walkway
  parapet: 2.2,          // crenellated parapet on top of both edges
  towerEvery: 130,       // round towers (radius 9, height 60) protrude inward along the arc
};
export const wallInnerZ = (x) => WALL.c[1] - Math.sqrt(WALL.rIn * WALL.rIn - x * x);
export const wallOuterZ = (x) => WALL.c[1] - Math.sqrt((WALL.rIn + WALL.thick) ** 2 - x * x);

// The gate at x = 0: arched opening through the wall, flanked by two round gate towers at x = ±17.
export const GATE = { x: 0, w: 16, h: 24, towerX: 17, towerR: 8, towerH: 60 };

// The colossus stands OUTSIDE, just beyond the gate, facing the town (+Z). 90 m tall at full height.
export const COLOSSUS = {
  pos: [0, 0, -334],     // feet centre at full stand
  height: 90,            // crown of the head; head centre ~y 82, shoulders ~y 74, chest ~y 62
  gripHand: [-33, 50, -300],  // its right hand clamps the wall top here (fingers curl over the inner edge)
  kickTarget: [0, 8, -307],   // the foot smashes the gate here
};

// Main street: from the gate south to the square, then on to the canal bridge.
export const MAIN_STREET = { x0: -6, x1: 6, zGate: -300, zSquare: -150 };
export const SQUARE = { x0: -36, x1: 36, z0: -150, z1: -90, center: [0, 0, -120] };
export const BELL_TOWERS = [[-30, 0, -156], [30, 0, -156]];   // 34 m tall, open belfries, on the square's north corners

// The canal runs east-west. Its quay tops are at y = 0, water at y = -3.3.
export const CANAL = { z: 60, halfW: 7, waterY: -3.3, bridgeX: 0 };
// The kids' steps: south bank, x in [-48, -32], six treads descending north to the water.
export const STEPS = { x0: -48, x1: -32, zTop: 73, tread: 1.0, rise: 0.5, n: 6 };
// tread i (0..5) covers z in [zTop-(i+1), zTop-i] with its top at y = -rise*(i+1); south of zTop it is quay (y 0)
export function stepY(z) {
  if (z >= STEPS.zTop) return 0;
  const i = Math.min(STEPS.n - 1, Math.floor(STEPS.zTop - z));
  return -STEPS.rise * (i + 1);
}

// Fixed story places (character dept places folk here; Town builds what's around them).
export const PLACES = {
  steps: [-40, 0, 72],             // the three kids sit on treads 1–2 here, facing north (-Z) across the canal
  alley: [-62, 0, -20],            // s04: narrow white alley running north-south, mother catches child here
  laundryRoof: [-70, 10.5, -64],   // s07: flat roof of a 3-storey house with laundry lines, goat mother + baby
  streetView: [0, 0, -200],        // s12/s28: main street between the square and the gate
  houseHit: [16, 0, -252],         // s26: 3-storey house on the east side of the main street; a block tears its facade
  gateInside: [0, 0, -262],        // s24/25/29: the plaza just inside the gate
  outsideField: [70, 0, -420],     // s23/s30: fields outside, low grass, the road from the gate runs north
};

// Character scale
export const SCALE = { kid: 1.15, adult: 1.75 };
// Sun: afternoon from the south-south-west, lights the wall's inner face and the colossus' front.
export const SUN = { elev: 34, az: 205 };
