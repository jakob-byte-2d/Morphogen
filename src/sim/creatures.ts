import { APHID, CREATURE_PART, EMPTY, FEED, LEAF, PLANT_PART, ROOT, SLIME, STEM, WASTE, WATER } from "./cells";
import type { CreatureSpecies } from "./species";
import { AREA, H, SCALE, TICKS_PER_SECOND, W } from "./dims";
import { creatureGenesOf, inheritCreature, upkeep, type CreatureGenes } from "./genes";
import { clearCell, newOrgId, setCell, type World } from "./world";

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
  genes: CreatureGenes;
  dead: boolean;
}

/** Creatures are updated every CREATURE_EVERY steps, spread over the steps by id. */
export const CREATURE_EVERY = 2;
const MAX_CREATURES = 160;

/** Bugs (plant eaters): one cell each. */
const BUG = {
  start: 120,
  lifespan: 480,
  /** Breeding needs fewer than `crowd` other bugs within this many cells. */
  crowdRadius: 4 * SCALE,
  crowd: 4,
  /** Leaves in the glass it takes to feed one more bug. */
  leavesEach: 15,
  /** How far a hungry bug can sense leaves. */
  sense: 8 * SCALE,
  /** Updates between droppings. */
  dropEvery: 40,
};

/*
 * What the genes do, as tables by trait value (1–5; 3 is the middle).
 * Growth: fast growers eat (and grow) faster but get less out of each meal.
 * Size: how big a creature gets before it breeds or splits.
 */
/** Bugs: one bite in this many updates, and energy per unit eaten. */
const BUG_BITE_EVERY = [40, 32, 24, 18, 12];
const BUG_PER_UNIT = [62, 56, 50, 44, 38];
/** Masses: energy per unit eaten, and how eagerly they grow (in thirds of the usual). */
const MASS_PER_UNIT = [84, 77, 70, 63, 56];
const MASS_GROW_AT = [5, 4, 3, 2, 1];

/** A bug breeds at this energy and gives the young this much (more for big ones). */
function bugBreedAt(g: CreatureGenes): number {
  return 140 + 40 * g.size;
}
function bugYoung(g: CreatureGenes): number {
  return 40 + 20 * g.size;
}

/**
 * Speed: tries per update to move, each coming off one time in three. Speed
 * 3 moves about as far as a creature always did; it costs energy (see upkeep).
 */
function moves(w: World, g: CreatureGenes): number {
  let n = 0;
  for (let k = 0; k < g.speed; k++) if (w.rng.below(3) === 0) n++;
  return n;
}

/** Masses (creature eaters): a creeping clump of cells. */
const MASS = {
  start: 320,
  sense: 12 * SCALE,
  /** Tallest a mass can heap up. */
  height: 3 * SCALE,
  dropEvery: 24,
  /** Energy to grow (and given back by losing) one cell. */
  cellCost: (60 / AREA) | 0,
  /** Below this energy it eats waste too, for this much energy per unit. */
  scavengeBelow: 200,
  perWaste: 40,
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

/**
 * Starts a new creature in the given empty cells; the units come with it.
 * Without genes it gets its species' own.
 */
export function spawnCreature(w: World, species: number, at: number[], energy: number, genes?: CreatureGenes): Creature | null {
  if (w.creatures.length >= MAX_CREATURES) return null;
  const id = newOrgId(w);
  if (id === 0) return null;
  const g = genes ?? creatureGenesOf(w.creatureSpecies[species]);
  const c: Creature = { kind: "creature", id, species, energy, store: 0, age: 0, cells: [], dir: w.rng.below(2) === 0 ? -1 : 1, genes: g, dead: false };
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

/**
 * Lets a creature go at (cx, cy): it lands on whatever is below. Plant
 * eaters come as a little group, creature eaters as a small mass.
 */
export function releaseCreature(w: World, cx: number, cy: number, species: number): void {
  if (cx < 0 || cx >= W || cy < 0 || cy >= H) return;
  const sp = w.creatureSpecies[Math.min(species, w.creatureSpecies.length - 1)];
  const k = w.creatureSpecies.indexOf(sp);
  // Over water? Let it go on the nearest dry spot instead. A mass, which
  // cannot climb, goes on the nearest bare ground, not on top of a plant.
  const ground = sp.diet !== "plants";
  for (let d = 0; d < W; d++) {
    const x = cx + (d % 2 === 0 ? d >> 1 : -((d + 1) >> 1));
    if (x < 0 || x >= W) continue;
    const i = landing(w, x, cy);
    if (i >= 0 && !(ground && i < W * (H - 1) && PLANT_PART[w.type[i + W]])) {
      cx = x;
      break;
    }
  }
  let y = cy;
  while (y < H - 1 && w.type[(y + 1) * W + cx] === EMPTY) y++;
  if (w.type[y * W + cx] !== EMPTY) return;
  if (sp.diet === "plants") {
    for (const dx of [0, -2 * SCALE, 2 * SCALE]) {
      const x = cx + dx;
      if (x < 0 || x >= W) continue;
      let yy = cy;
      while (yy < H - 1 && w.type[(yy + 1) * W + x] === EMPTY) yy++;
      const i = yy * W + x;
      if (w.type[i] === EMPTY) spawnCreature(w, k, [i], 120);
    }
  } else {
    // A small low mound: each cell of the shape is SCALE × SCALE cells.
    const cells: number[] = [];
    for (const [ux, uy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]])
      for (let a = 0; a < SCALE; a++)
        for (let b = 0; b < SCALE; b++) {
          const x = cx + ux * SCALE + a;
          const yy = y + uy * SCALE - b;
          if (x < 0 || x >= W || yy < 0) continue;
          const i = yy * W + x;
          if (w.type[i] === EMPTY) cells.push(i);
        }
    if (cells.length > 0) spawnCreature(w, k, cells, 320);
  }
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
    w.kind[i] = 0;
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
/** Bugs eat leaves and feed. They leave the flowers be, so plants can set seed. */
function edibleForBug(t: number): boolean {
  return t === LEAF || t === FEED;
}


/**
 * Room to breed: not too many other bugs close by, and no more bugs in the
 * glass than its leaves can feed. This keeps bugs from eating their plants
 * bare and then all starving together.
 */
function roomToBreed(w: World, i: number, species: number): boolean {
  const r = BUG.crowdRadius;
  const x0 = i % W;
  const y0 = (i / W) | 0;
  let others = 0;
  for (let y = Math.max(0, y0 - r); y <= Math.min(H - 1, y0 + r); y++) {
    for (let x = Math.max(0, x0 - r); x <= Math.min(W - 1, x0 + r); x++) {
      const j = y * W + x;
      if (j !== i && w.type[j] === APHID && w.kind[j] === species) others++;
    }
  }
  if (others >= BUG.crowd) return false;
  let bugs = 0;
  for (const c of w.creatures) if (c.species === species) bugs++;
  return bugs * BUG.leavesEach < w.leaves;
}

/** How long a bug lives: about BUG.lifespan, give or take a fifth, so they do not all die at once. */
function bugLifespan(c: Creature): number {
  return ((BUG.lifespan * TICKS_PER_SECOND * (80 + (c.id % 41))) / 100) | 0;
}

/** A plant eater: one speck that crawls over plants and ground, eats and breeds. */
function updateBug(w: World, c: Creature): void {
  const i = c.cells[0];
  const g = c.genes;
  // A bug lives frugally: half a unit of energy per update, at speed 3.
  c.energy -= upkeep(c.age & 1, g.speed, c.age >> 1);
  if (c.energy <= 0 || c.age * CREATURE_EVERY > bugLifespan(c)) {
    killCreature(w, c);
    return;
  }
  const breedAt = bugBreedAt(g);
  // Eat something next to it, if hungry.
  if (c.energy < breedAt + 80 && w.rng.below(BUG_BITE_EVERY[g.growth - 1]) === 0) {
    const start = w.rng.below(8);
    for (let k = 0; k < 8; k++) {
      const j = i + NEIGHBOURS[(start + k) & 7];
      if (inGlass(j, i) && edibleForBug(w.type[j])) {
        eat(w, c, j, BUG_PER_UNIT[g.growth - 1]);
        return;
      }
    }
  }
  if (c.age % BUG.dropEvery === 0 && c.store > 2) drop(w, c, i);
  // Breed: a new bug beside it, made from one unit of what it has eaten.
  if (c.energy >= breedAt && c.store >= 1 && roomToBreed(w, i, c.species)) {
    for (const d of NEIGHBOURS) {
      const j = i + d;
      if (!inGlass(j, i) || w.type[j] !== EMPTY || !supported(w, j, 0)) continue;
      const young = bugYoung(g);
      const child = spawnCreature(w, c.species, [], young, inheritCreature(w, g));
      if (!child) break;
      addCell(w, child, j, 1);
      c.store--;
      c.energy -= young + 40;
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
  // Nothing to eat right here: head for the nearest leaves.
  let hungryHere = true;
  for (const d of NEIGHBOURS) if (inGlass(i + d, i) && edibleForBug(w.type[i + d])) hungryHere = false;
  const target = hungryHere ? nearestFood(w, i) : -1;
  for (let k = moves(w, g); k > 0; k--) crawlBug(w, c, target);
}

/** The nearest leaf (or feed) a bug can sense from i, or -1. */
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
 * Crawl to a neighbouring cell with something to hold on to: next to leaves
 * if it can, towards the nearest leaves it can sense if not, and away from
 * other bugs, so they spread out over the plants.
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
    const j = i + NEIGHBOURS[(start + k) & 7];
    if (!inGlass(j, i) || w.type[j] !== EMPTY || !supported(w, j, c.id)) continue;
    let score = 0;
    for (const d of NEIGHBOURS) {
      const n = j + d;
      if (!inGlass(n, j)) continue;
      const t = w.type[n];
      if (edibleForBug(t)) score += 3;
      else if (t === STEM) score += 1;
      else if (t === APHID && w.org[n] !== c.id) score -= 2;
      // Keep away from slime.
      else if (t === SLIME) score -= 12;
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

/**
 * A mass does not lie on plants: any part of it resting on one falls on
 * through the plant, or else creeps out onto the ground beside it.
 */
function offPlants(w: World, c: Creature): void {
  for (let k = 0; k < c.cells.length; k++) {
    const i = c.cells[k];
    let j = i + W;
    if (j >= W * H || !PLANT_PART[w.type[j]] || w.type[j] === ROOT) continue;
    while (j < W * H && PLANT_PART[w.type[j]] && w.type[j] !== ROOT) j += W;
    if (j < W * H && w.type[j] === EMPTY) {
      moveCell(w, c, k, j);
      continue;
    }
    const front = frontier(w, c);
    if (front.length > 0) moveCell(w, c, k, front[0]);
  }
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
  offPlants(w, c);
  if (slump(w, c)) return;
  const n = c.cells.length;
  const g = c.genes;
  c.energy -= upkeep((c.age & 1) + ((n / (8 * AREA)) | 0), g.speed, c.age);

  // A hungry mass also takes waste: enough to get by on, not to grow on.
  const hungry = c.energy < MASS.scavengeBelow;
  const food = (j: number) => {
    const t = w.type[j];
    if (t === FEED || (CREATURE_PART[t] && w.kind[j] !== c.species && w.org[j] !== c.id)) return 1;
    return hungry && t === WASTE ? 2 : 0;
  };

  // Where are we, and is there anything to go for?
  let sx = 0;
  let sy = 0;
  let base = 0;
  for (const i of c.cells) {
    sx += i % W;
    sy += (i / W) | 0;
    base = Math.max(base, (i / W) | 0);
  }
  // It cannot climb, so anything higher up than it can heap itself is out of reach.
  const reach = base - MASS.height;
  const cx = (sx / n) | 0;
  const cy = (sy / n) | 0;
  let tx = -1;
  let ty = -1;
  let bestD = 1e9;
  const r = MASS.sense;
  for (let y = Math.max(0, cy - r, reach); y <= Math.min(H - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
      const kind = food(y * W + x);
      if (kind === 0) continue;
      // Waste counts as four times as far as prey: it goes for prey first.
      const d = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) * (kind === 1 ? 1 : 4);
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
      const kind = food(j);
      if (kind === 0) continue;
      eat(w, c, j, kind === 1 ? MASS_PER_UNIT[g.growth - 1] : MASS.perWaste);
      if (++bites >= SCALE) break;
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
  const growAt = (((160 + (((n * 10) / AREA) | 0)) * MASS_GROW_AT[g.growth - 1]) / 3) | 0;
  if (c.store >= 1 && c.energy > growAt) {
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
    if (w.rng.below(9) < g.speed) moveCell(w, c, 0, best);
  } else {
    // A bigger mass moves more cells at a time, so it is not slower. It
    // hurries towards prey and dawdles when it has nothing to go for.
    const steps = tx >= 0 ? (((1 + (n >> 2)) * g.speed) / 3) | 0 : w.rng.below(9) < g.speed ? 1 : 0;
    for (let m = 0; m < steps; m++) {
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
  if (c.cells.length >= (7 + 5 * g.size) * AREA) {
    const sorted = [...c.cells].sort((a, b) => (a % W) - (b % W) || a - b);
    const half = sorted.slice(0, sorted.length >> 1);
    const other = spawnCreature(w, c.species, [], c.energy >> 1, inheritCreature(w, g));
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
