import { EMPTY, FEED, SEED, SOIL, WATER } from "./cells";
import { releaseCreature } from "./creatures";
import { packSeed, plantGenesOf } from "./genes";
import { normalizeCreatureSpecies, normalizePlantSpecies } from "./species";
import { clearCell, H, SCALE, setCell, W, type World } from "./world";

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
    case "feed":
      // A few flakes at a time, like fish food.
      for (let k = 0; k < SCALE; k++) {
        const x = cx + w.rng.below(4 * SCALE + 1) - 2 * SCALE;
        const y = cy + w.rng.below(2 * SCALE + 1) - SCALE;
        if (w.rng.below(2) !== 0 || x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (w.type[i] !== EMPTY) continue;
        setCell(w, i, FEED);
        w.food[i] = 2;
      }
      break;
    case "creature":
      releaseCreature(w, cx, cy, species);
      break;
    case "seed": {
      // About one seed every other time, somewhere under the finger.
      const x = cx + w.rng.below(2 * SCALE + 1) - SCALE;
      const y = cy + w.rng.below(2 * SCALE + 1) - SCALE;
      if (w.rng.below(2) !== 0 || x < 0 || y < 0 || x >= W || y >= H) break;
      const i = y * W + x;
      if (w.type[i] !== EMPTY) break;
      setCell(w, i, SEED);
      w.kind[i] = Math.min(species, w.plantSpecies.length - 1);
      w.food[i] = 1;
      w.org[i] = packSeed(plantGenesOf(w.plantSpecies[w.kind[i]]));
      break;
    }
    case "water":
      around(cx, cy, SCALE, (i) => {
        if (w.type[i] === EMPTY && w.rng.below(3) === 0) setCell(w, i, WATER);
      });
      break;
    case "soil":
      around(cx, cy, SCALE, (i) => {
        if (w.type[i] !== EMPTY || w.rng.below(3) !== 0) return;
        setCell(w, i, SOIL);
        w.food[i] = 4;
      });
      break;
    case "spade":
      around(cx, cy, 2 * SCALE, (i) => {
        if (w.type[i] !== EMPTY) clearCell(w, i);
      });
      break;
  }
}

/** Most species a glass can hold of each kind. */
export const MAX_SPECIES = 64;

/** Adds a plant species the player made. Returns its index, or -1 if the glass is full. */
export function addPlantSpecies(w: World, raw: unknown): number {
  if (w.plantSpecies.length >= MAX_SPECIES) return -1;
  w.plantSpecies.push(normalizePlantSpecies(raw));
  return w.plantSpecies.length - 1;
}

/** Adds a creature species the player made. Returns its index, or -1 if the glass is full. */
export function addCreatureSpecies(w: World, raw: unknown): number {
  if (w.creatureSpecies.length >= MAX_SPECIES) return -1;
  w.creatureSpecies.push(normalizeCreatureSpecies(raw));
  return w.creatureSpecies.length - 1;
}
