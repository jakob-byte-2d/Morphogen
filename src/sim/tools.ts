import { EMPTY, FEED, SEED, SOIL, WATER } from "./cells";
import { spawnCreature } from "./creatures";
import { clearCell, H, setCell, W, type World } from "./world";

export type Tool = "water" | "soil" | "seed" | "creature" | "feed" | "spade";

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
    case "feed": {
      // A few flakes at a time, like fish food.
      const x = cx + w.rng.below(5) - 2;
      const y = cy + w.rng.below(3) - 1;
      if (w.rng.below(2) !== 0 || x < 0 || y < 0 || x >= W || y >= H) break;
      const i = y * W + x;
      if (w.type[i] !== EMPTY) break;
      setCell(w, i, FEED);
      w.food[i] = 2;
      break;
    }
    case "creature":
      releaseCreature(w, cx, cy, species);
      break;
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

/**
 * Lets a creature go at (cx, cy): it lands on whatever is below the finger.
 * Plant eaters come as a little group, creature eaters as a small mass.
 */
/** The empty cell where something dropped at (x, y) comes to rest, or -1 over water. */
function landing(w: World, x: number, y: number): number {
  while (y < H - 1 && w.type[(y + 1) * W + x] === EMPTY) y++;
  const i = y * W + x;
  if (w.type[i] !== EMPTY) return -1;
  return y < H - 1 && w.type[i + W] === WATER ? -1 : i;
}

function releaseCreature(w: World, cx: number, cy: number, species: number): void {
  if (cx < 0 || cx >= W || cy < 0 || cy >= H) return;
  const sp = w.creatureSpecies[Math.min(species, w.creatureSpecies.length - 1)];
  const k = w.creatureSpecies.indexOf(sp);
  // Over water? Let it go on the nearest dry spot instead.
  for (let d = 0; d < W; d++) {
    const x = cx + (d % 2 === 0 ? d >> 1 : -((d + 1) >> 1));
    if (x < 0 || x >= W) continue;
    if (landing(w, x, cy) >= 0) {
      cx = x;
      break;
    }
  }
  let y = cy;
  while (y < H - 1 && w.type[(y + 1) * W + cx] === EMPTY) y++;
  if (w.type[y * W + cx] !== EMPTY) return;
  if (sp.diet === "plants") {
    for (const dx of [0, -2, 2]) {
      const x = cx + dx;
      if (x < 0 || x >= W) continue;
      let yy = cy;
      while (yy < H - 1 && w.type[(yy + 1) * W + x] === EMPTY) yy++;
      const i = yy * W + x;
      if (w.type[i] === EMPTY) spawnCreature(w, k, [i], 120);
    }
  } else {
    const cells: number[] = [];
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]]) {
      const x = cx + dx;
      const yy = y + dy;
      if (x < 0 || x >= W || yy < 0) continue;
      const i = yy * W + x;
      if (w.type[i] === EMPTY) cells.push(i);
    }
    if (cells.length > 0) spawnCreature(w, k, cells, 320);
  }
}
