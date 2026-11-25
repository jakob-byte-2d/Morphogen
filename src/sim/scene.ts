import { EMPTY, SAND, SEED, SOIL, STONE, WATER } from "./cells";
import { applyTool } from "./tools";
import { computeLight, emptyWorld, H, SCALE, setCell, W, type World } from "./world";

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
 * A fresh glass: gravel and sand at the bottom, a layer of moist soil with a
 * small pond, and air above.
 */
export function createWorld(seed: number): World {
  const w = emptyWorld(seed);
  // Measures are in units of SCALE cells.
  const S = SCALE;
  const surface = heights(w, 80 * S, 6 * S, 12 * S);
  const sandTop = heights(w, 113 * S, 3 * S, 9 * S);
  const gravelTop = heights(w, 120 * S, 2 * S, 7 * S);
  const pondL = 28 * S;
  const pondR = 44 * S;
  let waterLevel = H;
  for (let x = pondL; x <= pondR; x++) waterLevel = Math.min(waterLevel, surface[x]);
  waterLevel += 1;

  for (let x = 0; x < W; x++) {
    // The pond is a dip in the soil, deepest in the middle.
    let top = surface[x];
    if (x > pondL && x < pondR) {
      const m = (pondL + pondR) >> 1;
      const half = (pondR - pondL) >> 1;
      const d = x - m;
      top += 7 * S - ((7 * S * d * d) / (half * half)) | 0;
    }
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (y >= gravelTop[x]) setCell(w, i, w.rng.below(3) === 0 ? SAND : STONE);
      else if (y >= sandTop[x]) {
        setCell(w, i, SAND);
        w.wet[i] = 200;
      } else if (y >= top) {
        setCell(w, i, SOIL);
        // Moist soil, wetter near the pond and deeper down, dry at the far left.
        const dry = x < 10 * S && y < top + 8 * S;
        w.wet[i] = dry ? 25 + w.rng.below(20) : 120 + w.rng.below(30) + (y > 105 * S ? 60 : 0);
        // The glass has AREA times as many cells as at scale 1, so each holds
        // a little less: plants, which are lines more than areas, have only
        // about SCALE times as many cells.
        w.food[i] = 3 + w.rng.below(4);
      } else if (y >= waterLevel && x > pondL && x < pondR) setCell(w, i, WATER);
    }
  }
  // Pebbles line the pond, so it does not drain away into the soil.
  for (let y = 1; y < H - 1; y++) {
    for (let x = pondL; x <= pondR; x++) {
      const i = y * W + x;
      if (w.type[i] !== SOIL) continue;
      let byWater = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.type[i + dy * W + dx] === WATER) byWater = true;
      if (byWater) setCell(w, i, STONE);
    }
  }
  // A few seeds on the ground, so the glass comes to life by itself.
  for (const [x, species] of [
    [16, 0],
    [22, 1],
    [52, 2],
    [62, 0],
  ]) {
    for (let y = 1; y < H; y++) {
      const i = y * W + x * S;
      if (w.type[i] === EMPTY) continue;
      const j = i - W;
      setCell(w, j, SEED);
      w.kind[j] = species;
      w.food[j] = 1;
      break;
    }
  }
  // And two worms in the soil, to deal with what dies.
  applyTool(w, "creature", 12 * S, 60 * S, 2);
  applyTool(w, "creature", 58 * S, 60 * S, 2);
  computeLight(w);
  return w;
}
