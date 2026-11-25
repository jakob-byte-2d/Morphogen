import { CREATURE_PART, EMPTY, FEED, FLOWER, LEAF, PLANT_PART, ROOT, SAND, SEED, SOIL, STEM, WASTE, WATER } from "./cells";
import type { PlantSpecies } from "./species";
import { H, SCALE, W } from "./dims";
import { inheritPlant, packSeed, plantGenesOf, unpackSeed, type PlantGenes } from "./genes";
import { clearCell, newOrgId, setCell, wake, WATER_UNITS, type World } from "./world";

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

/**
 * A plant lives as long as it has water and light: it keeps growing new
 * shoots, sheds old leaves and flowers (they fall as litter), and seeds.
 */
export interface Plant {
  kind: "plant";
  id: number;
  species: number;
  /** Sugar from light. Growing a cell costs about GROW_COST (see cellCost). */
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
  genes: PlantGenes;
  dead: boolean;
}

/** Plants are updated every PLANT_EVERY steps, spread over the steps by id. */
export const PLANT_EVERY = 4;
export const GROW_COST = 30;
/**
 * By the growth gene: updates between growing, and energy per cell. Fast
 * growth costs more per cell.
 */
const GROW_EVERY = [8, 6, 4, 3, 2];
const CELL_COST = [24, 27, 30, 36, 42];
/**
 * By the seed gene: energy a seed starts with, what it costs the parent, and
 * one seed in this many updates. Big seeds give strong seedlings, but few.
 */
const SEED_ENERGY = [60, 100, 150, 220, 300];
const SEED_COST = [25, 40, 60, 90, 130];
const SEED_EVERY = [4, 6, 10, 15, 22];
/** Updates without water before a plant dies. Yellowing shows how close it is. */
export const THIRST_LIMIT = 90;
/** Slow-pass checks (one every 4 steps) a seed waits before it can sprout. */
const SPROUT_AFTER = 25;
/** ...and before it rots if it never gets the chance. */
const SEED_ROTS_AFTER = 250;
const MAX_PLANTS = 80;
/** Slow-pass checks before uneaten feed rots (about a minute). */
const FEED_ROTS_AFTER = 150;
const MAX_STORE = 20 * SCALE;
/** A plant this far in debt for sugar (too much shade) dies. */
const STARVES_AT = -500;
/** Most growing tips a flower or bush has at once. */
const MAX_TIPS = 6;
/**
 * Leaves and flowers count their age in the moisture slot (they hold no
 * water) and fall off when it reaches 255. A leaf in the light gains one
 * every other update (about three and a half minutes); one in the shade
 * or on a thirsty plant ages faster. Grass blades do not age.
 */
const SHADE = 64;
/** Slow-pass checks before a dead leaf nobody eats has rotted (about ten minutes). */
const LITTER_ROTS = 1500;
/** Moist soil at the surface gives this much water to the air at a time, down to SOIL_DRIES_TO. */
const SOIL_BREATH = 8;
const SOIL_DRIES_TO = 60;

function isGround(t: number): boolean {
  return t === SOIL || t === SAND;
}

/** Where seeds sprout and roots grow: soil, sand, and rotting waste (compost). */
function isBed(t: number): boolean {
  return t === SOIL || t === SAND || t === WASTE;
}

function cellCost(p: Plant): number {
  return CELL_COST[p.genes.growth - 1];
}

/**
 * Builds one cell of the plant: one unit from its store (from the soil) and
 * two made from light and air (photosynthesis), so plants add to the glass.
 * A root is made from sugar alone (one unit from light and air), so a plant
 * can always reach for new ground; it takes up what that ground holds.
 */
function place(w: World, p: Plant, i: number, type: number): boolean {
  const root = type === ROOT;
  if (!root && p.store < 1) return false;
  const wet = type === ROOT ? w.wet[i] : 0;
  setCell(w, i, type);
  // Leaves and flowers start at a slightly different age each, so they do
  // not all fall at once. Grass blades never fall.
  const ages = type === FLOWER || (type === LEAF && w.plantSpecies[p.species].form !== "grass");
  w.wet[i] = ages ? 1 + (w.shade[i] & 31) : wet;
  w.org[i] = p.id;
  w.kind[i] = p.species;
  w.food[i] = root ? 1 : 3;
  w.fixed += root ? 1 : 2;
  if (!root) p.store--;
  p.cells.push(i);
  return true;
}

/** A leaf or flower that has had its time falls off as litter, with what it is made of. */
function shed(w: World, i: number): void {
  w.type[i] = WASTE;
  w.wet[i] = 0;
  w.org[i] = 0;
  w.kind[i] = 0;
  wake(w, i);
}

/** A root replaces a ground cell; the nutrients in that cell go to the plant. */
function rootInto(w: World, p: Plant, i: number): boolean {
  p.store += w.food[i];
  w.food[i] = 0;
  return place(w, p, i, ROOT);
}

function germinate(w: World, i: number): void {
  const id = newOrgId(w);
  if (id === 0) return;
  const species = w.kind[i];
  const sp = w.plantSpecies[species];
  const genes = unpackSeed(w.org[i], plantGenesOf(sp));
  const p: Plant = {
    kind: "plant",
    id,
    species,
    energy: SEED_ENERGY[genes.seed - 1],
    water: 0,
    store: w.food[i],
    thirst: 0,
    age: 0,
    base: i,
    cells: [],
    tips: [],
    maxLeaves: 0,
    maxFlowers: 0,
    genes,
    dead: false,
  };
  clearCell(w, i);
  place(w, p, i, sp.form === "grass" ? LEAF : STEM);
  rootInto(w, p, i + W);
  p.tips.push({ i, dx: 0, len: 1, max: sp.height * SCALE, main: true, done: false });
  w.plants.push(p);
  w.orgs.set(id, p);
}

/**
 * What the plant is made of becomes litter above ground; its roots, which
 * grew where there was soil, turn back into soil. Its store goes with them.
 */
function killPlant(w: World, p: Plant): void {
  p.dead = true;
  w.humidity += p.water;
  p.water = 0;
  w.orgs.delete(p.id);
  const left: number[] = [];
  for (const i of p.cells) {
    if (w.org[i] !== p.id || !PLANT_PART[w.type[i]]) continue;
    // A root keeps its moisture as soil; a leaf's slot held its age, not water.
    if (w.type[i] !== ROOT) w.wet[i] = 0;
    w.type[i] = w.type[i] === ROOT ? SOIL : WASTE;
    w.org[i] = 0;
    w.kind[i] = 0;
    wake(w, i);
    left.push(i);
  }
  // A cell holds at most 255 units; put the rest in the next cells, and
  // anything still left into the ground below where it grew.
  for (const i of left) {
    if (p.store === 0) break;
    const add = Math.min(p.store, 255 - w.food[i]);
    w.food[i] += add;
    p.store -= add;
  }
  for (let j = p.base; j < W * H && p.store > 0; j += W) {
    if (!isBed(w.type[j])) continue;
    const add = Math.min(p.store, 255 - w.food[j]);
    w.food[j] += add;
    p.store -= add;
  }
}

function growRoot(w: World, p: Plant, sp: PlantSpecies, roots: number[]): boolean {
  const baseY = (p.base / W) | 0;
  for (let attempt = 0; attempt < 3 && roots.length > 0; attempt++) {
    const r = roots[w.rng.below(roots.length)];
    const x = r % W;
    const y = (r / W) | 0;
    if (y + 1 - baseY > sp.rootDepth * SCALE || y >= H - 1) continue;
    const side = w.rng.below(2) === 0 ? -1 : 1;
    // Near the surface roots only go down, so the ground stays open for seeds.
    const options = y - baseY < 2 * SCALE ? [r + W] : [r + W, r + W + side, r + W - side, r + side, r - side];
    for (let k = 0; k < options.length; k++) {
      const j = options[k];
      const jx = j % W;
      if (Math.abs(jx - x) > 1 || j >= W * H) continue;
      // Roots grow through soil and sand (not litter: a dead root becomes
      // soil, and the ground should not grow out of rubbish). They stay thin:
      // a root does not grow up against another one.
      if (isGround(w.type[j]) && !crowded(w, j, r)) return rootInto(w, p, j);
    }
  }
  return false;
}

const AROUND = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];

/** Is there a root around cell j, other than `from` (the root it grows from) and those next to that? */
function crowded(w: World, j: number, from: number): boolean {
  const x = j % W;
  const fx = from % W;
  for (const d of AROUND) {
    const n = j + d;
    if (n < 0 || n >= W * H || Math.abs((n % W) - x) > 1 || w.type[n] !== ROOT) continue;
    // The root it grows from, and the cell that root grew from, may touch it.
    if (n === from || (Math.abs((n % W) - fx) <= 1 && Math.abs(((n / W) | 0) - ((from / W) | 0)) <= 1 && n < from)) continue;
    return true;
  }
  return false;
}

/** Cells of a flower head, relative to the tip it sits on: a disc above it. */
const BLOSSOM: [number, number][] = [];
for (let dy = -2 * SCALE; dy <= 0; dy++)
  for (let dx = -SCALE; dx <= SCALE; dx++) {
    const ry = dy + SCALE;
    if (dx * dx + ry * ry <= SCALE * SCALE + 1 && !(dx === 0 && dy === 0)) BLOSSOM.push([dx, dy]);
  }

/** A tip that reached its full length ends in a flower or seed head. */
function finishTip(w: World, p: Plant, sp: PlantSpecies, tip: Tip): void {
  tip.done = true;
  const x = tip.i % W;
  const y = (tip.i / W) | 0;
  if (y < 2) return;
  if (sp.form === "flower" && tip.main) {
    // A round flower head sitting on the tip.
    for (const [dx, dy] of BLOSSOM) {
      const j = tip.i + dy * W + dx;
      if (x + dx < 0 || x + dx >= W || j < 0) continue;
      if (w.type[j] === EMPTY && p.energy >= cellCost(p)) {
        if (place(w, p, j, FLOWER)) p.energy -= cellCost(p);
      }
    }
  } else if (w.rng.below(sp.form === "grass" ? 2 : 3) === 0) {
    // A small seed head.
    for (let k = 1; k <= SCALE; k++) {
      const j = tip.i - k * W;
      if (j < 0 || w.type[j] !== EMPTY || p.energy < cellCost(p) || !place(w, p, j, FLOWER)) break;
      p.energy -= cellCost(p);
    }
  }
}

/** A leaf on a flower stem, pointing out and up to the side s = 1. */
const LEAF_SHAPE: [number, number][] = (
  [[1, 0], [2, 0], [2, -1], [3, -1], [4, -2], [3, -2]] as [number, number][]
).slice(0, 2 * SCALE + 2);

/**
 * Where a bush puts leaves around a new piece of stem: beside and below it,
 * never above, where the tip has to grow on.
 */
const BUSH_LEAVES: [number, number][] = [];
for (let dy = 0; dy <= 1; dy++)
  for (let dx = -SCALE; dx <= SCALE; dx++) if (dx !== 0 || dy !== 0) BUSH_LEAVES.push([dx, dy]);

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
  let j = -1;
  if (y - 1 < 1) {
    // Up against the lid: it grows on along the glass, the way it leans.
    if (tip.dx === 0) tip.dx = w.rng.below(2) === 0 ? -1 : 1;
    const nx = x + tip.dx;
    if (nx < 0 || nx >= W || w.type[tip.i + tip.dx] !== EMPTY) {
      tip.done = true;
      return false;
    }
    j = tip.i + tip.dx;
  } else {
    // Grow straight on if there is room, else try leaning round the obstacle
    // (up the glass, if it meets a wall). A blocked tip is not given up at
    // once: a drop of water or a seed may move away.
    const ny = y - 1;
    for (const d of [shift, shift === 0 ? -1 : 0, shift === 0 ? 1 : -shift]) {
      const nx = x + d;
      if (nx < 0 || nx >= W) continue;
      if (w.type[ny * W + nx] === EMPTY) {
        j = ny * W + nx;
        break;
      }
    }
  }
  if (j < 0) return false;
  const nx = j % W;
  if (!place(w, p, j, sp.form === "grass" ? LEAF : STEM)) return false;
  tip.i = j;
  tip.len++;
  // Leaves: on alternate sides of a flower stem, in clumps along a bush.
  const every = (5 - sp.leaves) * SCALE;
  if (sp.form === "flower" && tip.main && sp.leaves > 0 && tip.len % every === 0) {
    const s = ((tip.len / every) | 0) % 2 === 0 ? 1 : -1;
    for (const [dx, dy] of LEAF_SHAPE) {
      const k = j + dx * s + dy * W;
      if (Math.abs((k % W) - nx) <= 2 * SCALE && k > W && w.type[k] === EMPTY) place(w, p, k, LEAF);
    }
  } else if (sp.form === "bush" && tip.len > 2 * SCALE) {
    for (let k = 0; k < sp.leaves * SCALE; k++) {
      const [dx, dy] = BUSH_LEAVES[w.rng.below(BUSH_LEAVES.length)];
      const c = j + dy * W + dx;
      if (Math.abs((c % W) - nx) <= SCALE + 1 && c > W && w.type[c] === EMPTY) place(w, p, c, LEAF);
    }
  }
  // Branching.
  if (sp.form !== "grass" && sp.branches > 0 && p.tips.length < MAX_TIPS && tip.len >= 4 * SCALE && w.rng.below(12 * SCALE) < sp.branches * (sp.form === "bush" ? 2 : 1)) {
    const remaining = tip.max - tip.len;
    if (remaining > 3 * SCALE) {
      p.tips.push({ i: j, dx: w.rng.below(2) === 0 ? -1 : 1, len: 0, max: Math.max(3 * SCALE, ((remaining * 7) / 10) | 0), main: false, done: false });
    }
  }
  return true;
}

/** A blade of grass withers from the tip now and then (one in this many updates), and grows again. */
const GRASS_WITHERS = 80;

function witherBlade(w: World, p: Plant): void {
  const tip = p.tips[w.rng.below(p.tips.length)];
  if (!tip || !tip.done || tip.len < 2) return;
  const i = tip.i;
  // Not while it still carries its seed head.
  if (i >= W && w.org[i - W] === p.id) return;
  for (const j of [i + W, i + W - 1, i + W + 1]) {
    if (j >= W * H || Math.abs((j % W) - (i % W)) > 1 || w.org[j] !== p.id || w.type[j] !== LEAF) continue;
    shed(w, i);
    tip.i = j;
    tip.len--;
    tip.done = false;
    return;
  }
}

/** Where grass puts new blades: beside its base, nearest first. */
const BLADE_OFFSETS: number[] = [];
for (let k = 1; k <= 8 * SCALE; k++) BLADE_OFFSETS.push(-k, k);

/** Grass sends up new blades from beside its base: more as the clump gets older. */
function newBlade(w: World, p: Plant, sp: PlantSpecies): boolean {
  const maxBlades = Math.min(BLADE_OFFSETS.length, 2 + sp.branches * 2 + (p.age >> 9));
  if (p.tips.length >= maxBlades) return false;
  const bx = p.base % W;
  const by = (p.base / W) | 0;
  for (const off of BLADE_OFFSETS) {
    const x = bx + off;
    if (x < 0 || x >= W || by >= H - 1) continue;
    const i = by * W + x;
    const below = w.type[i + W];
    if (w.type[i] !== EMPTY || !(isBed(below) || below === ROOT)) continue;
    if (!place(w, p, i, LEAF)) return false;
    const max = Math.max(3 * SCALE, sp.height * SCALE - Math.abs(off) - w.rng.below(3 * SCALE));
    p.tips.push({ i, dx: off < 0 ? -1 : 1, len: 1, max, main: false, done: false });
    return true;
  }
  return false;
}

/**
 * A flower or bush that has nowhere left to grow puts out a new shoot from
 * its stem, mostly high up, where the light is. So it keeps growing, until
 * the glass is full.
 */
function newShoot(w: World, p: Plant, sp: PlantSpecies, stems: number[]): boolean {
  if (stems.length === 0) return false;
  const h = sp.height * SCALE;
  for (let attempt = 0; attempt < 3; attempt++) {
    let s = stems[w.rng.below(stems.length)];
    const s2 = stems[w.rng.below(stems.length)];
    if (s2 < s) s = s2;
    const side = w.rng.below(2) === 0 ? -1 : 1;
    const x = s % W;
    for (const j of [s - W + side, s - W, s + side]) {
      if (j < W || Math.abs((j % W) - x) > 1 || w.type[j] !== EMPTY) continue;
      if (!place(w, p, j, STEM)) return false;
      const main = sp.form === "flower" || w.rng.below(2) === 0;
      p.tips.push({ i: j, dx: side, len: 1, max: (h >> 1) + w.rng.below((h >> 1) + 1), main, done: false });
      return true;
    }
  }
  return false;
}

function growShoot(w: World, p: Plant, sp: PlantSpecies, stems: number[]): boolean {
  // Tips that are gone are dropped; if nothing is left, start again at the base.
  p.tips = p.tips.filter((tip) => w.org[tip.i] === p.id && PLANT_PART[w.type[tip.i]] === 1);
  if (p.tips.every((tip) => tip.done) && w.type[p.base] === EMPTY && place(w, p, p.base, sp.form === "grass" ? LEAF : STEM)) {
    p.tips.push({ i: p.base, dx: 0, len: 1, max: sp.height * SCALE, main: true, done: false });
    return true;
  }
  if (sp.form === "grass") {
    // Grass keeps its finished blades as tips: they are how it counts them.
    if (w.rng.below(3) === 0 && newBlade(w, p, sp)) return true;
    for (let k = 0; k < p.tips.length; k++) {
      const tip = p.tips[(p.age + k) % p.tips.length];
      if (!tip.done && extendTip(w, p, sp, tip)) return true;
    }
    return newBlade(w, p, sp);
  }
  p.tips = p.tips.filter((tip) => !tip.done);
  const n = p.tips.length;
  for (let k = 0; k < n; k++) {
    if (extendTip(w, p, sp, p.tips[(p.age + k) % n])) return true;
  }
  // Nothing could grow: now and then a blocked tip is given up, and the
  // plant grows a new shoot somewhere else.
  if (n >= MAX_TIPS) {
    if (w.rng.below(4) !== 0) return false;
    p.tips.shift();
  }
  return newShoot(w, p, sp, stems);
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

/** A plant that has shed leaves puts out new ones along its stems where there is light (`lit`). */
function regrowLeaf(w: World, p: Plant, lit: number[]): boolean {
  for (let attempt = 0; attempt < 4 && lit.length > 0; attempt++) {
    const s = lit[w.rng.below(lit.length)];
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
  const x = (f % W) + w.rng.below(4 * SCALE + 1) - 2 * SCALE;
  const y = (f / W) | 0;
  if (x < 0 || x >= W) return;
  const i = y * W + x;
  if (w.type[i] !== EMPTY) return;
  setCell(w, i, SEED);
  w.kind[i] = p.species;
  w.food[i] = 1;
  w.org[i] = packSeed(inheritPlant(w, p.genes));
  p.store--;
  p.energy -= SEED_COST[p.genes.seed - 1];
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
  const lit: number[] = [];
  const flowers: number[] = [];
  const cells = p.cells;
  // Old leaves and flowers fall: sooner in the shade, or when the plant is thirsty.
  const extra = p.thirst > 0 ? 2 : 0;
  let n = 0;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k];
    const t = type[i];
    if (!PLANT_PART[t] || org[i] !== p.id) continue;
    if ((t === LEAF || t === FLOWER) && wet[i] > 0) {
      const age = wet[i] + ((p.age + i) & 1) + (light[i] < SHADE ? 2 : 0) + extra;
      if (age >= 255) {
        shed(w, i);
        continue;
      }
      wet[i] = age;
    }
    cells[n++] = i;
    if (t === LEAF) {
      green++;
      leaves++;
      income += light[i] >> 6;
    } else if (t === STEM) {
      green++;
      stems.push(i);
      if (light[i] >= SHADE) lit.push(i);
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
  for (let k = 0; k < roots.length && taken < 3 * SCALE && p.store < MAX_STORE; k++) {
    const r = roots[k];
    const dir = (p.age + k) & 3;
    const j = dir === 0 ? r + W : dir === 1 ? r - 1 : dir === 2 ? r + 1 : r - W;
    if (j < 0 || j >= W * H || Math.abs((j % W) - (r % W)) > 1) continue;
    if (isBed(type[j]) && food[j] > 0) {
      food[j]--;
      p.store++;
      taken++;
      // A dead leaf that has given up all it had is gone.
      if (food[j] === 0 && type[j] === WASTE) clearCell(w, j);
    }
  }

  // Living costs a little sugar (a seedling in deep shade starves in the
  // end), and leaves need water.
  p.energy += income - 1 - (n >> 4);
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

  // A plant does not die of age. It dies of thirst, of too much shade, or
  // when it has lost all its green and has no sugar left to grow again.
  const bare = green + flowers.length === 0 && p.energy < GROW_COST;
  if (p.thirst > THIRST_LIMIT || p.energy < STARVES_AT || roots.length === 0 || bare) {
    killPlant(w, p);
    return;
  }

  if (sp.form === "grass" && w.rng.below(GRASS_WITHERS) === 0) witherBlade(w, p);

  // Grow a few cells every few updates (SCALE of them, so plants keep their
  // pace in the finer glass): roots first while they lag behind, then the shoot.
  if (p.age % GROW_EVERY[p.genes.growth - 1] !== 0 || p.thirst > 0) return;
  if (leaves > p.maxLeaves) p.maxLeaves = leaves;
  if (flowers.length > p.maxFlowers) p.maxFlowers = flowers.length;
  for (let g = 0; g < SCALE; g++) {
    const cost = cellCost(p);
    if (p.energy < cost) return;
    // A root takes the nutrients of the cell it grows into, so a plant with
    // an empty store reaches for new ground: roots grow when they lag behind
    // the shoot, or when the ground they are in has nothing more to give.
    const wantRoots = Math.max(2, (p.cells.length / 4) | 0);
    if ((roots.length < wantRoots || p.store < 1) && growRoot(w, p, sp, roots)) {
      p.energy -= cost;
      continue;
    }
    if (p.store < 1) return;
    // New leaves where old ones fell first; then grow on.
    if (leaves < p.maxLeaves && regrowLeaf(w, p, lit)) {
      p.energy -= cost;
      leaves++;
      continue;
    }
    if (growShoot(w, p, sp, stems)) {
      p.energy -= cost;
      continue;
    }
    if (flowers.length < p.maxFlowers && regrowFlower(w, p, stems.length > 0 ? stems : cells)) {
      p.energy -= cost;
      return;
    }
    break;
  }
  // Grass seeds half as often: its seeds land in the open more easily.
  const every = SEED_EVERY[p.genes.seed - 1] * (sp.form === "grass" ? 2 : 1);
  if (flowers.length > 0 && p.energy > SEED_COST[p.genes.seed - 1] + GROW_COST * 4 && w.rng.below(every) === 0) dropSeed(w, p, flowers);
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
 * Every few steps: seeds sprout or rot, feed goes off, and dead leaves rot
 * slowly into the ground they lie on.
 */
export function slowPass(w: World): void {
  const { type, wet, food } = w;
  // Nutrients spread slowly through the ground with the water in it, from
  // richer soil to poorer: each cell evens out with the one below it or
  // beside it, one cell in eight at a time.
  const phase = (w.tick >> 2) & 7;
  const down = (w.tick & 32) === 0;
  for (let i = W; i < W * (H - 1); i++) {
    const t = type[i];
    if ((i & 7) === phase && isGround(t)) {
      const j = down ? i + W : i + 1;
      if ((down || i % W < W - 1) && isGround(type[j])) {
        if (food[i] > food[j] + 1) {
          food[i]--;
          food[j]++;
        } else if (food[j] > food[i] + 1) {
          food[j]--;
          food[i]++;
        }
      }
    }
    if (t === SEED) {
      const below = i + W;
      // A seed counts its age in its moisture slot. Lying on a creature it
      // just waits for it to move on.
      if (CREATURE_PART[type[below]]) continue;
      if (wet[i] < 255) wet[i]++;
      const good = isBed(type[below]) && wet[below] > 40 && type[i - W] === EMPTY;
      if (good && wet[i] >= SPROUT_AFTER && w.plants.length < MAX_PLANTS) germinate(w, i);
      else if (wet[i] >= SEED_ROTS_AFTER) {
        type[i] = WASTE;
        wet[i] = 0;
        w.org[i] = 0;
      }
    } else if (t === FEED) {
      // Feed nobody eats goes off and turns to litter. Its age is in the moisture slot.
      if (wet[i] < 255) wet[i]++;
      if (wet[i] >= FEED_ROTS_AFTER) {
        type[i] = WASTE;
        wet[i] = 0;
      }
    } else if (t === WASTE) {
      // A dead leaf nobody eats rots slowly where it lies (even one caught
      // in a bush), and ten times as fast under water: half of it is
      // breathed out by the rot, the rest is washed down into the ground below.
      if (w.rng.below(type[i - W] === WATER ? LITTER_ROTS / 10 : LITTER_ROTS) !== 0) continue;
      let j = i + W;
      while (j < W * H && !isGround(type[j])) j += W;
      const u = food[i];
      const burnt = j < W * H ? (u + 1) >> 1 : u;
      if (j < W * H) {
        if (food[j] + u - burnt > 255) continue;
        food[j] += u - burnt;
      }
      w.burned += burnt;
      food[i] = 0;
      clearCell(w, i);
    } else if (t === WATER && type[i - W] === EMPTY && w.rng.below(1500) === 0) {
      // Open water slowly evaporates into the air.
      clearCell(w, i);
      w.humidity += WATER_UNITS;
    } else if (t === SOIL && type[i - W] === EMPTY && wet[i] > SOIL_DRIES_TO + SOIL_BREATH && w.rng.below(64) === 0) {
      // Moist soil breathes out a little water too, so there is dew in the
      // glass even when few plants are growing.
      wet[i] -= SOIL_BREATH;
      w.humidity += SOIL_BREATH;
    }
  }
}
