import { applyTool, createWorld, EMPTY, SCALE, SEED, setCell, W, type World } from "../src/sim";
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

/** Sows seeds on the ground of a glass, as a player would. */
export function sow(w: World): World {
  for (const [x, species] of SOWN) {
    for (let y = 1; y < H; y++) {
      const i = y * W + x * SCALE;
      if (w.type[i] === EMPTY) continue;
      const j = i - W;
      setCell(w, j, SEED);
      w.kind[j] = species;
      w.food[j] = 1;
      w.org[j] = packSeed(plantGenesOf(w.plantSpecies[species]));
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
