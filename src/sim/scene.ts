import { EMPTY, SAND, SEED, SOIL, WATER } from "./cells";
import { packSeed, plantGenesOf } from "./genes";
import { applyTool } from "./tools";
import { computeLight, emptyWorld, H, MAX_WET, SCALE, setCell, W, type World } from "./world";

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

/**
 * A fresh glass: sand at the bottom, a layer of moist soil with a dip in
 * it, and air above. The groundwater stands a little below the surface;
 * where the ground dips below it, there is open water: the pond.
 */
export function createWorld(seed: number): World {
  const w = emptyWorld(seed);
  // Measures are in units of SCALE cells.
  const S = SCALE;
  const surface = heights(w, 76 * S, 6 * S, 12 * S);
  const sandTop = heights(w, 110 * S, 4 * S, 9 * S);
  const pondL = 20 * S;
  const pondR = 52 * S;
  /** The groundwater table: below it the ground is soaked through. */
  const table = 84 * S;

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
      if (y >= sandTop[x]) {
        setCell(w, i, SAND);
        w.wet[i] = y >= table ? MAX_WET : 60;
      } else if (y >= top) {
        setCell(w, i, SOIL);
        // Soaked below the table, moist above it, and dry at the far left.
        const dry = x < 10 * S && y < top + 8 * S;
        w.wet[i] = y >= table ? MAX_WET : dry ? 25 + w.rng.below(20) : 120 + w.rng.below(30);
        // The glass has AREA times as many cells as at scale 1, so each holds
        // a little less: plants, which are lines more than areas, have only
        // about SCALE times as many cells.
        w.food[i] = 3 + w.rng.below(4);
      } else if (y >= table) setCell(w, i, WATER);
    }
  }
  // A few seeds on the ground, so the glass comes to life by itself.
  for (const [x, species] of [
    [7, 0],
    [14, 1],
    [59, 2],
    [66, 0],
  ]) {
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
  // And two worms in the soil, to deal with what dies.
  applyTool(w, "creature", 10 * S, 60 * S, 2);
  applyTool(w, "creature", 62 * S, 60 * S, 2);
  computeLight(w);
  return w;
}
