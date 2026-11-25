import { EMPTY, SEED, SOIL, WATER } from "./cells";
import { clearCell, H, setCell, W, type World } from "./world";

export type Tool = "water" | "soil" | "seed" | "spade";

/** Calls fn for every cell within radius r of (cx, cy). */
function around(cx: number, cy: number, r: number, fn: (i: number) => void): void {
  const r2 = r * r + r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      fn(y * W + x);
    }
  }
}

/**
 * Uses a tool once at cell (cx, cy). Called about ten times a second while
 * the player holds a finger on the glass.
 */
export function applyTool(w: World, tool: Tool, cx: number, cy: number, species = 0): void {
  switch (tool) {
    case "seed": {
      // About one seed every other time, somewhere under the finger.
      const x = cx + w.rng.below(3) - 1;
      const y = cy + w.rng.below(3) - 1;
      if (w.rng.below(2) !== 0 || x < 0 || y < 0 || x >= W || y >= H) break;
      const i = y * W + x;
      if (w.type[i] !== EMPTY) break;
      setCell(w, i, SEED);
      w.kind[i] = Math.min(species, w.plantSpecies.length - 1);
      w.food[i] = 1;
      break;
    }
    case "water":
      around(cx, cy, 1, (i) => {
        if (w.type[i] === EMPTY && w.rng.below(3) === 0) setCell(w, i, WATER);
      });
      break;
    case "soil":
      around(cx, cy, 1, (i) => {
        if (w.type[i] !== EMPTY || w.rng.below(3) !== 0) return;
        setCell(w, i, SOIL);
        w.wet[i] = 30;
        w.food[i] = 4;
      });
      break;
    case "spade":
      around(cx, cy, 2, (i) => {
        if (w.type[i] !== EMPTY) clearCell(w, i);
      });
      break;
  }
}
