import { SAND, SOIL, STONE, WATER } from "./cells";
import { computeLight, emptyWorld, H, setCell, W, type World } from "./world";

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
  const surface = heights(w, 80, 6, 12);
  const sandTop = heights(w, 113, 3, 9);
  const gravelTop = heights(w, 120, 2, 7);
  const pondL = 28;
  const pondR = 44;
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
      top += 7 - ((7 * d * d) / (half * half)) | 0;
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
        const dry = x < 10 && y < top + 8;
        w.wet[i] = dry ? 25 + w.rng.below(20) : 120 + w.rng.below(30) + (y > 105 ? 60 : 0);
        w.food[i] = 4 + w.rng.below(5);
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
  computeLight(w);
  return w;
}
