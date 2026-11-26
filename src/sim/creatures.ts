import { CREATURE_PART, EMPTY, FEED, ISOPOD, PLANT_PART, ROOT, SAND, SOIL, WASTE, WATER } from "./cells";
import { H, LIFE_PER_DAY, SCALE, W } from "./dims";
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
  dead: boolean;
}

/**
 * Creatures live (eat, age, breed) every CREATURE_EVERY life steps, spread
 * over the steps by id; they crawl in the fast steps, every CRAWL_EVERY.
 */
export const CREATURE_EVERY = 2;
const CRAWL_EVERY = 4;
const MAX_CREATURES = 60;

/** Skrukketroll (litter eaters): one cell each, living on the ground. */
const BUG = {
  start: 120,
  /** About how long one lives, in days (give or take a fifth): two to three weeks. */
  lifespanDays: 17,
  /** It is grown up, and can breed, when this share of its life is behind it. */
  grownAt: 1 / 3,
  /** A fed one rests; one crawl in this many it takes a step anyway. */
  restless: 200,
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
 * Something to stand or hang on next to cell i (not counting `self`): the
 * ground, a heap of leaves, another animal. Not a plant: plants are not
 * something animals live on.
 */
function supported(w: World, i: number, self: number): boolean {
  if (i >= W * (H - 1)) return true;
  for (const d of NEIGHBOURS) {
    const j = i + d;
    if (!inGlass(j, i) || (w.org[j] === self && self !== 0)) continue;
    const t = w.type[j];
    if (t !== EMPTY && t !== WATER && !PLANT_PART[t]) return true;
  }
  return false;
}

/** How many cells of plant a creature can slip past at once. */
const PAST = 2 * SCALE;

/**
 * Plants are no wall: going sideways (d = -1 or 1) from i, a creature slips
 * between the stems to the first open cell beyond them. Returns that cell,
 * or -1 if there is no plant there, or no room beyond it.
 */
function pastPlant(w: World, i: number, d: number): number {
  const x = i % W;
  for (let k = 1; k <= PAST + 1; k++) {
    const nx = x + d * k;
    if (nx < 0 || nx >= W) return -1;
    const t = w.type[i + d * k];
    if (t === EMPTY) return k > 1 ? i + d * k : -1;
    if (!PLANT_PART[t] || t === ROOT) return -1;
  }
  return -1;
}

/** About how long a creature lives, in creature updates: give or take a fifth, so they do not all die at once. */
export function lifespanOf(c: Creature): number {
  return ((BUG.lifespanDays * LIFE_PER_DAY * (80 + (c.id % 41))) / 100 / CREATURE_EVERY) | 0;
}


/** Puts a creature cell made of `units` units into an empty cell. */
function addCell(w: World, c: Creature, i: number, units: number): void {
  setCell(w, i, ISOPOD);
  w.org[i] = c.id;
  w.kind[i] = c.species;
  w.food[i] = units;
  c.cells.push(i);
}

/**
 * Starts a new creature in the given empty cells; the units come with it.
 * Without genes it gets its species' own.
 */
export function spawnCreature(w: World, species: number, at: number[], energy: number, genes?: CreatureGenes, mother = 0): Creature | null {
  if (w.creatures.length >= MAX_CREATURES) return null;
  const id = newOrgId(w);
  if (id === 0) return null;
  const g = genes ?? creatureGenesOf(w.creatureSpecies[species]);
  const c: Creature = { kind: "creature", id, species, energy, store: 0, age: 0, cells: [], genes: g, mother, young: 0, dead: false };
  for (const i of at) addCell(w, c, i, 1);
  w.creatures.push(c);
  w.orgs.set(id, c);
  return c;
}

/** The empty cell where something dropped at (x, y) comes to rest, or -1 over water. */
function landing(w: World, x: number, y: number): number {
  while (y < H - 1 && w.type[(y + 1) * W + x] === EMPTY) y++;
  const i = y * W + x;
  if (w.type[i] !== EMPTY) return -1;
  return y < H - 1 && w.type[i + W] === WATER ? -1 : i;
}

/** Lets one creature go at (cx, cy): it lands on the ground below (or the nearest bare ground). */
export function releaseCreature(w: World, cx: number, cy: number, species: number): void {
  if (cx < 0 || cx >= W || cy < 0 || cy >= H) return;
  const k = Math.min(species, w.creatureSpecies.length - 1);
  // Over water, or over a plant? Let it go on the nearest bare ground instead.
  for (let d = 0; d < W; d++) {
    const x = cx + (d % 2 === 0 ? d >> 1 : -((d + 1) >> 1));
    if (x < 0 || x >= W) continue;
    const i = landing(w, x, cy);
    if (i >= 0 && !(i < W * (H - 1) && PLANT_PART[w.type[i + W]])) {
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
  if (c.store < units) return;
  for (let j = i + W, k = 0; j < W * H && k < 4 * SCALE; j += W, k++) {
    const t = w.type[j];
    if (t === SOIL || t === SAND) {
      if (w.food[j] + units > 255) return;
      w.food[j] += units;
      c.store -= units;
      return;
    }
    if (t !== WASTE && t !== FEED && !CREATURE_PART[t]) return;
  }
}

/** A dead creature becomes dead matter (litter); what it had eaten goes with it. */
function killCreature(w: World, c: Creature): void {
  c.dead = true;
  w.orgs.delete(c.id);
  let left = c.store;
  for (const i of c.cells) {
    if (w.org[i] !== c.id || !CREATURE_PART[w.type[i]]) continue;
    w.type[i] = WASTE;
    w.kind[i] = 0;
    w.org[i] = 0;
    const add = Math.min(left, 255 - w.food[i]);
    w.food[i] += add;
    left -= add;
  }
  // Anything that did not fit (rare) is breathed out with its last breath.
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
  // It lives frugally: a quarter of a unit of energy per update, at speed 3.
  c.energy -= upkeep((c.age & 3) === 0 ? 1 : 0, g.speed, c.age >> 2);
  if (c.energy <= 0 || c.age > lifespanOf(c)) {
    killCreature(w, c);
    return;
  }
  const breedAt = bugBreedAt(g);
  // It nibbles at whatever dead leaves are next to it, now and then.
  if (w.rng.below(BUG_BITE_EVERY[g.growth - 1]) === 0) {
    const start = w.rng.below(8);
    for (let k = 0; k < 8; k++) {
      const j = i + NEIGHBOURS[(start + k) & 7];
      if (inGlass(j, i) && edibleForBug(w.type[j])) {
        eat(w, c, j, BUG_PER_UNIT[g.growth - 1]);
        if (c.energy > BUG.full) c.energy = BUG.full;
        return;
      }
    }
  }
  if (c.age % BUG.dropEvery === 0) drop(w, c, i, BUG.dropUnits);
  // Breed, once grown up: a new one beside it, made from one unit of what it has eaten.
  if (c.energy >= breedAt && c.store >= 1 && grownUp(c)) {
    for (const d of NEIGHBOURS) {
      const j = i + d;
      if (!inGlass(j, i) || w.type[j] !== EMPTY || !supported(w, j, 0)) continue;
      const young = bugYoung(g);
      const child = spawnCreature(w, c.species, [], young, inheritCreature(w, g), c.id);
      if (!child) break;
      addCell(w, child, j, 1);
      c.young++;
      c.store--;
      c.energy -= young + 40;
      break;
    }
  }
  // Hungry, with nothing to eat right here: it goes looking. (While the
  // glass is watched it has mostly crawled there already; see crawlCreatures.)
  if (hungry(c) && !nextToFood(w, c.cells[0])) {
    const target = nearestFood(w, c.cells[0]);
    for (let k = 0; k < 3 * SCALE; k++) crawlBug(w, c, target);
  }
}

function hungry(c: Creature): boolean {
  return c.energy < BUG.full >> 1;
}

function nextToFood(w: World, i: number): boolean {
  for (const d of NEIGHBOURS) if (inGlass(i + d, i) && edibleForBug(w.type[i + d])) return true;
  return false;
}

/**
 * The fast steps: creatures crawl. One with nothing to hold on to falls
 * (straight through any plant). A hungry one crawls towards the nearest
 * fallen leaves it can sense and sits there eating; a fed one rests, and
 * takes a step now and then.
 */
export function crawlCreatures(w: World): void {
  for (const c of w.creatures) {
    if (c.dead || (c.id + w.tick) % CRAWL_EVERY !== 0) continue;
    const i = c.cells[0];
    if (i === undefined || w.org[i] !== c.id) continue;
    if (!supported(w, i, c.id)) {
      for (let k = 0; k < SCALE; k++) {
        let j = c.cells[0] + W;
        while (j < W * H && PLANT_PART[w.type[j]] && w.type[j] !== ROOT) j += W;
        if (j >= W * H || w.type[j] !== EMPTY) break;
        moveCell(w, c, 0, j);
      }
      continue;
    }
    if (hungry(c)) {
      if (nextToFood(w, i)) continue;
      if (w.rng.below(5) < c.genes.speed) crawlBug(w, c, nearestFood(w, i));
    } else if (w.rng.below(BUG.restless) === 0) crawlBug(w, c, -1);
  }
}

/** The nearest fallen leaf (or feed) a skrukketroll can sense from i, or -1. */
function nearestFood(w: World, i: number): number {
  const r = BUG.sense;
  const x0 = i % W;
  const y0 = (i / W) | 0;
  let best = -1;
  let bestD = 1e9;
  for (let y = Math.max(0, y0 - r); y <= Math.min(H - 1, y0 + r); y++) {
    for (let x = Math.max(0, x0 - r); x <= Math.min(W - 1, x0 + r); x++) {
      if (!edibleForBug(w.type[y * W + x])) continue;
      const d = (x - x0) * (x - x0) + (y - y0) * (y - y0);
      if (d < bestD) {
        bestD = d;
        best = y * W + x;
      }
    }
  }
  return best;
}

/**
 * Crawl to a neighbouring cell with something to hold on to: next to food
 * if it can, towards the nearest food it can sense if not,
 * and a little away from others of its kind, so they spread out.
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
    let j = i + d;
    if (!inGlass(j, i)) continue;
    if ((d === -1 || d === 1) && PLANT_PART[w.type[j]]) j = pastPlant(w, i, d);
    if (j < 0 || w.type[j] !== EMPTY || !supported(w, j, c.id)) continue;
    let score = 0;
    for (const d of NEIGHBOURS) {
      const n = j + d;
      if (!inGlass(n, j)) continue;
      const t = w.type[n];
      if (edibleForBug(t)) score += 3;
      else if (t === ISOPOD && w.org[n] !== c.id) score -= 2;
    }
    if (target >= 0) {
      const x = j % W;
      const y = (j / W) | 0;
      score -= ((x - tx) * (x - tx) + (y - ty) * (y - ty)) >> 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = j;
    }
  }
  if (best >= 0) moveCell(w, c, 0, best);
}

/** Moves creature cell number k to the empty cell j, with what it carries. */
function moveCell(w: World, c: Creature, k: number, j: number): void {
  const i = c.cells[k];
  const units = w.food[i];
  clearCell(w, i);
  addCell(w, c, j, units);
  c.cells.pop();
  c.cells[k] = j;
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
    // Drop cells that are gone (eaten, dug away).
    c.cells = c.cells.filter((i) => w.org[i] === c.id && CREATURE_PART[w.type[i]] === 1);
    if (c.cells.length === 0) {
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
