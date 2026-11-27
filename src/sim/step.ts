import { H, LIFE_EVERY, W } from "./dims";
import { fallGround, makeGround } from "./ground";
import { updateAnimals } from "./animals";
import { updateLitter } from "./litter";
import { fallSeeds, updatePlants } from "./plants";
import { evaporate, fallDrops } from "./water";
import { EMPTY, emptyWorld, type World } from "./world";

/** A new glass: soil, stone at the bottom and a pond in the dip. Nothing lives in it yet. */
export function createWorld(seed: number): World {
  const w = emptyWorld(seed);
  makeGround(w);
  w.waterLine = 204 * 256;
  return w;
}

/** One fast step: what falls, falls. Every LIFE_EVERY steps, a life step. */
export function stepWorld(w: World): void {
  w.tick++;
  fallGround(w);
  fallDrops(w);
  fallSeeds(w);
  if (w.tick % LIFE_EVERY === 0) lifeStep(w);
}

/** Everything that lives, grows, ages and rots, layer by layer. */
export function lifeStep(w: World): void {
  w.life++;
  evaporate(w);
  updatePlants(w);
  updateAnimals(w);
  updateLitter(w);
}

/** Is anything falling? */
function still(w: World): boolean {
  if (!w.settled || w.drops.length > 0) return false;
  for (const s of w.seeds) if (s.y + 1 < H && w.ground[(s.y + 1) * W + s.x] === EMPTY) return false;
  return true;
}

/**
 * Moves the glass on n fast steps the quick way, for time that passed while
 * the app was closed: while nothing is falling, it jumps straight from one
 * life step to the next.
 */
export function skip(w: World, n: number): void {
  const end = w.tick + n;
  while (w.tick < end) {
    if (!still(w)) {
      stepWorld(w);
      continue;
    }
    const next = (Math.floor(w.tick / LIFE_EVERY) + 1) * LIFE_EVERY;
    if (next > end) {
      w.tick = end;
      return;
    }
    w.tick = next;
    lifeStep(w);
  }
}
