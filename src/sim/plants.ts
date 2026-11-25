import { EMPTY, FEED, FLOWER, FUNGUS, LEAF, PLANT_PART, ROOT, SAND, SEED, SOIL, STEM, WASTE, WATER } from "./cells";
import type { PlantSpecies } from "./species";
import { H, TICKS_PER_SECOND, W } from "./dims";
import { clearCell, setCell, wake, WATER_UNITS, type World } from "./world";

/** A growing point: the end of a stem, branch or blade of grass. */
export interface Tip {
  i: number;
  /** Which way it leans: -1, 0 or 1. */
  dx: number;
  len: number;
  max: number;
  main: boolean;
  done: boolean;
}

export interface Plant {
  kind: "plant";
  id: number;
  species: number;
  /** Sugar from light. Growing a cell costs GROW_COST. */
  energy: number;
  water: number;
  /** Nutrient units taken up by the roots, not yet built into cells. */
  store: number;
  /** Updates in a row without enough water. */
  thirst: number;
  /** Plant updates since it sprouted. */
  age: number;
  base: number;
  /** Indices of the plant's cells. Cells that are gone are dropped lazily. */
  cells: number[];
  tips: Tip[];
  /** Most leaves and flowers the plant has had; it grows lost ones back up to these. */
  maxLeaves: number;
  maxFlowers: number;
  dead: boolean;
}

/** Plants are updated every PLANT_EVERY steps, spread over the steps by id. */
export const PLANT_EVERY = 4;
export const GROW_COST = 30;
/** A plant grows at most one cell every GROW_EVERY updates. */
const GROW_EVERY = 4;
/** Updates without water before a plant dies. Yellowing shows how close it is. */
export const THIRST_LIMIT = 90;
const SEED_ENERGY = 150;
/** Slow-pass checks (one every 4 steps) a seed waits before it can sprout. */
const SPROUT_AFTER = 25;
/** ...and before it rots if it never gets the chance. */
const SEED_ROTS_AFTER = 250;
const MAX_PLANTS = 80;
/** Slow-pass checks before uneaten feed rots (about a minute). */
const FEED_ROTS_AFTER = 150;
const MAX_STORE = 20;

function isGround(t: number): boolean {
  return t === SOIL || t === SAND;
}

/** Where seeds sprout and roots grow: soil, sand, and rotting waste (compost). */
function isBed(t: number): boolean {
  return t === SOIL || t === SAND || t === WASTE;
}

function newId(w: World): number {
  for (let n = 0; n < 65535; n++) {
    const id = w.nextOrgId;
    w.nextOrgId = id >= 65535 ? 1 : id + 1;
    if (!w.orgs.has(id)) return id;
  }
  return 0;
}

/** Builds one cell of the plant from a unit in its store. */
function place(w: World, p: Plant, i: number, type: number): boolean {
  if (p.store < 1) return false;
  const wet = type === ROOT ? w.wet[i] : 0;
  setCell(w, i, type);
  w.wet[i] = wet;
  w.org[i] = p.id;
  w.kind[i] = p.species;
  w.food[i] = 1;
  p.store--;
  p.cells.push(i);
  return true;
}

/** A root replaces a ground cell; the nutrients in that cell go to the plant. */
function rootInto(w: World, p: Plant, i: number): boolean {
  p.store += w.food[i];
  w.food[i] = 0;
  return place(w, p, i, ROOT);
}

function germinate(w: World, i: number): void {
  const id = newId(w);
  if (id === 0) return;
  const species = w.kind[i];
  const sp = w.plantSpecies[species];
  const p: Plant = {
    kind: "plant",
    id,
    species,
    energy: SEED_ENERGY,
    water: 0,
    store: w.food[i],
    thirst: 0,
    age: 0,
    base: i,
    cells: [],
    tips: [],
    maxLeaves: 0,
    maxFlowers: 0,
    dead: false,
  };
  clearCell(w, i);
  place(w, p, i, sp.form === "grass" ? LEAF : STEM);
  rootInto(w, p, i + W);
  p.tips.push({ i, dx: 0, len: 1, max: sp.height, main: true, done: false });
  w.plants.push(p);
  w.orgs.set(id, p);
}

/** Everything the plant is made of becomes waste; its store goes with it. */
function killPlant(w: World, p: Plant): void {
  p.dead = true;
  w.humidity += p.water;
  p.water = 0;
  w.orgs.delete(p.id);
  let first = -1;
  for (const i of p.cells) {
    if (w.org[i] !== p.id || !PLANT_PART[w.type[i]]) continue;
    w.type[i] = WASTE;
    w.org[i] = 0;
    wake(w, i);
    if (first < 0) first = i;
  }
  if (first >= 0) {
    let left = p.store;
    // A cell holds at most 255 units; put the rest in the next cells.
    for (const i of p.cells) {
      if (left === 0) break;
      if (w.type[i] !== WASTE) continue;
      const add = Math.min(left, 255 - w.food[i]);
      w.food[i] += add;
      left -= add;
    }
    p.store = left;
  }
}

function shootCap(sp: PlantSpecies): number {
  if (sp.form === "grass") return 4 + (2 + sp.branches * 2) * sp.height;
  if (sp.form === "flower") return sp.height * (2 + sp.leaves) + 8;
  return sp.height * (3 + sp.leaves * 2);
}

function growRoot(w: World, p: Plant, sp: PlantSpecies, roots: number[]): boolean {
  const baseY = (p.base / W) | 0;
  for (let attempt = 0; attempt < 3 && roots.length > 0; attempt++) {
    const r = roots[w.rng.below(roots.length)];
    const x = r % W;
    const y = (r / W) | 0;
    if (y + 1 - baseY > sp.rootDepth || y >= H - 1) continue;
    const side = w.rng.below(2) === 0 ? -1 : 1;
    const options = [r + W, r + W + side, r + W - side, r + side, r - side];
    for (let k = 0; k < options.length; k++) {
      const j = options[k];
      const jx = j % W;
      if (Math.abs(jx - x) > 1 || j >= W * H) continue;
      if (isBed(w.type[j])) return rootInto(w, p, j);
    }
  }
  return false;
}

/** A tip that reached its full length ends in a flower or seed head. */
function finishTip(w: World, p: Plant, sp: PlantSpecies, tip: Tip): void {
  tip.done = true;
  const x = tip.i % W;
  const y = (tip.i / W) | 0;
  if (y < 2) return;
  if (sp.form === "flower" && tip.main) {
    const spots = [tip.i - W, tip.i - 1, tip.i + 1, tip.i - W - 1, tip.i - W + 1, tip.i - 2 * W];
    for (const j of spots) {
      const jx = j % W;
      if (Math.abs(jx - x) <= 1 && w.type[j] === EMPTY && p.energy >= GROW_COST) {
        if (place(w, p, j, FLOWER)) p.energy -= GROW_COST;
      }
    }
  } else if (w.type[tip.i - W] === EMPTY && w.rng.below(sp.form === "grass" ? 2 : 3) === 0) {
    if (place(w, p, tip.i - W, FLOWER)) p.energy -= GROW_COST;
  }
}

function extendTip(w: World, p: Plant, sp: PlantSpecies, tip: Tip): boolean {
  if (tip.len >= tip.max) {
    finishTip(w, p, sp, tip);
    return true;
  }
  const x = tip.i % W;
  const y = (tip.i / W) | 0;
  let shift = 0;
  if (sp.form === "grass") shift = tip.len % 3 === 2 ? tip.dx : 0;
  else if (!tip.main) shift = tip.len % 2 === 0 ? tip.dx : 0;
  else if (w.rng.below(7) === 0) shift = w.rng.below(2) === 0 ? -1 : 1;
  const ny = y - 1;
  if (ny < 1) {
    tip.done = true;
    return false;
  }
  // Grow straight on if there is room, else try leaning round the obstacle.
  // A blocked tip is not given up: a drop of water or a seed may move away.
  let j = -1;
  for (const d of [shift, shift === 0 ? -1 : 0, shift === 0 ? 1 : -shift]) {
    const nx = x + d;
    if (nx < 0 || nx >= W) continue;
    if (w.type[ny * W + nx] === EMPTY) {
      j = ny * W + nx;
      break;
    }
  }
  if (j < 0) return false;
  const nx = j % W;
  if (!place(w, p, j, sp.form === "grass" ? LEAF : STEM)) return false;
  tip.i = j;
  tip.len++;
  // Leaves: on alternate sides of a flower stem, in clumps along a bush.
  if (sp.form === "flower" && tip.main && sp.leaves > 0 && tip.len % (5 - sp.leaves) === 0) {
    const s = ((tip.len / (5 - sp.leaves)) | 0) % 2 === 0 ? 1 : -1;
    for (const k of [j + s, j + 2 * s - W]) {
      if (Math.abs((k % W) - nx) <= 2 && w.type[k] === EMPTY) place(w, p, k, LEAF);
    }
  } else if (sp.form === "bush" && tip.len > 2) {
    const around = [j - 1, j + 1, j - W - tip.dx, j + W - 1, j + W + 1];
    for (let k = 0; k < sp.leaves; k++) {
      const c = around[w.rng.below(around.length)];
      if (Math.abs((c % W) - nx) <= 1 && c > W && w.type[c] === EMPTY) place(w, p, c, LEAF);
    }
  }
  // Branching.
  if (sp.form !== "grass" && sp.branches > 0 && tip.len >= 4 && w.rng.below(12) < sp.branches * (sp.form === "bush" ? 2 : 1)) {
    const remaining = tip.max - tip.len;
    if (remaining > 3) {
      p.tips.push({ i: j, dx: w.rng.below(2) === 0 ? -1 : 1, len: 0, max: Math.max(3, ((remaining * 7) / 10) | 0), main: false, done: false });
    }
  }
  return true;
}

/** Grass sends up new blades from beside its base. */
function newBlade(w: World, p: Plant, sp: PlantSpecies): boolean {
  const maxBlades = 2 + sp.branches * 2;
  if (p.tips.length >= maxBlades) return false;
  const bx = p.base % W;
  const by = (p.base / W) | 0;
  const offsets = [-1, 1, -2, 2, -3, 3, -4, 4];
  for (const off of offsets) {
    const x = bx + off;
    if (x < 0 || x >= W || by >= H - 1) continue;
    const i = by * W + x;
    const below = w.type[i + W];
    if (w.type[i] !== EMPTY || !(isBed(below) || below === ROOT)) continue;
    if (!place(w, p, i, LEAF)) return false;
    const max = Math.max(3, sp.height - Math.abs(off) - w.rng.below(3));
    p.tips.push({ i, dx: off < 0 ? -1 : 1, len: 1, max, main: false, done: false });
    return true;
  }
  return false;
}

function growShoot(w: World, p: Plant, sp: PlantSpecies): boolean {
  // Tips that were eaten are gone; if nothing is left, start again at the base.
  p.tips = p.tips.filter((tip) => w.org[tip.i] === p.id && PLANT_PART[w.type[tip.i]] === 1);
  if (p.tips.every((tip) => tip.done) && w.type[p.base] === EMPTY && place(w, p, p.base, sp.form === "grass" ? LEAF : STEM)) {
    p.tips.push({ i: p.base, dx: 0, len: 1, max: sp.height, main: true, done: false });
    return true;
  }
  if (sp.form === "grass" && w.rng.below(3) === 0 && newBlade(w, p, sp)) return true;
  const n = p.tips.length;
  for (let k = 0; k < n; k++) {
    const tip = p.tips[(p.age + k) % n];
    if (tip.done) continue;
    if (extendTip(w, p, sp, tip)) return true;
  }
  return sp.form === "grass" ? newBlade(w, p, sp) : false;
}

/** A plant that has lost its flowers flowers again at its highest point. */
function regrowFlower(w: World, p: Plant, from: number[]): boolean {
  let top = -1;
  for (const i of from) if (w.type[i] !== ROOT && (top < 0 || i < top)) top = i;
  if (top < W) return false;
  for (const j of [top - W, top - 1, top + 1]) {
    if (Math.abs((j % W) - (top % W)) > 1 || w.type[j] !== EMPTY) continue;
    return place(w, p, j, FLOWER);
  }
  return false;
}

/** A grown plant that has lost leaves (eaten) puts out new ones along its stems. */
function regrowLeaf(w: World, p: Plant, stems: number[]): boolean {
  for (let attempt = 0; attempt < 4 && stems.length > 0; attempt++) {
    const s = stems[w.rng.below(stems.length)];
    const side = w.rng.below(2) === 0 ? -1 : 1;
    for (const j of [s + side, s - side, s - W + side]) {
      if (j < W || Math.abs((j % W) - (s % W)) > 1 || w.type[j] !== EMPTY) continue;
      return place(w, p, j, LEAF);
    }
  }
  return false;
}

/** A flower lets a seed fall beside it. */
function dropSeed(w: World, p: Plant, flowers: number[]): void {
  const f = flowers[w.rng.below(flowers.length)];
  const x = (f % W) + w.rng.below(5) - 2;
  const y = (f / W) | 0;
  if (x < 0 || x >= W) return;
  const i = y * W + x;
  if (w.type[i] !== EMPTY) return;
  setCell(w, i, SEED);
  w.kind[i] = p.species;
  w.food[i] = 1;
  p.store--;
  p.energy -= GROW_COST * 2;
}

function updatePlant(w: World, p: Plant): void {
  const sp = w.plantSpecies[p.species];
  const { type, org, light, wet, food } = w;
  p.age++;

  // Look over the plant: drop cells that are gone, collect light and water.
  let green = 0;
  let leaves = 0;
  let income = 0;
  const roots: number[] = [];
  const stems: number[] = [];
  const flowers: number[] = [];
  const cells = p.cells;
  let n = 0;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k];
    const t = type[i];
    if (!PLANT_PART[t] || org[i] !== p.id) continue;
    cells[n++] = i;
    if (t === LEAF) {
      green++;
      leaves++;
      income += light[i] >> 6;
    } else if (t === STEM) {
      green++;
      stems.push(i);
      income += light[i] >> 7;
    } else if (t === ROOT) {
      roots.push(i);
      if (wet[i] > 12 && p.water < 30 + roots.length * 12) {
        const take = Math.min(4, wet[i] - 12);
        wet[i] -= take;
        p.water += take;
      }
    } else flowers.push(i);
  }
  cells.length = n;

  // Roots take nutrients from the ground around them.
  let taken = 0;
  for (let k = 0; k < roots.length && taken < 3 && p.store < MAX_STORE; k++) {
    const r = roots[k];
    const dir = (p.age + k) & 3;
    const j = dir === 0 ? r + W : dir === 1 ? r - 1 : dir === 2 ? r + 1 : r - W;
    if (j < 0 || j >= W * H || Math.abs((j % W) - (r % W)) > 1) continue;
    if (isBed(type[j]) && food[j] > 0) {
      food[j]--;
      p.store++;
      taken++;
      // Waste that has given up all it had is gone.
      if (food[j] === 0 && type[j] === WASTE) clearCell(w, j);
    }
  }

  // Living costs a little sugar, and leaves need water.
  p.energy += income - (n >> 4);
  // Leaves breathe water out into the air, where it will condense again.
  const need = 1 + (green >> 4);
  if (p.water >= need) {
    p.water -= need;
    w.humidity += need;
    if (p.thirst > 0) p.thirst--;
  } else {
    w.humidity += p.water;
    p.water = 0;
    p.thirst++;
  }
  if (p.energy > 2000) p.energy = 2000;

  // A plant grazed to the ground lives on in its roots while it has sugar
  // left to grow again.
  const old = p.age * PLANT_EVERY > sp.lifespan * TICKS_PER_SECOND;
  const bare = green + flowers.length === 0 && p.energy < GROW_COST;
  if (p.thirst > THIRST_LIMIT || old || roots.length === 0 || bare) {
    killPlant(w, p);
    return;
  }

  // Grow one cell every few updates: roots first while they lag behind,
  // then the shoot.
  if (p.age % GROW_EVERY !== 0 || p.thirst > 0 || p.energy < GROW_COST || p.store < 1) return;
  const wantRoots = Math.max(2, (n / 4) | 0);
  if (roots.length < wantRoots && growRoot(w, p, sp, roots)) {
    p.energy -= GROW_COST;
    return;
  }
  if (leaves > p.maxLeaves) p.maxLeaves = leaves;
  if (n - roots.length < shootCap(sp) && growShoot(w, p, sp)) {
    p.energy -= GROW_COST;
    return;
  }
  if (leaves < p.maxLeaves && regrowLeaf(w, p, stems)) {
    p.energy -= GROW_COST;
    return;
  }
  if (flowers.length > p.maxFlowers) p.maxFlowers = flowers.length;
  if (flowers.length < p.maxFlowers && regrowFlower(w, p, stems.length > 0 ? stems : cells)) {
    p.energy -= GROW_COST;
    return;
  }
  if (flowers.length > 0 && p.energy > GROW_COST * 4 && w.rng.below(10) === 0) dropSeed(w, p, flowers);
}

export function updatePlants(w: World): void {
  const plants = w.plants;
  let anyDead = false;
  for (let k = 0; k < plants.length; k++) {
    const p = plants[k];
    if ((p.id + w.tick) % PLANT_EVERY !== 0) continue;
    updatePlant(w, p);
    if (p.dead) anyDead = true;
  }
  if (anyDead) w.plants = plants.filter((p) => !p.dead);
}

/**
 * Every few steps: seeds sprout or rot, and waste slowly gives its nutrients
 * back to the ground it lies on.
 */
export function slowPass(w: World): void {
  const { type, wet, food } = w;
  for (let i = W; i < W * (H - 1); i++) {
    const t = type[i];
    if (t === SEED) {
      // A seed counts its age in its moisture slot.
      if (wet[i] < 255) wet[i]++;
      const below = i + W;
      const good = isBed(type[below]) && wet[below] > 40 && type[i - W] === EMPTY;
      if (good && wet[i] >= SPROUT_AFTER && w.plants.length < MAX_PLANTS) germinate(w, i);
      else if (wet[i] >= SEED_ROTS_AFTER) {
        type[i] = WASTE;
        wet[i] = 0;
      }
    } else if (t === FEED) {
      // Feed nobody eats goes off and turns to waste. Its age is in the moisture slot.
      if (wet[i] < 255) wet[i]++;
      if (wet[i] >= FEED_ROTS_AFTER) {
        type[i] = WASTE;
        wet[i] = 0;
      }
    } else if (t === WASTE) {
      // Moist waste catches fungus: from fungus next to it, or now and then
      // from spores in the air.
      if (wet[i] > 30) {
        const x = i % W;
        const nearFungus =
          type[i - W] === FUNGUS || type[i + W] === FUNGUS || (x > 0 && type[i - 1] === FUNGUS) || (x < W - 1 && type[i + 1] === FUNGUS);
        if (w.rng.below(nearFungus ? 12 : 2500) === 0) {
          type[i] = FUNGUS;
          wake(w, i);
          continue;
        }
      }
      if (w.rng.below(128) !== 0) continue;
      const x = i % W;
      const j = isGround(type[i + W]) ? i + W : x > 0 && isGround(type[i - 1]) ? i - 1 : x < W - 1 && isGround(type[i + 1]) ? i + 1 : -1;
      if (j < 0 || food[j] === 255) continue;
      if (food[i] > 0) {
        food[j]++;
        food[i]--;
      }
      if (food[i] === 0) clearCell(w, i);
    } else if (t === FUNGUS) {
      // Fungus feeds the soil next to it, much faster than waste rots alone.
      const x = i % W;
      if (w.rng.below(5) === 0 && food[i] > 0) {
        let j = isGround(type[i + W]) ? i + W : x > 0 && isGround(type[i - 1]) ? i - 1 : x < W - 1 && isGround(type[i + 1]) ? i + 1 : -1;
        // A mushroom with no soil next to it sends what it has down its stem.
        if (j < 0 && (type[i + W] === FUNGUS || type[i + W] === WASTE)) j = i + W;
        if (j >= 0 && food[j] < 255) {
          food[j]++;
          food[i]--;
        }
      }
      // It puts up a little mushroom where there is room above.
      if (food[i] >= 2 && i >= 2 * W && type[i - W] === EMPTY && type[i - 2 * W] === EMPTY && w.rng.below(30) === 0) {
        setCell(w, i - W, FUNGUS);
        food[i - W] = 1;
        food[i]--;
      }
      if (food[i] === 0) clearCell(w, i);
    } else if (t === WATER && type[i - W] === EMPTY && w.rng.below(1500) === 0) {
      // Open water slowly evaporates into the air.
      clearCell(w, i);
      w.humidity += WATER_UNITS;
    }
  }
}
