import { W } from "./dims";
import type { World } from "./world";

/**
 * Dead leaves lie on the ground: a count per column, drawn as a little heap.
 * A tall heap slumps onto its neighbours, and leaves rot away slowly.
 */
export function addLitter(w: World, x: number, n: number): void {
  const c = Math.max(0, Math.min(W - 1, x));
  w.litter[c] = Math.min(255, w.litter[c] + n);
}

/** One leaf in a column rots away about every eight hours. */
const ROT = 96;

export function updateLitter(w: World): void {
  const l = w.litter;
  for (let x = 0; x < W; x++) {
    if (l[x] === 0) continue;
    if (w.rng.below(ROT) === 0) l[x]--;
    // Slump one way or the other, by turns.
    const s = ((x + w.life) & 1) === 0 ? 1 : -1;
    const n = x + s;
    if (n >= 0 && n < W && l[x] > l[n] + 4) {
      l[x]--;
      l[n]++;
    }
  }
}
