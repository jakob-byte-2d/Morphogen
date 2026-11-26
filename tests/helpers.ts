import { applyTool, createWorld, EMPTY, SCALE, SEED, setCell, SOIL, W, type World } from "../src/sim";
import { packSeed, plantGenesOf } from "../src/sim/genes";
import { H } from "../src/sim/world";

/** Where the tests sow a glass: [column in units, species], on both sides of the pond. */
const SOWN: [number, number][] = [
  [4, 0],
  [8, 1],
  [12, 2],
  [16, 0],
  [55, 0],
  [59, 1],
  [63, 2],
  [67, 0],
  [70, 1],
];

/**
 * Makes a little pit for a seed in cell i, as a player digs one: ground on
 * both sides of it. Bushes and flowers sprout only in a pit.
 */
export function pit(w: World, i: number): void {
  for (const j of [i - 1, i + 1]) if (w.type[j] === EMPTY) setCell(w, j, SOIL);
}

/** Puts a seed of `species` into cell i (in a pit, unless it is grass). */
export function seedAt(w: World, i: number, species: number): void {
  setCell(w, i, SEED);
  w.kind[i] = species;
  w.food[i] = 1;
  w.org[i] = packSeed(plantGenesOf(w.plantSpecies[species]));
  if (w.plantSpecies[species].form !== "grass") pit(w, i);
}

/** Sows seeds on the ground of a glass, as a player would (bushes and flowers in a pit). */
export function sow(w: World): World {
  for (const [x, species] of SOWN) {
    for (let y = 1; y < H; y++) {
      const i = y * W + x * SCALE;
      if (w.type[i] === EMPTY) continue;
      seedAt(w, i - W, species);
      break;
    }
  }
  return w;
}

/** Lets six skrukketroll into a glass, one at a time, as a player would. */
export function letIn(w: World): World {
  for (const x of [8, 12, 16, 58, 63, 67]) applyTool(w, "creature", x * SCALE, 5, 0);
  return w;
}

/** A new glass, sown. */
export function sownGlass(seed: number): World {
  return sow(createWorld(seed));
}
