import { EMPTY, FEED, PLANT_PART, ROOT, SAND, SEED, SOIL, STONE, WASTE, WATER } from "./cells";
import { H, LIFE_PER_DAY, SCALE, TICKS_PER_SECOND, W } from "./dims";
import { creatureGenesOf, inheritCreature, upkeep, type CreatureGenes } from "./genes";
import { clearCell, newOrgId, setCell, type World } from "./world";

export interface Creature {
  kind: "creature";
  id: number;
  species: number;
  energy: number;
  /** Nutrient units eaten and not yet passed on as droppings or offspring. */
  store: number;
  /** Creature updates (one every CREATURE_EVERY life steps) since it was born. */
  age: number;
  cells: number[];
  genes: CreatureGenes;
  /** The id of its mother (0 if it was let into the glass). Its name comes from its id. */
  mother: number;
  /** Young it has had. */
  young: number;
  /** Which way it is walking: -1 (left) or 1 (right). */
  heading: number;
  /** The cell of the food it is heading for, or -1. */
  target: number;
  dead: boolean;
}

/**
 * Creatures live (eat, age, breed) every CREATURE_EVERY life steps, spread
 * over the steps by id; they crawl in the fast steps, every CRAWL_EVERY.
 * There is no limit to how many there can be: food sets it.
 */
export const CREATURE_EVERY = 2;
const CRAWL_EVERY = 2;
/** A hungry one with no food in mind looks around for some this often (fast steps). */
const LOOK_EVERY = 32;

/** Skrukketroll (litter eaters): one cell each, living on the ground. */
const BUG = {
  /** A new one arrives fed. */
  start: 600,
  /** About how long one lives, in days (give or take a fifth): two to three weeks. */
  lifespanDays: 17,
  /** It is grown up, and can breed, when this share of its life is behind it. */
  grownAt: 1 / 3,
  /**
   * A fed one walks for a while, then rests for a while, over and over: walks
   * of 10–40 seconds and rests of 30–90, different for each.
   */
  walk: 10,
  rest: 30,
  /** How far a hungry one can sense fallen leaves. */
  sense: 6 * SCALE,
  /** Updates between droppings, and the units in one (a crumb of soil). */
  dropEvery: 40,
  dropUnits: 2,
  /** Most energy it holds: it keeps eating, but what it gets beyond this is wasted. */
  full: 600,
};
/*
 * What the genes do, as tables by trait value (1–5; 3 is the middle).
 * Growth: fast growers eat (and grow) faster but get less out of each meal.
 * Size: how big a creature gets before it breeds or splits.
 */
/** Skrukketroll: one bite in this many updates, and energy per unit eaten. */
const BUG_BITE_EVERY = [40, 32, 24, 18, 12];
const BUG_PER_UNIT = [62, 56, 50, 44, 38];

/** A skrukketroll breeds at this energy and gives the young this much (more for big ones). */
function bugBreedAt(g: CreatureGenes): number {
  return 140 + 40 * g.size;
}
function bugYoung(g: CreatureGenes): number {
  return 40 + 20 * g.size;
}

const NEIGHBOURS = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];

function inGlass(i: number, from: number): boolean {
  return i >= 0 && i < W * H && Math.abs((i % W) - (from % W)) <= 1;
}

/**
 * Creatures live on a layer of their own over the cells (World.critter), so
 * a skrukketroll can be in the same cell as a leaf or a stem, or a dead
 * leaf: it walks through grass and bushes and burrows in leaf litter. Ground,
 * stone and water it cannot go into.
 */
function passable(t: number): boolean {
  return t === EMPTY || t === WASTE || t === FEED || t === SEED || (PLANT_PART[t] === 1 && t !== ROOT);
}

/** Something to stand or hang on: ground, stone, dead leaves, feed, a seed. Not a plant, not water. */
function footing(t: number): boolean {
  return t === SOIL || t === SAND || t === STONE || t === ROOT || t === WASTE || t === FEED || t === SEED;
}

/** Can a creature go into cell j: room for it, and no other creature there? */
function canEnter(w: World, j: number): boolean {
  return passable(w.type[j]) && w.critter[j] === 0;
}

/**
 * Something to stand or hang on at cell i (not counting the creature
 * `self`): footing next to it, or another creature, or the dead leaves it is
 * in. Plants it walks through, but does not climb.
 */
function supported(w: World, i: number, self: number): boolean {
  if (i >= W * (H - 1) || w.type[i] === WASTE) return true;
  for (const d of NEIGHBOURS) {
    const j = i + d;
    if (!inGlass(j, i)) continue;
    if (footing(w.type[j]) || (w.critter[j] !== 0 && w.critter[j] !== self)) return true;
  }
  return false;
}

/** About how long a creature lives, in creature updates: give or take a fifth, so they do not all die at once. */
export function lifespanOf(c: Creature): number {
  return ((BUG.lifespanDays * LIFE_PER_DAY * (80 + (c.id % 41))) / 100 / CREATURE_EVERY) | 0;
}


/** Moves a creature to cell j. */
function moveTo(w: World, c: Creature, j: number): void {
  const i = c.cells[0];
  if (i !== undefined && w.critter[i] === c.id) w.critter[i] = 0;
  w.critter[j] = c.id;
  c.cells[0] = j;
}

/**
 * Starts a new creature in the first of the given cells, with a unit of
 * nutrients for its body (kept in its store). Without genes it gets its
 * species' own.
 */
export function spawnCreature(w: World, species: number, at: number[], energy: number, genes?: CreatureGenes, mother = 0): Creature | null {
  const id = newOrgId(w);
  if (id === 0) return null;
  const g = genes ?? creatureGenesOf(w.creatureSpecies[species]);
  const c: Creature = { kind: "creature", id, species, energy, store: 0, age: 0, cells: [], genes: g, mother, young: 0, heading: (id & 1) === 0 ? 1 : -1, target: -1, dead: false };
  if (at.length > 0) {
    c.store = 1;
    moveTo(w, c, at[0]);
  }
  w.creatures.push(c);
  w.orgs.set(id, c);
  return c;
}

/**
 * Where a creature dropped at (x, y) comes to rest: it falls through air and
 * plants onto the ground, or onto dead leaves. -1 over water.
 */
function landing(w: World, x: number, y: number): number {
  if (!canEnter(w, y * W + x)) return -1;
  while (y < H - 1 && canEnter(w, (y + 1) * W + x) && !footing(w.type[(y + 1) * W + x])) y++;
  if (y < H - 1 && canEnter(w, (y + 1) * W + x) && w.type[(y + 1) * W + x] === WASTE) y++;
  const i = y * W + x;
  return y < H - 1 && w.type[i + W] === WATER ? -1 : i;
}

/** Lets one creature go at (cx, cy): it lands on the ground below (or the nearest bare ground). */
export function releaseCreature(w: World, cx: number, cy: number, species: number): void {
  if (cx < 0 || cx >= W || cy < 0 || cy >= H) return;
  const k = Math.min(species, w.creatureSpecies.length - 1);
  // Over water? Let it go on the nearest ground instead.
  for (let d = 0; d < W; d++) {
    const x = cx + (d % 2 === 0 ? d >> 1 : -((d + 1) >> 1));
    if (x < 0 || x >= W) continue;
    const i = landing(w, x, cy);
    if (i >= 0) {
      spawnCreature(w, k, [i], BUG.start);
      return;
    }
  }
}

/** How full a creature is, 0–1: below a half it is hungry. */
export function fullness(c: Creature): number {
  return Math.max(0, Math.min(1, c.energy / BUG.full));
}

/** Has it grown up (and can breed)? */
export function grownUp(c: Creature): boolean {
  return c.age >= lifespanOf(c) * BUG.grownAt;
}

/**
 * Leaves a dropping of `units` of what it has eaten. It goes into the soil
 * under the creature (through any dead leaves it is lying on), so the ground
 * gets richer, not higher. Away from the ground it waits.
 */
function drop(w: World, c: Creature, i: number, units: number): void {
  // One unit is its own body.
  if (c.store < units + 1) return;
  for (let j = i + W, k = 0; j < W * H && k < 4 * SCALE; j += W, k++) {
    const t = w.type[j];
    if (t === SOIL || t === SAND) {
      if (w.food[j] + units > 255) return;
      w.food[j] += units;
      c.store -= units;
      return;
    }
    if (t === EMPTY || !passable(t)) return;
  }
}

/**
 * A dead creature becomes dead matter (litter) where it lies, with what it
 * is made of and had eaten; in a plant or the like, it is breathed out.
 */
function killCreature(w: World, c: Creature): void {
  c.dead = true;
  w.orgs.delete(c.id);
  let left = c.store;
  const i = c.cells[0];
  if (i !== undefined) {
    if (w.critter[i] === c.id) w.critter[i] = 0;
    if (w.type[i] === EMPTY) {
      setCell(w, i, WASTE);
      w.food[i] = 0;
    }
    if (w.type[i] === WASTE) {
      const add = Math.min(left, 255 - w.food[i]);
      w.food[i] += add;
      left -= add;
    }
  }
  // Anything that did not fit is breathed out with its last breath.
  w.burned += left;
  c.store = 0;
}

/**
 * Eats cell j (a dead leaf, or feed). Half of what it eats is burnt for
 * energy (breathed out, and gone from the glass); the rest goes into its
 * store, to come out as droppings.
 */
function eat(w: World, c: Creature, j: number, perUnit: number): void {
  const units = w.food[j];
  w.food[j] = 0;
  clearCell(w, j);
  const burnt = units >> 1;
  w.burned += burnt;
  c.store += units - burnt;
  c.energy += units * perUnit;
}

/** Skrukketroll eat fallen leaves and other dead matter, and feed. Never living plants. */
function edibleForBug(t: number): boolean {
  return t === WASTE || t === FEED;
}

/**
 * A skrukketroll: one speck crawling about on the ground, eating fallen
 * leaves, leaving crumbs of soil, breeding when well fed, and dying of age.
 */
function updateBug(w: World, c: Creature): void {
  const i = c.cells[0];
  const g = c.genes;
  // Living costs about a unit of energy per update (at speed 3), and half as
  // much again while it is out walking or looking for food: fed, it can go
  // three or four days without food; hungry, a day or two.
  const out = hungry(c) || walking(c, w.tick);
  c.energy -= upkeep(1, g.speed, c.age) + (out && (c.age & 1) === 0 ? upkeep(1, g.speed, c.age >> 1) : 0);
  if (c.energy <= 0 || c.age > lifespanOf(c)) {
    killCreature(w, c);
    return;
  }
  const breedAt = bugBreedAt(g);
  // It nibbles at whatever dead leaves it is in or next to, now and then.
  if (w.rng.below(BUG_BITE_EVERY[g.growth - 1]) === 0) {
    const start = w.rng.below(8);
    for (let k = 0; k < 9; k++) {
      const j = k === 8 ? i : i + NEIGHBOURS[(start + k) & 7];
      if (inGlass(j, i) && edibleForBug(w.type[j])) {
        eat(w, c, j, BUG_PER_UNIT[g.growth - 1]);
        if (c.energy > BUG.full) c.energy = BUG.full;
        return;
      }
    }
  }
  if (c.age % BUG.dropEvery === 0) drop(w, c, i, BUG.dropUnits);
  // Breed, once grown up: a new one beside it, made from one unit of what it
  // has eaten (not from its own body).
  if (c.energy >= breedAt && c.store >= 2 && grownUp(c)) {
    for (const d of NEIGHBOURS) {
      const j = i + d;
      if (!inGlass(j, i) || !canEnter(w, j) || !supported(w, j, 0)) continue;
      const young = bugYoung(g);
      const child = spawnCreature(w, c.species, [j], young, inheritCreature(w, g), c.id);
      if (!child) break;
      c.young++;
      c.store--;
      c.energy -= young + 40;
      break;
    }
  }
  // Hungry, with nothing to eat right here: it goes looking. (While the
  // glass is watched it has mostly walked there already; see crawlCreatures.)
  if (hungry(c) && (c.age & 1) === 0 && !nextToFood(w, c.cells[0])) {
    if ((c.target < 0 || !edibleForBug(w.type[c.target])) && (c.age & 3) === 0) c.target = nearestFood(w, c.cells[0]);
    // To the food it has in mind; with none in mind, on along its way, looking.
    const target = c.target >= 0 && edibleForBug(w.type[c.target]) ? c.target : -1;
    for (let k = 0; k < 2 * SCALE; k++) crawlBug(w, c, target);
  }
}

/** Is a fed creature walking (rather than resting) at fast step `tick`? */
function walking(c: Creature, tick: number): boolean {
  const walk = (BUG.walk + (c.id % 31)) * TICKS_PER_SECOND;
  const rest = (BUG.rest + ((c.id * 7) % 61)) * TICKS_PER_SECOND;
  return (tick + c.id * 977) % (walk + rest) < walk;
}

function hungry(c: Creature): boolean {
  return c.energy < BUG.full >> 1;
}

function nextToFood(w: World, i: number): boolean {
  if (edibleForBug(w.type[i])) return true;
  for (const d of NEIGHBOURS) if (inGlass(i + d, i) && edibleForBug(w.type[i + d])) return true;
  return false;
}

/** Buried (soil fell on it) or swamped: it climbs up out of it, if it can. */
function escape(w: World, c: Creature): boolean {
  const i = c.cells[0];
  for (let k = 1; k <= 4 * SCALE; k++) {
    const j = i - k * W;
    if (j < 0) break;
    if (canEnter(w, j)) {
      moveTo(w, c, j);
      return true;
    }
  }
  return false;
}

/**
 * The fast steps: creatures crawl. One that something has fallen on climbs
 * out (deep under, it drowns); one with nothing to hold on to falls, through
 * plants, and floats if it lands on water. A hungry one walks to the food it
 * has in mind (looking around now and then for the nearest it can sense) and
 * sits there eating; a fed one walks about for a while, then rests for a
 * while.
 */
export function crawlCreatures(w: World, walk: boolean): void {
  for (const c of w.creatures) {
    if (c.dead || (c.id + w.tick) % CRAWL_EVERY !== 0) continue;
    if (c.cells[0] === undefined) continue;
    if (!passable(w.type[c.cells[0]]) && !escape(w, c)) {
      killCreature(w, c);
      continue;
    }
    const i = c.cells[0];
    if (!supported(w, i, c.id)) {
      for (let k = 0; k < SCALE; k++) {
        const j = c.cells[0] + W;
        if (j >= W * H) break;
        if (!canEnter(w, j)) break;
        moveTo(w, c, j);
        if (supported(w, j, c.id)) break;
      }
      continue;
    }
    if (!walk) continue;
    const hunting = hungry(c);
    if (hunting) {
      if (nextToFood(w, i)) continue;
      if ((c.target < 0 || !edibleForBug(w.type[c.target])) && (c.id + w.tick) % LOOK_EVERY === 0) c.target = nearestFood(w, i);
      if (c.target >= 0 && !edibleForBug(w.type[c.target])) c.target = -1;
    } else if (!walking(c, w.tick)) continue;
    if (w.rng.below(5) < c.genes.speed) crawlBug(w, c, hunting ? c.target : -1);
  }
}

/**
 * The nearest fallen leaf (or feed) a skrukketroll can sense from i, or -1.
 * It looks in widening rings, and stops at the first ring with food in it.
 */
function nearestFood(w: World, i: number): number {
  const x0 = i % W;
  const y0 = (i / W) | 0;
  for (let r = 1; r <= BUG.sense; r++) {
    let best = -1;
    let bestD = 1e9;
    for (let y = y0 - r; y <= y0 + r; y++) {
      if (y < 0 || y >= H) continue;
      // Along the top and bottom of the ring every cell; along the sides only the ends.
      const edge = y === y0 - r || y === y0 + r;
      for (let x = x0 - r; x <= x0 + r; x += edge ? 1 : 2 * r) {
        if (x < 0 || x >= W || !edibleForBug(w.type[y * W + x])) continue;
        const d = (x - x0) * (x - x0) + (y - y0) * (y - y0);
        if (d < bestD) {
          bestD = d;
          best = y * W + x;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/**
 * Crawl to a neighbouring cell with something to hold on to: towards the
 * food it has in mind if it has some; otherwise on the way it is heading
 * (turning back when it cannot go on), and gladly next to dead leaves. It
 * keeps a little away from others of its kind, so they spread out.
 */
function crawlBug(w: World, c: Creature, target: number): void {
  const i = c.cells[0];
  if (!supported(w, i, c.id)) return;
  const tx = target % W;
  const ty = (target / W) | 0;
  let best = -1;
  let bestScore = -1e9;
  const start = w.rng.below(8);
  for (let k = 0; k < 8; k++) {
    const d = NEIGHBOURS[(start + k) & 7];
    const j = i + d;
    if (!inGlass(j, i) || !canEnter(w, j) || !supported(w, j, c.id)) continue;
    let score = edibleForBug(w.type[j]) ? 3 : 0;
    for (const d of NEIGHBOURS) {
      const n = j + d;
      if (!inGlass(n, j)) continue;
      if (edibleForBug(w.type[n])) score += 3;
      else if (w.critter[n] !== 0 && w.critter[n] !== c.id) score -= 2;
    }
    if (target >= 0) {
      const x = j % W;
      const y = (j / W) | 0;
      score -= ((x - tx) * (x - tx) + (y - ty) * (y - ty)) >> 2;
    } else score += Math.sign((j % W) - (i % W)) * c.heading * 6;
    if (score > bestScore) {
      bestScore = score;
      best = j;
    }
  }
  if (best < 0) {
    c.heading = -c.heading;
    return;
  }
  const dx = Math.sign((best % W) - (i % W));
  if (target >= 0) {
    if (dx !== 0) c.heading = dx;
  } else if (dx === -c.heading) c.heading = dx;
  moveTo(w, c, best);
}

export function updateCreatures(w: World): void {
  const list = w.creatures;
  let anyDead = false;
  for (let k = 0; k < list.length; k++) {
    const c = list[k];
    if (c.dead) {
      anyDead = true;
      continue;
    }
    if ((c.id + w.life) % CREATURE_EVERY !== 0) continue;
    // Gone from its cell (it should not be): then it is gone.
    if (c.cells.length === 0 || w.critter[c.cells[0]] !== c.id) {
      c.dead = true;
      w.orgs.delete(c.id);
      anyDead = true;
      continue;
    }
    c.age++;
    updateBug(w, c);
    if (c.dead) anyDead = true;
  }
  if (anyDead) w.creatures = w.creatures.filter((c) => !c.dead);
}
