import type { World } from "./model";

/**
 * Nutrients dissolved in the water, kept in a coarse grid of squares.
 * Every process that frees matter (burning, digesting, dissolving sludge)
 * adds to the square where it happens; light collectors take from it.
 */

function squareIndex(w: World, x: number, y: number): number {
  const size = w.env.nutrientCellSize;
  let col = Math.floor(x / size);
  let row = Math.floor(y / size);
  if (col < 0) col = 0;
  else if (col >= w.nutrientCols) col = w.nutrientCols - 1;
  if (row < 0) row = 0;
  else if (row >= w.nutrientRows) row = w.nutrientRows - 1;
  return row * w.nutrientCols + col;
}

export function addNutrient(w: World, x: number, y: number, amount: number): void {
  w.nutrients[squareIndex(w, x, y)] += amount;
}

/** Takes up to `want` from the square at (x, y), but never more than `maxShare` of it. Returns what was taken. */
export function takeNutrient(w: World, x: number, y: number, want: number, maxShare: number): number {
  const i = squareIndex(w, x, y);
  const taken = Math.min(want, w.nutrients[i] * maxShare);
  if (taken <= 0) return 0;
  w.nutrients[i] -= taken;
  return taken;
}

/** Nutrients at (x, y). */
export function nutrientAt(w: World, x: number, y: number): number {
  return w.nutrients[squareIndex(w, x, y)];
}

/**
 * Spreads nutrients a little between neighbouring squares. Every exchange
 * moves the same amount out of one square and into the other, so the total
 * stays the same. The glass walls let nothing through.
 */
export function diffuseNutrients(w: World): void {
  const k = w.env.nutrientDiffusion;
  if (k <= 0) return;
  const cols = w.nutrientCols;
  const rows = w.nutrientRows;
  const n = w.nutrients;
  if (w.scratch.nutrientNext.length !== n.length) w.scratch.nutrientNext = new Float64Array(n.length);
  const next = w.scratch.nutrientNext;
  next.set(n);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      // Exchange with the right and lower neighbour; the others do the rest.
      if (col + 1 < cols) {
        const flow = (n[i] - n[i + 1]) * k;
        next[i] -= flow;
        next[i + 1] += flow;
      }
      if (row + 1 < rows) {
        const flow = (n[i] - n[i + cols]) * k;
        next[i] -= flow;
        next[i + cols] += flow;
      }
    }
  }
  n.set(next);
}

/** All matter in the glass: cells, particles of food and dead matter, and dissolved nutrients. */
export function totalMatter(w: World): number {
  let sum = 0;
  for (const c of w.cells) sum += c.mass;
  sum += w.food.length * w.env.foodMass;
  for (let i = 0; i < w.nutrients.length; i++) sum += w.nutrients[i];
  return sum;
}
