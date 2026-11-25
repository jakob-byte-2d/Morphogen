import { APHID, CREATURE_PART, EMPTY, FEED, FLOWER, LEAF, SLIME, STEM, WASTE, WATER } from "./cells";
import type { CreatureSpecies } from "./species";
import { H, TICKS_PER_SECOND, W } from "./dims";
import { clearCell, setCell, type World } from "./world";

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
  full: 200,
  /** One bite in this many updates, when next to food and hungry. */
  biteEvery: 16,
  breedAt: 240,
  lifespan: 150,
  /** Updates between droppings. */
  dropEvery: 40,
};

/** Masses (creature eaters): a creeping clump of cells. */
const MASS = {
  start: 320,
  perUnit: 70,
  sense: 20,
  splitAt: 22,
  dropEvery: 24,
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
  return sp.diet === "plants" ? APHID : SLIME;
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

function edibleForBug(t: number): boolean {
  return t === LEAF || t === FLOWER || t === STEM || t === FEED;
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
    const j = i + W;
    if (i < W * (H - 1) && w.type[j] === EMPTY) moveCell(w, c, 0, j);
    return;
  }
  if (w.rng.below(2) !== 0) return;
  // Crawl to a neighbouring cell with something to hold on to, preferring food.
  let best = -1;
  let bestScore = -1;
  const start = w.rng.below(8);
  for (let k = 0; k < 8; k++) {
    const j = i + NEIGHBOURS[(start + k) & 7];
    if (!inGlass(j, i) || w.type[j] !== EMPTY || !supported(w, j, c.id)) continue;
    let score = 1;
    for (const d of NEIGHBOURS) {
      const n = j + d;
      if (inGlass(n, j) && edibleForBug(w.type[n])) score += 3;
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
      // more than three cells tall.
      if (j < W * (H - 1)) {
        const below = j + W;
        if (w.type[below] === EMPTY || w.type[below] === WATER) continue;
        if (w.org[below] === c.id && below + W < W * H && w.org[below + W] === c.id) continue;
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
  c.energy -= (c.age & 1) + (n >> 3);

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

  // Eat what it touches.
  for (let k = 0; k < c.cells.length; k++) {
    const i = c.cells[k];
    for (const d of [-1, 1, -W, W, -W - 1, -W + 1]) {
      const j = i + d;
      if (!inGlass(j, i)) continue;
      const t = w.type[j];
      if (t === FEED || (CREATURE_PART[t] && w.kind[j] !== c.species && w.org[j] !== c.id)) {
        eat(w, c, j, MASS.perUnit);
        k = c.cells.length;
        break;
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
    c.energy += 60;
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
    if (bx <= 1 || bx >= W - 2 || w.rng.below(60) === 0) c.dir = -c.dir;
  }

  // Grow if well fed, otherwise creep: the hindmost cell flows to the front.
  if (c.store >= 1 && c.energy > 160 + n * 10) {
    addCell(w, c, best, 1);
    c.store--;
    c.energy -= 60;
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
    else updateMass(w, c);
    if (c.dead) anyDead = true;
  }
  // A creature can also die while another one is being updated (eaten).
  if (anyDead || w.creatures.some((c) => c.dead)) w.creatures = w.creatures.filter((c) => !c.dead);
}
