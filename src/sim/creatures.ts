import { APHID, CREATURE_PART, EMPTY, FEED, FLOWER, FUNGUS, LEAF, PLANT_PART, SAND, SLIME, SOIL, STEM, WASTE, WATER, WORM } from "./cells";
import type { CreatureSpecies } from "./species";
import { AREA, H, SCALE, TICKS_PER_SECOND, W } from "./dims";
import { clearCell, setCell, swapCells, type World } from "./world";

export interface Creature {
  kind: "creature";
  id: number;
  species: number;
  energy: number;
  /** Nutrient units eaten and not yet passed on as droppings or offspring. */
  store: number;
  /** Creature updates since it was born. */
  age: number;
  cells: number[];
  /** Which way a mass is creeping when it has nothing to go for: -1 or 1. */
  dir: number;
  dead: boolean;
}

/** Creatures are updated every CREATURE_EVERY steps, spread over the steps by id. */
export const CREATURE_EVERY = 2;
const MAX_CREATURES = 160;

/** Bugs (plant eaters): one cell each. */
const BUG = {
  start: 120,
  /** Energy per unit eaten. */
  perUnit: 50,
  full: 340,
  /** One bite in this many updates, when next to food and hungry. */
  biteEvery: 24,
  breedAt: 260,
  lifespan: 240,
  /** Updates between droppings. */
  dropEvery: 40,
};

/** Masses (creature eaters): a creeping clump of cells. */
const MASS = {
  start: 320,
  perUnit: 70,
  sense: 12 * SCALE,
  splitAt: 22 * AREA,
  /** Tallest a mass can heap up. */
  height: 3 * SCALE,
  dropEvery: 24,
  /** Energy to grow (and given back by losing) one cell. */
  cellCost: (60 / AREA) | 0,
};

const NEIGHBOURS = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];

function inGlass(i: number, from: number): boolean {
  return i >= 0 && i < W * H && Math.abs((i % W) - (from % W)) <= 1;
}

/** Something to stand or hang on next to cell i (not counting `self`). */
function supported(w: World, i: number, self: number): boolean {
  if (i >= W * (H - 1)) return true;
  for (const d of NEIGHBOURS) {
    const j = i + d;
    if (!inGlass(j, i) || w.org[j] === self && self !== 0) continue;
    const t = w.type[j];
    if (t !== EMPTY && t !== WATER) return true;
  }
  return false;
}

function newId(w: World): number {
  for (let n = 0; n < 65535; n++) {
    const id = w.nextOrgId;
    w.nextOrgId = id >= 65535 ? 1 : id + 1;
    if (!w.orgs.has(id)) return id;
  }
  return 0;
}

function cellType(sp: CreatureSpecies): number {
  return sp.diet === "plants" ? APHID : sp.diet === "creatures" ? SLIME : WORM;
}

/** Puts a creature cell made of `units` units into an empty cell. */
function addCell(w: World, c: Creature, i: number, units: number): void {
  setCell(w, i, cellType(w.creatureSpecies[c.species]));
  w.org[i] = c.id;
  w.kind[i] = c.species;
  w.food[i] = units;
  c.cells.push(i);
}

/** Starts a new creature in the given empty cells; the units come with it. */
export function spawnCreature(w: World, species: number, at: number[], energy: number): Creature | null {
  if (w.creatures.length >= MAX_CREATURES) return null;
  const id = newId(w);
  if (id === 0) return null;
  const c: Creature = { kind: "creature", id, species, energy, store: 0, age: 0, cells: [], dir: w.rng.below(2) === 0 ? -1 : 1, dead: false };
  for (const i of at) addCell(w, c, i, 1);
  w.creatures.push(c);
  w.orgs.set(id, c);
  return c;
}

/** Leaves a dropping (one unit of waste) in an empty cell next to i. */
function drop(w: World, c: Creature, i: number): void {
  if (c.store < 1) return;
  for (const d of [W, W - 1, W + 1, -1, 1]) {
    const j = i + d;
    if (!inGlass(j, i) || w.type[j] !== EMPTY) continue;
    setCell(w, j, WASTE);
    w.food[j] = 1;
    c.store--;
    return;
  }
}

/** A dead creature becomes waste; what it had eaten goes with it. */
function killCreature(w: World, c: Creature): void {
  c.dead = true;
  w.orgs.delete(c.id);
  let left = c.store;
  for (const i of c.cells) {
    if (w.org[i] !== c.id || !CREATURE_PART[w.type[i]]) continue;
    w.type[i] = WASTE;
    w.org[i] = 0;
    const add = Math.min(left, 255 - w.food[i]);
    w.food[i] += add;
    left -= add;
  }
  c.store = left;
}

/**
 * Eats cell j: its units go into the creature's store. If j belonged to
 * another creature, that creature loses the cell, and if it was its last,
 * what it had eaten goes along.
 */
function eat(w: World, c: Creature, j: number, perUnit: number): void {
  const units = w.food[j];
  c.store += units;
  c.energy += units * perUnit;
  const victim = w.org[j] ? w.orgs.get(w.org[j]) : undefined;
  w.food[j] = 0;
  clearCell(w, j);
  if (victim && victim.kind === "creature" && victim !== c) {
    victim.cells = victim.cells.filter((i) => i !== j);
    if (victim.cells.length === 0) {
      c.store += victim.store;
      c.energy += victim.store * perUnit;
      victim.store = 0;
      victim.dead = true;
      w.orgs.delete(victim.id);
    }
  }
}

/** Bugs eat leaves, flowers and feed, but leave stems, so plants can leaf out again. */
function edibleForBug(t: number): boolean {
  return t === LEAF || t === FLOWER || t === FEED;
}

/** A plant eater: one speck that crawls over plants and ground, eats and breeds. */
function updateBug(w: World, c: Creature): void {
  const i = c.cells[0];
  c.energy--;
  if (c.energy <= 0 || c.age * CREATURE_EVERY > BUG.lifespan * TICKS_PER_SECOND) {
    killCreature(w, c);
    return;
  }
  // Eat something next to it, if hungry.
  if (c.energy < BUG.full && w.rng.below(BUG.biteEvery) === 0) {
    const start = w.rng.below(8);
    for (let k = 0; k < 8; k++) {
      const j = i + NEIGHBOURS[(start + k) & 7];
      if (inGlass(j, i) && edibleForBug(w.type[j])) {
        eat(w, c, j, BUG.perUnit);
        return;
      }
    }
  }
  if (c.age % BUG.dropEvery === 0 && c.store > 2) drop(w, c, i);
  // Breed: a new bug beside it, made from one unit of what it has eaten.
  if (c.energy >= BUG.breedAt && c.store >= 1) {
    for (const d of NEIGHBOURS) {
      const j = i + d;
      if (!inGlass(j, i) || w.type[j] !== EMPTY || !supported(w, j, 0)) continue;
      const child = spawnCreature(w, c.species, [], 100);
      if (!child) break;
      addCell(w, child, j, 1);
      c.store--;
      c.energy -= 140;
      break;
    }
  }
  // Fall if there is nothing to hold on to.
  if (!supported(w, i, c.id)) {
    for (let k = 0; k < SCALE; k++) {
      const at = c.cells[0];
      if (at >= W * (H - 1) || w.type[at + W] !== EMPTY) break;
      moveCell(w, c, 0, at + W);
    }
    return;
  }
  // Crawl SCALE steps (each one half the time), so bugs keep their pace.
  for (let k = 0; k < SCALE; k++) if (w.rng.below(2) === 0) crawlBug(w, c);
}

/** Crawl to a neighbouring cell with something to hold on to, preferring food. */
function crawlBug(w: World, c: Creature): void {
  const i = c.cells[0];
  if (!supported(w, i, c.id)) return;
  let best = -1;
  let bestScore = -1;
  const start = w.rng.below(8);
  for (let k = 0; k < 8; k++) {
    const j = i + NEIGHBOURS[(start + k) & 7];
    if (!inGlass(j, i) || w.type[j] !== EMPTY || !supported(w, j, c.id)) continue;
    // Bugs stay on plants (where the slime cannot reach), and go for food.
    let score = 1;
    for (const d of NEIGHBOURS) {
      const n = j + d;
      if (!inGlass(n, j)) continue;
      const t = w.type[n];
      if (edibleForBug(t)) score += 3;
      else if (t === STEM) score += 2;
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

/** Empty cells next to the mass where it can creep or grow to. */
function frontier(w: World, c: Creature): number[] {
  const out: number[] = [];
  for (const i of c.cells) {
    for (const d of [-1, 1, -W, W]) {
      const j = i + d;
      if (!inGlass(j, i) || w.type[j] !== EMPTY || out.includes(j)) continue;
      // Rests on something: the ground, or its own body below, but never
      // more than MASS.height cells tall.
      if (j < W * (H - 1)) {
        const below = j + W;
        // Only on the ground: a mass cannot climb plants.
        if (w.type[below] === EMPTY || w.type[below] === WATER || PLANT_PART[w.type[below]]) continue;
        let tall = 0;
        for (let b = below; b < W * H && w.org[b] === c.id && tall < MASS.height; b += W) tall++;
        if (tall >= MASS.height - 1) continue;
      }
      out.push(j);
    }
  }
  return out;
}

/** A mass with nothing under it slumps down one cell. */
function slump(w: World, c: Creature): boolean {
  for (const i of c.cells) {
    if (i >= W * (H - 1)) return false;
    const t = w.type[i + W];
    if (t !== EMPTY && t !== WATER && w.org[i + W] !== c.id) return false;
  }
  // Move the lowest cells first, so nothing is in the way.
  const order = c.cells.map((_, k) => k).sort((a, b) => c.cells[b] - c.cells[a]);
  for (const k of order) {
    const j = c.cells[k] + W;
    if (w.type[j] === EMPTY) moveCell(w, c, k, j);
  }
  return true;
}

/** A creature eater: a soft mass that creeps along the ground towards prey. */
function updateMass(w: World, c: Creature): void {
  if (slump(w, c)) return;
  const n = c.cells.length;
  c.energy -= (c.age & 1) + ((n / (8 * AREA)) | 0);

  // Where are we, and is there anything to go for?
  let sx = 0;
  let sy = 0;
  for (const i of c.cells) {
    sx += i % W;
    sy += (i / W) | 0;
  }
  const cx = (sx / n) | 0;
  const cy = (sy / n) | 0;
  let tx = -1;
  let ty = -1;
  let bestD = 1e9;
  const r = MASS.sense;
  for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
      const j = y * W + x;
      const t = w.type[j];
      const prey = t === FEED || (CREATURE_PART[t] && w.kind[j] !== c.species);
      if (!prey) continue;
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bestD) {
        bestD = d;
        tx = x;
        ty = y;
      }
    }
  }

  // Eat what it touches: a few bites at a time.
  let bites = 0;
  for (let k = 0; k < c.cells.length && bites < SCALE; k++) {
    const i = c.cells[k];
    for (const d of [-1, 1, -W, W, -W - 1, -W + 1]) {
      const j = i + d;
      if (!inGlass(j, i)) continue;
      const t = w.type[j];
      if (t === FEED || (CREATURE_PART[t] && w.kind[j] !== c.species && w.org[j] !== c.id)) {
        eat(w, c, j, MASS.perUnit);
        if (++bites >= SCALE) break;
      }
    }
  }

  if (c.age % MASS.dropEvery === 0 && c.store > 3) drop(w, c, c.cells[w.rng.below(c.cells.length)]);

  // Starving: lose a cell to waste. The last cell: dead.
  if (c.energy < 0) {
    if (c.cells.length === 1) {
      killCreature(w, c);
      return;
    }
    const k = w.rng.below(c.cells.length);
    const i = c.cells[k];
    w.type[i] = WASTE;
    w.org[i] = 0;
    c.cells.splice(k, 1);
    c.energy += MASS.cellCost;
    return;
  }

  const front = frontier(w, c);
  if (front.length === 0) return;
  // Score cells by how far they lie towards the target (or the way it creeps).
  const score = (j: number) => {
    const x = j % W;
    const y = (j / W) | 0;
    if (tx >= 0) return -((x - tx) * (x - tx) + (y - ty) * (y - ty));
    return x * c.dir - Math.abs(y - cy) * 2;
  };
  let best = front[0];
  for (const j of front) if (score(j) > score(best)) best = j;
  if (tx < 0) {
    const bx = best % W;
    if (bx <= SCALE || bx >= W - 1 - SCALE || w.rng.below(60) === 0) c.dir = -c.dir;
  }

  // Grow if well fed, otherwise creep: the hindmost cell flows to the front.
  if (c.store >= 1 && c.energy > 160 + (((n * 10) / AREA) | 0)) {
    for (let g = 0; g < SCALE && c.store >= 1; g++) {
      let to = best;
      if (g > 0) {
        const more = frontier(w, c);
        if (more.length === 0) break;
        to = more[0];
        for (const j of more) if (score(j) > score(to)) to = j;
      }
      addCell(w, c, to, 1);
      c.store--;
      c.energy -= MASS.cellCost;
    }
  } else if (n === 1) {
    if (w.rng.below(3) === 0) moveCell(w, c, 0, best);
  } else {
    // A bigger mass moves more cells at a time, so it is not slower. It
    // hurries towards prey and dawdles when it has nothing to go for.
    const moves = tx >= 0 ? 1 + (n >> 2) : w.rng.below(3) === 0 ? 1 : 0;
    for (let m = 0; m < moves; m++) {
      const options = m === 0 ? front : frontier(w, c);
      if (options.length === 0) break;
      let to = options[0];
      for (const j of options) if (score(j) > score(to)) to = j;
      let back = 0;
      for (let k = 1; k < c.cells.length; k++) if (score(c.cells[k]) < score(c.cells[back])) back = k;
      if (score(to) <= score(c.cells[back])) break;
      moveCell(w, c, back, to);
    }
  }

  // Grown big: split in two.
  if (c.cells.length >= MASS.splitAt) {
    const sorted = [...c.cells].sort((a, b) => (a % W) - (b % W) || a - b);
    const half = sorted.slice(0, sorted.length >> 1);
    const other = spawnCreature(w, c.species, [], c.energy >> 1);
    if (other) {
      c.energy -= other.energy;
      other.dir = -c.dir;
      other.store = c.store >> 1;
      c.store -= other.store;
      for (const i of half) w.org[i] = other.id;
      other.cells = half;
      c.cells = c.cells.filter((i) => w.org[i] === c.id);
    }
  }
}

/** Worms (waste eaters): a short line of cells burrowing through the soil. */
const WORMS = {
  perUnit: 60,
  sense: 8 * SCALE,
  /** Updates between giving a unit back to the soil. */
  castEvery: 4,
  growAt: 400,
  splitAt: 8 * SCALE,
  /** Energy to grow (and given back by losing) one segment. */
  segmentCost: (120 / SCALE) | 0,
};

/** What worms eat: waste, feed, and the fungus that grows on waste. */
function wormFood(t: number): boolean {
  return t === WASTE || t === FEED || t === FUNGUS;
}

function isSoil(t: number): boolean {
  return t === SOIL || t === SAND;
}

/** Where a worm's head can go: into soil, or along a tunnel under the ground. */
function burrowable(w: World, j: number): boolean {
  const t = w.type[j];
  if (isSoil(t)) return true;
  return t === EMPTY && j >= W && isSoil(w.type[j - W]);
}

/** Moves the worm's head into j; every segment follows, and the soil at j ends up behind the tail. */
function crawl(w: World, c: Creature, j: number): void {
  let prev = j;
  for (let k = 0; k < c.cells.length; k++) {
    swapCells(w, prev, c.cells[k]);
    const was = c.cells[k];
    c.cells[k] = prev;
    prev = was;
  }
}

/** How deep below the surface a worm likes to stay. */
const WORM_DEPTH_MIN = 2 * SCALE;
const WORM_DEPTH_MAX = 9 * SCALE;

function updateWorm(w: World, c: Creature): void {
  const n = c.cells.length;
  // Living costs a little, more for a long worm.
  if ((c.age & 3) === 0) c.energy -= 1 + ((n / (4 * SCALE)) | 0);
  if (c.energy <= 0) {
    if (n === 1) {
      killCreature(w, c);
      return;
    }
    const tail = c.cells.pop()!;
    w.type[tail] = WASTE;
    w.org[tail] = 0;
    c.energy += WORMS.segmentCost >> 1;
    return;
  }
  const head = c.cells[0];

  // Eat waste, feed or fungus right next to the head.
  for (const d of NEIGHBOURS) {
    const j = head + d;
    if (!inGlass(j, head)) continue;
    if (wormFood(w.type[j])) {
      eat(w, c, j, WORMS.perUnit);
      break;
    }
  }

  // Give what it has eaten back to the soil around it: this is how waste
  // becomes food for plants again.
  if (c.store > 0 && c.age % WORMS.castEvery === 0) {
    for (let k = 0; k < SCALE && c.store > 0; k++) {
      const seg = c.cells[(c.age + k * 7) % n];
      for (const d of [W, -1, 1, -W]) {
        const j = seg + d;
        if (inGlass(j, seg) && isSoil(w.type[j]) && w.food[j] < 250) {
          w.food[j]++;
          c.store--;
          break;
        }
      }
    }
  }

  // Grow a segment, or split in two when long.
  if (c.energy > WORMS.growAt && c.store >= 1 && n < WORMS.splitAt) {
    const tail = c.cells[n - 1];
    for (const d of [W, -1, 1, -W]) {
      const j = tail + d;
      if (!inGlass(j, tail) || !isSoil(w.type[j])) continue;
      c.store += w.food[j];
      w.food[j] = 0;
      clearCell(w, j);
      addCell(w, c, j, 1);
      c.store--;
      c.energy -= WORMS.segmentCost;
      break;
    }
  } else if (n >= WORMS.splitAt) {
    const back = c.cells.splice(n >> 1);
    const other = spawnCreature(w, c.species, [], c.energy >> 1);
    if (other) {
      c.energy -= other.energy;
      other.store = c.store >> 1;
      c.store -= other.store;
      for (const i of back) w.org[i] = other.id;
      other.cells = back.reverse();
    } else c.cells.push(...back);
  }

  // Burrow SCALE steps (each one half the time), so worms keep their pace.
  for (let k = 0; k < SCALE; k++) if (w.rng.below(2) === 0) burrow(w, c);
}

/** Head for the nearest waste the worm can sense, else wander on. */
function burrow(w: World, c: Creature): void {
  const head = c.cells[0];
  const hx = head % W;
  const hy = (head / W) | 0;
  let tx = -1;
  let ty = -1;
  let bestD = 1e9;
  const r = WORMS.sense;
  for (let y = Math.max(0, hy - r); y <= Math.min(H - 1, hy + r); y++) {
    for (let x = Math.max(0, hx - r); x <= Math.min(W - 1, hx + r); x++) {
      if (!wormFood(w.type[y * W + x])) continue;
      const d = (x - hx) * (x - hx) + (y - hy) * (y - hy);
      if (d < bestD) {
        bestD = d;
        tx = x;
        ty = y;
      }
    }
  }
  let surface = 0;
  while (surface < hy && !isSoil(w.type[surface * W + hx])) surface++;
  const depth = hy - surface;
  if (w.rng.below(40) === 0) c.dir = -c.dir;
  // Eight ways, so it can slip between roots that grow on the slant.
  const start = w.rng.below(8);
  let best = -1;
  if (tx >= 0) {
    // Go for the food, if any move brings it closer.
    let bestScore = -((hx - tx) * (hx - tx) + (hy - ty) * (hy - ty));
    for (let k = 0; k < 8; k++) {
      const j = head + NEIGHBOURS[(start + k) & 7];
      if (!inGlass(j, head) || !burrowable(w, j)) continue;
      const x = j % W;
      const y = (j / W) | 0;
      const score = -((x - tx) * (x - tx) + (y - ty) * (y - ty));
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
  }
  if (best < 0) {
    // Nothing to go for, or no way to get closer to it (up in a heap,
    // behind a stone): wander on sideways, keeping to the upper soil where
    // things fall.
    let bestScore = -1e9;
    for (let k = 0; k < 8; k++) {
      const j = head + NEIGHBOURS[(start + k) & 7];
      if (!inGlass(j, head) || !burrowable(w, j)) continue;
      const dx = (j % W) - hx;
      const dy = ((j / W) | 0) - hy;
      let score = (dx === c.dir ? 2 : 0) + w.rng.below(3);
      if (depth > WORM_DEPTH_MAX) score -= dy * 4;
      else if (depth < WORM_DEPTH_MIN) score += dy * 4;
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
  }
  if (best >= 0) crawl(w, c, best);
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
    if ((c.id + w.tick) % CREATURE_EVERY !== 0) continue;
    // Drop cells that are gone (eaten, dug away).
    c.cells = c.cells.filter((i) => w.org[i] === c.id && CREATURE_PART[w.type[i]] === 1);
    if (c.cells.length === 0) {
      c.dead = true;
      w.orgs.delete(c.id);
      anyDead = true;
      continue;
    }
    c.age++;
    const sp = w.creatureSpecies[c.species];
    if (sp.diet === "plants") updateBug(w, c);
    else if (sp.diet === "creatures") updateMass(w, c);
    else updateWorm(w, c);
    if (c.dead) anyDead = true;
  }
  // A creature can also die while another one is being updated (eaten).
  if (anyDead || w.creatures.some((c) => c.dead)) w.creatures = w.creatures.filter((c) => !c.dead);
}
