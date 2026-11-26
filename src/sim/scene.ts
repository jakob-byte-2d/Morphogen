import { SOIL, WATER } from "./cells";
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

/**
 * A fresh glass: soil in the bottom quarter, with a wide dip in it, and air
 * above. The groundwater stands a little below the surface; where the ground
 * dips below it, there is open water: the pond. Nothing lives in it yet: the
 * player sows it and lets the animals in.
 */
export function createWorld(seed: number): World {
  const w = emptyWorld(seed);
  // Measures are in units of SCALE cells (the glass is 128 units tall).
  const S = SCALE;
  const surface = heights(w, 94 * S, 6 * S, 12 * S);
  const pondL = 20 * S;
  const pondR = 52 * S;
  /** The water table: groundwater fills the glass up to here, and the pond with it. */
  const table = 102 * S;
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
  computeLight(w);
  return w;
}
