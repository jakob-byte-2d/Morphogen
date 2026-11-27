import { LIFE_PER_DAY, W } from "./dims";
import { addLitter } from "./litter";
import { waterLine } from "./water";
import { newId, type Animal, type World } from "./world";

/**
 * Skrukketroll walk along the ground (straight through plants and dead
 * leaves) and eat the dead leaves where they stand. Fed, they rest and
 * stroll; hungry, they go looking for leaves. Grown up and well fed, they
 * have young. They die of old age after two to three weeks, or starve in a
 * few days without food, and become dead leaves themselves.
 */
export const FULL = 600;
export const HUNGRY = 300;
/** Energy from one dead leaf. */
const BITE = 60;
/** How far they notice leaves, and how far they walk in a life step (cells). */
const SENSE = 32;
const STRIDE = 6;
const LIFE = 17 * LIFE_PER_DAY;
const BREED_AT = 450;
const YOUNG = 150;

/** Can it step from column x to the next one? Not too steep, not into water, not out of the glass. */
function canStep(w: World, x: number, nx: number, line: number): boolean {
  return nx >= 0 && nx < W && Math.abs(w.top[nx] - w.top[x]) <= 3 && w.top[nx] - 1 < line;
}

/** Walks up to `steps` cells its way, turning back where it cannot go on. */
function walk(w: World, a: Animal, steps: number, line: number): void {
  for (let k = 0; k < steps; k++) {
    if (!canStep(w, a.x, a.x + a.dir, line)) {
      a.dir = -a.dir;
      return;
    }
    a.x += a.dir;
  }
}

/** The way to the nearest dead leaves it can walk to, or 0 if none are near. */
function wayToFood(w: World, x: number, line: number): number {
  let best = 0;
  let bestD = SENSE + 1;
  for (const d of [-1, 1]) {
    let at = x;
    for (let k = 1; k <= SENSE && k < bestD; k++) {
      if (!canStep(w, at, at + d, line)) break;
      at += d;
      if (w.litter[at] > 0) {
        best = d;
        bestD = k;
        break;
      }
    }
  }
  return best;
}

export function lifespan(a: Animal): number {
  return a.life;
}

export function grownUp(a: Animal): boolean {
  return a.age >= (a.life / 3 | 0);
}

/** Lets a skrukketroll go in the glass at column x (it lands on the ground there, or the nearest dry ground). */
export function spawnAnimal(w: World, x: number, energy: number, mother = 0): Animal | null {
  const line = waterLine(w);
  for (let d = 0; d < W; d++) {
    const nx = x + (d % 2 === 0 ? d >> 1 : -((d + 1) >> 1));
    if (nx < 0 || nx >= W || w.top[nx] - 1 >= line || w.top[nx] <= 0) continue;
    const life = LIFE - (LIFE / 5 | 0) + w.rng.below(((2 * LIFE) / 5 | 0) + 1);
    const a: Animal = { id: newId(w), x: nx, dir: w.rng.below(2) === 0 ? -1 : 1, age: 0, life, energy, mother, young: 0, dead: false, starved: false };
    w.animals.push(a);
    return a;
  }
  return null;
}

function die(w: World, a: Animal): void {
  a.dead = true;
  addLitter(w, a.x, 2);
}

export function updateAnimals(w: World): void {
  const line = waterLine(w);
  const born: Animal[] = [];
  let n = 0;
  for (const a of w.animals) {
    a.age++;
    const hungry = a.energy < HUNGRY;
    // Living costs half a unit a step; looking for food as much again.
    a.energy -= (a.age & 1) === 0 ? 1 : hungry ? 1 : 0;
    if (a.energy <= 0) {
      a.starved = true;
      die(w, a);
      continue;
    }
    if (a.age >= a.life) {
      die(w, a);
      continue;
    }
    // Under water: out of it, or it drowns.
    if (w.top[a.x] - 1 >= line) {
      let dry = -1;
      for (let d = 1; d <= STRIDE && dry < 0; d++) {
        for (const s of [-1, 1]) if (dry < 0 && a.x + s * d >= 0 && a.x + s * d < W && w.top[a.x + s * d] - 1 < line) dry = a.x + s * d;
      }
      if (dry < 0) {
        die(w, a);
        continue;
      }
      a.x = dry;
    }
    w.animals[n++] = a;
    if (w.litter[a.x] > 0 && a.energy <= FULL - BITE) {
      w.litter[a.x]--;
      a.energy += BITE;
    } else if (hungry) {
      const way = wayToFood(w, a.x, line);
      if (way !== 0) a.dir = way;
      walk(w, a, STRIDE, line);
    } else {
      if (w.rng.below(6) === 0) a.dir = -a.dir;
      walk(w, a, w.rng.below(3), line);
    }
    if (grownUp(a) && a.energy >= BREED_AT && w.rng.below(24) === 0) {
      a.energy -= YOUNG + 50;
      a.young++;
      const life = LIFE - (LIFE / 5 | 0) + w.rng.below(((2 * LIFE) / 5 | 0) + 1);
      born.push({ id: newId(w), x: a.x, dir: -a.dir, age: 0, life, energy: YOUNG, mother: a.id, young: 0, dead: false, starved: false });
    }
  }
  w.animals.length = n;
  for (const b of born) w.animals.push(b);
}
