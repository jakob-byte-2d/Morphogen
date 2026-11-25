import { CREATURE_PART, EMPTY, FEED, ISOPOD, PLANT_PART, POWDER, ROOT, SAND, SLIME, SOIL, WASTE, WATER } from "./cells";
import type { CreatureSpecies } from "./species";
import { AREA, H, SCALE, TICKS_PER_SECOND, W } from "./dims";
import { creatureGenesOf, inheritCreature, upkeep, type CreatureGenes } from "./genes";
import { clearCell, newOrgId, setCell, swapCells, type World } from "./world";

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
const MAX_CREATURES = 250;
/** Skrukketroll stop breeding this far short of the limit, so there is always room for others. */
const ROOM_FOR_OTHERS = 50;

/** Skrukketroll (litter eaters): one cell each, living on the ground. */
const BUG = {
  start: 120,
  /** About how long one lives, in seconds (give or take a fifth). */
  lifespan: 480,
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
/** Masses: energy per unit eaten, and how eagerly they grow (in thirds of the usual). */
const MASS_PER_UNIT = [84, 77, 70, 63, 56];
const MASS_GROW_AT = [5, 4, 3, 2, 1];

/** A skrukketroll breeds at this energy and gives the young this much (more for big ones). */
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
  sense: 16 * SCALE,
  /** Tallest a mass can heap up. */
  height: 3 * SCALE,
  dropEvery: 24,
  dropUnits: 3,
  /** About how long a mass lives, in seconds (give or take a fifth). */
  lifespan: 1200,
  /** Energy to grow (and given back by losing) one cell. */
  cellCost: (60 / AREA) | 0,
};

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

/** About how long a creature lives, in updates: give or take a fifth, so they do not all die at once. */
function lifespanOf(c: Creature, seconds: number): number {
  return ((seconds * TICKS_PER_SECOND * (80 + (c.id % 41))) / 100 / CREATURE_EVERY) | 0;
}


function cellType(sp: CreatureSpecies): number {
  return sp.diet === "litter" ? ISOPOD : SLIME;
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
 * Lets a creature go at (cx, cy): it lands on the ground below. Litter
 * eaters come as a little group, creature eaters as a small mass.
 */
export function releaseCreature(w: World, cx: number, cy: number, species: number): void {
  if (cx < 0 || cx >= W || cy < 0 || cy >= H) return;
  const sp = w.creatureSpecies[Math.min(species, w.creatureSpecies.length - 1)];
  const k = w.creatureSpecies.indexOf(sp);
  // Over water, or over a plant? Let it go on the nearest bare ground instead.
  for (let d = 0; d < W; d++) {
    const x = cx + (d % 2 === 0 ? d >> 1 : -((d + 1) >> 1));
    if (x < 0 || x >= W) continue;
    const i = landing(w, x, cy);
    if (i >= 0 && !(i < W * (H - 1) && PLANT_PART[w.type[i + W]])) {
      cx = x;
      break;
    }
  }
  let y = cy;
  while (y < H - 1 && w.type[(y + 1) * W + cx] === EMPTY) y++;
  if (w.type[y * W + cx] !== EMPTY) return;
  if (sp.diet === "litter") {
    for (const dx of [0, -2 * SCALE, 2 * SCALE]) {
      const x = cx + dx;
      if (x < 0 || x >= W) continue;
      const i = landing(w, x, cy);
      if (i >= 0 && !(i < W * (H - 1) && PLANT_PART[w.type[i + W]])) spawnCreature(w, k, [i], BUG.start);
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
 * Eats cell j. Half of what it eats is burnt for energy (breathed out, and
 * gone from the glass); the rest goes into its store, to come out as
 * droppings. If j belonged to another creature, that creature loses the
 * cell, and if it was its last, what it had eaten goes along.
 */
function eat(w: World, c: Creature, j: number, perUnit: number): void {
  const victim = w.org[j] ? w.orgs.get(w.org[j]) : undefined;
  let units = w.food[j];
  w.food[j] = 0;
  clearCell(w, j);
  if (victim && victim.kind === "creature" && victim !== c) {
    victim.cells = victim.cells.filter((i) => i !== j);
    if (victim.cells.length === 0) {
      units += victim.store;
      victim.store = 0;
      victim.dead = true;
      w.orgs.delete(victim.id);
    }
  }
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
  if (c.energy <= 0 || c.age > lifespanOf(c, BUG.lifespan)) {
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
  // Breed: a new one beside it, made from one unit of what it has eaten.
  if (c.energy >= breedAt && c.store >= 1 && w.creatures.length < MAX_CREATURES - ROOM_FOR_OTHERS) {
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
  // Fall if there is nothing to hold on to, straight through any plant.
  if (!supported(w, i, c.id)) {
    for (let k = 0; k < SCALE; k++) {
      const at = c.cells[0];
      let j = at + W;
      while (j < W * H && PLANT_PART[w.type[j]] && w.type[j] !== ROOT) j += W;
      if (j >= W * H || w.type[j] !== EMPTY) break;
      moveCell(w, c, 0, j);
    }
    return;
  }
  // Hungry, with nothing to eat right here: now and then it sniffs out the
  // nearest fallen leaves and heads that way. Otherwise it wanders.
  let target = -1;
  if (c.energy < BUG.full >> 1 && (c.age & 3) === 0) {
    let here = false;
    for (const d of NEIGHBOURS) if (inGlass(i + d, i) && edibleForBug(w.type[i + d])) here = true;
    if (!here) target = nearestFood(w, i);
  }
  for (let k = moves(w, g); k > 0; k--) crawlBug(w, c, target);
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
 * if it can, towards the nearest food it can sense if not, away from slime,
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
 * Creature cell number k moves to j. If j holds a dead leaf, the two swap:
 * the mass pushes its way through the litter.
 */
function creep(w: World, c: Creature, k: number, j: number): void {
  if (w.type[j] === EMPTY) moveCell(w, c, k, j);
  else {
    swapCells(w, c.cells[k], j);
    c.cells[k] = j;
  }
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
    if (front.length > 0) creep(w, c, k, front[0]);
  }
}

/**
 * Cells next to the mass where it can creep (or, if empty, grow) to: empty
 * cells, and dead leaves, which it pushes past (see creep).
 */
function frontier(w: World, c: Creature): number[] {
  const out: number[] = [];
  for (const i of c.cells) {
    for (const d of [-1, 1, -W, W]) {
      let j = i + d;
      if (!inGlass(j, i)) continue;
      // It flows on between plant stems.
      if ((d === -1 || d === 1) && PLANT_PART[w.type[j]]) j = pastPlant(w, i, d);
      if (j < 0 || (w.type[j] !== EMPTY && w.type[j] !== WASTE) || out.includes(j)) continue;
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

/**
 * A mass with nothing under it slumps down one cell. Loose things lying
 * on part of it (a dead leaf, feed) do not hold it up.
 */
function slump(w: World, c: Creature): boolean {
  for (const i of c.cells) {
    let j = i + W;
    while (j < W * H && POWDER[w.type[j]]) j += W;
    if (j >= W * H) return false;
    const t = w.type[j];
    if (t !== EMPTY && t !== WATER && w.org[j] !== c.id) return false;
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
  // Old: it dies, and what is left of it is food for the skrukketroll.
  if (c.age > lifespanOf(c, MASS.lifespan)) {
    killCreature(w, c);
    return;
  }

  // It eats other creatures (and feed), nothing else.
  const food = (j: number) => {
    const t = w.type[j];
    return t === FEED || (CREATURE_PART[t] && w.kind[j] !== c.species && w.org[j] !== c.id);
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
      if (!food(y * W + x)) continue;
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
      if (!food(j)) continue;
      eat(w, c, j, MASS_PER_UNIT[g.growth - 1]);
      if (++bites >= SCALE) break;
    }
  }

  if (c.age % MASS.dropEvery === 0 && c.store > MASS.dropUnits) drop(w, c, c.cells[w.rng.below(c.cells.length)], MASS.dropUnits);

  // Starving: lose a cell (it becomes dead matter). The last cell: dead.
  if (c.energy < 0) {
    if (c.cells.length === 1) {
      killCreature(w, c);
      return;
    }
    const k = w.rng.below(c.cells.length);
    const i = c.cells[k];
    w.type[i] = WASTE;
    w.org[i] = 0;
    w.kind[i] = 0;
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
      if (w.type[to] !== EMPTY) break;
      addCell(w, c, to, 1);
      c.store--;
      c.energy -= MASS.cellCost;
    }
  } else if (n === 1) {
    if (w.rng.below(9) < g.speed) creep(w, c, 0, best);
  } else {
    // A bigger mass moves more cells at a time, so it is not slower. It
    // hurries towards prey, and roams slowly when it has nothing to go for.
    const steps = tx >= 0 ? (((1 + (n >> 2)) * g.speed) / 3) | 0 : w.rng.below(3) < g.speed ? 1 : 0;
    for (let m = 0; m < steps; m++) {
      const options = m === 0 ? front : frontier(w, c);
      if (options.length === 0) break;
      let to = options[0];
      for (const j of options) if (score(j) > score(to)) to = j;
      let back = 0;
      for (let k = 1; k < c.cells.length; k++) if (score(c.cells[k]) < score(c.cells[back])) back = k;
      if (score(to) <= score(c.cells[back])) break;
      creep(w, c, back, to);
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
    if (sp.diet === "litter") updateBug(w, c);
    else updateMass(w, c);
    if (c.dead) anyDead = true;
  }
  // A creature can also die while another one is being updated (eaten).
  if (anyDead || w.creatures.some((c) => c.dead)) w.creatures = w.creatures.filter((c) => !c.dead);
}
