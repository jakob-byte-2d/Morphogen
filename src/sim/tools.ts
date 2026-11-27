import { H, SCALE, W } from "./dims";
import { refreshTop } from "./ground";
import { dropSeed } from "./plants";
import { FULL, spawnAnimal } from "./animals";
import { EMPTY, SOIL, type World } from "./world";

export type Tool = "water" | "soil" | "seed" | "creature" | "spade";

const inside = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;

/**
 * The player's tools, at cell (x, y). Called about ten times a second while
 * a finger is held down (the creature once per tap). `species` is the seed
 * chosen.
 */
export function applyTool(w: World, tool: Tool, x: number, y: number, species = 0): void {
  x = Math.round(x);
  y = Math.round(y);
  if (tool === "water") {
    // The watering can: a couple of drops that fall.
    for (let k = 0; k < 2; k++) {
      const dx = x + w.rng.below(5) - 2;
      if (inside(dx, y) && w.ground[y * W + dx] === EMPTY) w.drops.push({ x: dx, y });
    }
  } else if (tool === "soil") {
    // A pinch of soil that falls and settles.
    for (let k = 0; k < 3; k++) {
      const dx = x + w.rng.below(5) - 2;
      const dy = y + w.rng.below(5) - 2;
      if (inside(dx, dy) && w.ground[dy * W + dx] === EMPTY) {
        w.ground[dy * W + dx] = SOIL;
        w.settled = false;
      }
    }
  } else if (tool === "seed") {
    if (w.rng.below(3) === 0) dropSeed(w, species, x + w.rng.below(3) - 1, y);
  } else if (tool === "creature") {
    const a = spawnAnimal(w, x, FULL);
    if (a) a.dropY = y;
  } else if (tool === "spade") {
    // Digs away soil, and the plants, seeds and dead leaves in it.
    const r = 2 * SCALE;
    const r2 = r * r + r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2 || !inside(x + dx, y + dy)) continue;
        const i = (y + dy) * W + x + dx;
        if (w.ground[i] === SOIL) w.ground[i] = EMPTY;
      }
    }
    const hit = (px: number, py: number) => (px - x) * (px - x) + (py - y) * (py - y) <= r2;
    w.plants = w.plants.filter((p) => !hit(p.x, p.y));
    w.seeds = w.seeds.filter((s) => !hit(s.x, s.y));
    for (let dx = -r; dx <= r; dx++) {
      const c = x + dx;
      if (c >= 0 && c < W && hit(c, w.top[c] - 1)) w.litter[c] = 0;
    }
    refreshTop(w);
    w.settled = false;
  }
}
