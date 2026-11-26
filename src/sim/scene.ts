import { EMPTY, SEED, SOIL, WASTE, WATER } from "./cells";
import { packSeed, plantGenesOf } from "./genes";
import { computeLight, emptyWorld, H, SCALE, setCell, W, WATER_UNITS, type World } from "./world";

/** Integer interpolation between random heights every `step` columns. */
function heights(w: World, base: number, spread: number, step: number): Int16Array {
  const points = Math.ceil(W / step) + 2;
  const p = new Int16Array(points);
  for (let k = 0; k < points; k++) p[k] = base + w.rng.below(spread + 1);
  const out = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    const k = (x / step) | 0;
    const t = x - k * step;
    out[x] = p[k] + (((p[k + 1] - p[k]) * t) / step) | 0;
  }
  return out;
}

/** The plants a new glass is sown with: [column in units, species]. */
const START_PLANTS: [number, number][] = [
  [4, 0],
  [8, 1],
  [12, 2],
  [16, 0],
  [55, 0],
  [59, 1],
  [63, 2],
  [67, 0],
  [70, 1],
];

/** The animals let in once the plants have grown, one each: at which life step, which, and where (in units). */
const START_ANIMALS = [
  { life: 1800, species: 0, x: 12 },
  { life: 1800, species: 0, x: 63 },
  { life: 1850, species: 0, x: 8 },
  { life: 1850, species: 0, x: 58 },
  { life: 1900, species: 0, x: 16 },
  { life: 1900, species: 0, x: 67 },
];

/**
 * How many life steps a new glass is run before the player sees it (about
 * nine days): the plants are up, and the animals are in and settled.
 */
export const START_LIFE = 2700;

/**
 * A fresh glass: moist soil in the bottom quarter, with a wide dip in it,
 * and air above. The groundwater stands a little below the surface; where
 * the ground dips below it, there is open water: the pond.
 */
export function createWorld(seed: number): World {
  const w = emptyWorld(seed);
  // Measures are in units of SCALE cells (the glass is 128 units tall).
  const S = SCALE;
  const surface = heights(w, 94 * S, 6 * S, 12 * S);
  const pondL = 20 * S;
  const pondR = 52 * S;
  /**
   * The water table: groundwater fills the glass up to here, and the pond
   * with it. (A little higher than it will stand when the player first sees
   * the glass: the young plants take up some, and some escapes.)
   */
  const table = 100 * S;
  w.groundwater = (H - table) * W * WATER_UNITS;

  for (let x = 0; x < W; x++) {
    // A wide dip with a flat bottom and gently sloping sides.
    let top = surface[x];
    if (x > pondL && x < pondR) {
      const m = (pondL + pondR) >> 1;
      const half = (pondR - pondL) >> 1;
      const d2 = (x - m) * (x - m);
      const h2 = half * half;
      top += (11 * S - (11 * S * d2 * d2) / (h2 * h2)) | 0;
    }
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (y >= top) {
        setCell(w, i, SOIL);
        // The glass has AREA times as many cells as at scale 1, so each holds
        // a little less: plants, which are lines more than areas, have only
        // about SCALE times as many cells.
        w.food[i] = 3 + w.rng.below(4);
      } else if (y >= table) setCell(w, i, WATER);
    }
  }
  // Plants on both sides of the pond, so the glass comes to life by itself.
  for (const [x, species] of START_PLANTS) {
    for (let y = 1; y < H; y++) {
      const i = y * W + x * S;
      if (w.type[i] === EMPTY) continue;
      const j = i - W;
      setCell(w, j, SEED);
      w.kind[j] = species;
      w.food[j] = 1;
      w.org[j] = packSeed(plantGenesOf(w.plantSpecies[species]));
      break;
    }
  }
  // A thin layer of dead leaves on the ground, as in a real terrarium: food
  // for the skrukketroll until the plants shed leaves of their own.
  for (let x = 0; x < W; x++) {
    if (w.rng.below(3) !== 0) continue;
    let i = x;
    while (i < H * W && w.type[i] === EMPTY) i += W;
    if (i >= H * W || w.type[i] !== SOIL || i < W) continue;
    setCell(w, i - W, WASTE);
    w.food[i - W] = 2;
  }
  // Once the plants have grown a little, the skrukketroll come, one at a time.
  for (const a of START_ANIMALS) w.arrivals.push({ life: a.life, species: a.species, x: a.x * S });
  computeLight(w);
  return w;
}
