import { H, W } from "./dims";
import { EMPTY, SOIL, STONE, type World } from "./world";

/** Finds the highest ground cell in every column. */
export function refreshTop(w: World): void {
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H && w.ground[y * W + x] === EMPTY) y++;
    w.top[x] = y;
  }
}

/**
 * Soil falls and slides like sand, a cell a step; stone stays put. Goes
 * bottom-up, so a grain moves at most once a step.
 */
export function fallGround(w: World): void {
  if (w.settled) return;
  const g = w.ground;
  let moved = false;
  for (let y = H - 2; y >= 0; y--) {
    // Alternate the way along the row, so slopes do not lean one way.
    const flip = ((y + w.tick) & 1) === 0;
    for (let k = 0; k < W; k++) {
      const x = flip ? W - 1 - k : k;
      const i = y * W + x;
      if (g[i] !== SOIL) continue;
      const below = i + W;
      if (g[below] === EMPTY) {
        g[below] = SOIL;
        g[i] = EMPTY;
        moved = true;
        continue;
      }
      const d = ((x + y + w.tick) & 1) === 0 ? -1 : 1;
      for (const s of [d, -d]) {
        const nx = x + s;
        if (nx < 0 || nx >= W || g[i + s] !== EMPTY || g[below + s] !== EMPTY) continue;
        g[below + s] = SOIL;
        g[i] = EMPTY;
        moved = true;
        break;
      }
    }
  }
  if (moved) refreshTop(w);
  else w.settled = true;
}

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

/** Soil in the bottom quarter, gently rolling, with a wide dip in the middle for a pond, on a stone floor. */
export function makeGround(w: World): void {
  const surface = heights(w, 188, 12, 24);
  const left = 40;
  const right = 104;
  const m = (left + right) >> 1;
  const half = (right - left) >> 1;
  for (let x = 0; x < W; x++) {
    let top = surface[x];
    if (x > left && x < right) {
      const d2 = (x - m) * (x - m);
      const h2 = half * half;
      top += (22 - (22 * d2 * d2) / (h2 * h2)) | 0;
    }
    for (let y = top; y < H; y++) w.ground[y * W + x] = y === H - 1 ? STONE : SOIL;
  }
  refreshTop(w);
}
