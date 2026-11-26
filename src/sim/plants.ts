import { EMPTY, FEED, FLOWER, LEAF, PLANT_PART, ROOT, SAND, SEED, SOIL, STEM, STONE, WASTE, WATER } from "./cells";
import type { PlantSpecies } from "./species";
import { H, SCALE, W } from "./dims";
import { inheritPlant, packSeed, plantGenesOf, unpackSeed, type PlantGenes } from "./genes";
import { clearCell, newOrgId, REACH, setCell, wake, WATER_UNITS, waterTable, type World } from "./world";

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

/** Plants are updated every PLANT_EVERY life steps, spread over the steps by id. */
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
/** Slow-pass checks before uneaten feed rots (about a minute). */
const FEED_ROTS_AFTER = 150;
const MAX_STORE = 20 * SCALE;
/** A plant this far in debt for sugar (too much shade) dies. */
const STARVES_AT = -500;
/** Most growing tips a flower or bush has at once. */
const MAX_TIPS = 6;
/** A bush grows on more branches at once. */
const BUSH_TIPS = 10;
/**
 * Leaves and flowers count their age in the moisture slot (they hold no
 * water) and fall off when it reaches 255. A leaf in the light gains one
 * every other update (about three and a half minutes); one in the shade
 * or on a thirsty plant ages faster. Grass blades do not age.
 */
const SHADE = 64;
/** Slow-pass checks before a dead leaf nobody eats has rotted (about ten minutes). */
const LITTER_ROTS = 1500;

function isGround(t: number): boolean {
  return t === SOIL || t === SAND;
}

/** Where seeds sprout and roots grow: soil, sand, and rotting waste (compost). */
function isBed(t: number): boolean {
  return t === SOIL || t === SAND || t === WASTE;
}

/** How near a seed the sides of its pit must be. */
const PIT = 3 * SCALE;

/** Is there ground (or dead leaves, or the glass) beside cell i, within PIT cells on side d? */
function sheltered(type: Uint8Array, i: number, d: number): boolean {
  const x = i % W;
  for (let k = 1; k <= PIT; k++) {
    const nx = x + d * k;
    if (nx < 0 || nx >= W) return true;
    const t = type[i + d * k];
    if (isBed(t) || t === ROOT || t === STONE) return true;
  }
  return false;
}

/**
 * Can the seed in cell i sprout where it lies? It needs a bed under it,
 * groundwater near enough, and open air above. Grass sprouts on the surface;
 * bushes and flowers need shelter too: ground (or dead leaves) close by on
 * both sides of it, as at the bottom of a little pit the player has dug. The
 * view asks this too, to make a seed that is going to sprout blink.
 */
export function seedCanSprout(w: World, i: number, table = waterTable(w)): boolean {
  const { type } = w;
  const below = i + W;
  if (i < W || below >= W * H || !isBed(type[below]) || ((below / W) | 0) < table - REACH || type[i - W] !== EMPTY) return false;
  const sp = w.plantSpecies[w.kind[i]];
  if (!sp || sp.form === "grass") return true;
  return sheltered(type, i, -1) && sheltered(type, i, 1);
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
  setCell(w, i, type);
  // Leaves and flowers start at a slightly different age each, so they do
  // not all fall at once (on a bush, which keeps them long, very different
  // ages). Grass blades never fall.
  const form = w.plantSpecies[p.species].form;
  const ages = type === FLOWER || (type === LEAF && form !== "grass");
  w.wet[i] = ages ? 1 + (form === "bush" ? (w.shade[i] * 3) >> 2 : w.shade[i] & 31) : 0;
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
  if (sp.form === "bush") {
    // A bush: seven stems fanning out from its foot, one up the middle, and
    // on each side three, from slanting up to spreading out low.
    const h = 2 * crownHeight(sp);
    p.tips.push({ i, dx: 0, len: 1, max: h, main: true, done: false });
    for (const s of [-1, 1]) {
      const j = i - W + s;
      if (j < W || w.type[j] !== EMPTY || !place(w, p, j, STEM)) continue;
      for (const lean of [3, 6, 10]) p.tips.push({ i: j, dx: s * (lean + w.rng.below(2)), len: 1, max: h, main: false, done: false });
    }
  } else p.tips.push({ i, dx: 0, len: 1, max: sp.height * SCALE, main: true, done: false });
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
    w.wet[i] = 0;
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
  } else if (sp.form === "bush") {
    // A bush branch ends in a round, dense cluster of leaves, now and then
    // with a berry in it.
    for (const [dx, dy] of CLUSTER) {
      const j = tip.i + dy * W + dx;
      if (x + dx < 0 || x + dx >= W || j < W || w.type[j] !== EMPTY || p.energy < cellCost(p)) continue;
      const berry = dx === 0 && dy === 0 ? false : w.rng.below(12) === 0;
      if (place(w, p, j, berry ? FLOWER : LEAF)) p.energy -= cellCost(p);
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

/** The leaf cluster at the end of a bush branch: a disc round the tip. */
const CLUSTER: [number, number][] = [];
for (let dy = -SCALE - 1; dy <= SCALE; dy++)
  for (let dx = -SCALE - 1; dx <= SCALE + 1; dx++) if (dx * dx + dy * dy <= (SCALE + 1) * (SCALE + 1) && (dx !== 0 || dy !== 0)) CLUSTER.push([dx, dy]);

/**
 * A bush's crown is a dome on the ground: half an ellipse round its foot, a
 * little wider than it is tall. Its branches grow until they reach the edge
 * of it, and its leaves fill the outer part of it.
 */
function crownHeight(sp: PlantSpecies): number {
  return ((sp.height * SCALE * 3) / 5) | 0;
}
function crownHalfWidth(sp: PlantSpecies): number {
  return ((sp.height * SCALE * 5) / 8) | 0;
}
/** Where a cell is in a bush's crown: 0 at its foot, 100 at the edge (both squared, in hundredths). */
function inCrownAt(p: Plant, sp: PlantSpecies, x: number, y: number): number {
  const rx = crownHalfWidth(sp);
  const ry = crownHeight(sp);
  const dx = x - (p.base % W);
  const dy = ((p.base / W) | 0) - y;
  return (((dx * dx * ry * ry + dy * dy * rx * rx) * 100) / (rx * rx * ry * ry)) | 0;
}
function inCrown(p: Plant, sp: PlantSpecies, x: number, y: number): boolean {
  return inCrownAt(p, sp, x, y) <= 100;
}
/** Out in the crown, where the leaves are and it branches; nearer the foot, bare stems. */
function outerCrown(p: Plant, sp: PlantSpecies, x: number, y: number): boolean {
  return inCrownAt(p, sp, x, y) >= 16;
}

/**
 * How a bush branch leans: tip.dx is its slant in eighths, from 0 (straight
 * up) through 8 (up and out at 45 degrees) to 12 (out, and a little up),
 * and its sign the side it leans to.
 */
const LEAN = 8;
const MAX_LEAN = 12;

/** Steps to the side (or up) on step `len` of a line that takes `a` eighths of one each step. */
function slant(len: number, a: number): number {
  return (((len + 1) * a + 4) >> 3) - ((len * a + 4) >> 3);
}

/** Leaves round a new piece of bush stem: a disc, but never in the way ahead. */
const BUSH_LEAVES: [number, number][] = [];
for (let dy = -SCALE; dy <= SCALE; dy++)
  for (let dx = -SCALE; dx <= SCALE; dx++) if ((dx !== 0 || dy !== 0) && dx * dx + dy * dy <= SCALE * SCALE + 1) BUSH_LEAVES.push([dx, dy]);

/** A bush stem can grow into empty space, or through its own leaves. */
function roomForStem(w: World, p: Plant, c: number): boolean {
  return w.type[c] === EMPTY || (w.type[c] === LEAF && w.org[c] === p.id);
}
function growStem(w: World, p: Plant, c: number): boolean {
  if (w.type[c] === EMPTY) return place(w, p, c, STEM);
  // A leaf becomes stem: what it is made of stays.
  w.type[c] = STEM;
  w.wet[c] = 0;
  return true;
}

/** A bush branch grows one cell along its slant, to the edge of the crown. */
function extendBushTip(w: World, p: Plant, sp: PlantSpecies, tip: Tip): boolean {
  if (tip.len >= tip.max) {
    finishTip(w, p, sp, tip);
    return true;
  }
  const x = tip.i % W;
  const y = (tip.i / W) | 0;
  const side = Math.sign(tip.dx);
  const a = Math.abs(tip.dx);
  let sx = a <= LEAN ? side * slant(tip.len, a) : side;
  const sy = a <= LEAN ? -1 : -slant(tip.len, 2 * LEAN - a);
  // Now and then a little kink.
  if (sx === 0 && w.rng.below(6) === 0) sx = w.rng.below(2) === 0 ? -1 : 1;
  if (!inCrown(p, sp, x + sx, y + sy)) {
    finishTip(w, p, sp, tip);
    return true;
  }
  // Straight on if there is room, else round whatever is in the way; up
  // against the lid, along it.
  const way = side || (w.rng.below(2) === 0 ? -1 : 1);
  const tries: [number, number][] = [[sx, sy], sy < 0 ? [sx === 0 ? way : 0, -1] : [sx, -1], [way, 0]];
  let j = -1;
  for (const [dx, dy] of tries) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= W || ny < 1 || !roomForStem(w, p, ny * W + nx) || !inCrown(p, sp, nx, ny)) continue;
    j = ny * W + nx;
    break;
  }
  if (j < 0 || !growStem(w, p, j)) return false;
  const from = tip.i;
  tip.i = j;
  tip.len++;
  const nx = j % W;
  const ny = (j / W) | 0;
  // Leaves all round the stem out in the crown (not in the way it grows).
  if (tip.len > SCALE && outerCrown(p, sp, x, y)) {
    const ax = nx - x;
    const ay = ny - y;
    for (const [dx, dy] of BUSH_LEAVES) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 1 && dx * ax + dy * ay > 0) continue;
      const c = from + dy * W + dx;
      if (x + dx < 0 || x + dx >= W || c < W || w.type[c] !== EMPTY || !inCrown(p, sp, x + dx, y + dy)) continue;
      if (!place(w, p, c, LEAF)) break;
    }
  }
  // It branches out in the crown. An upright branch sends one out to the
  // side; one slanting far out sends one up, so the crown fills.
  if (sp.branches > 0 && p.tips.length < BUSH_TIPS && tip.len >= 2 * SCALE && outerCrown(p, sp, nx, ny) && w.rng.below(6 * SCALE) < sp.branches) {
    const out = side || way;
    const lean = a >= 6 ? tip.dx - out * (3 + w.rng.below(3)) : out * Math.min(MAX_LEAN, a + 3 + w.rng.below(4));
    p.tips.push({ i: j, dx: lean, len: 0, max: 2 * crownHeight(sp), main: false, done: false });
  }
  return true;
}

/** A leaf on a flower stem, pointing out and up to the side s = 1. */
const LEAF_SHAPE: [number, number][] = (
  [[1, 0], [2, 0], [2, -1], [3, -1], [4, -2], [3, -2]] as [number, number][]
).slice(0, 2 * SCALE + 2);


function extendTip(w: World, p: Plant, sp: PlantSpecies, tip: Tip): boolean {
  if (sp.form === "bush") return extendBushTip(w, p, sp, tip);
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
  // Leaves: on alternate sides of a flower stem.
  const every = (5 - sp.leaves) * SCALE;
  if (sp.form === "flower" && tip.main && sp.leaves > 0 && tip.len % every === 0) {
    const s = ((tip.len / every) | 0) % 2 === 0 ? 1 : -1;
    for (const [dx, dy] of LEAF_SHAPE) {
      const k = j + dx * s + dy * W;
      if (Math.abs((k % W) - nx) <= 2 * SCALE && k > W && w.type[k] === EMPTY) place(w, p, k, LEAF);
    }
  }
  // Branching.
  if (sp.form !== "grass" && sp.branches > 0 && p.tips.length < MAX_TIPS && tip.len >= 4 * SCALE && w.rng.below(12 * SCALE) < sp.branches) {
    const remaining = tip.max - tip.len;
    if (remaining > 3 * SCALE) {
      const dx = w.rng.below(2) === 0 ? -1 : 1;
      p.tips.push({ i: j, dx, len: 0, max: Math.max(3 * SCALE, ((remaining * 7) / 10) | 0), main: false, done: false });
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
  if (sp.form === "bush") return newBushShoot(w, p, sp, stems);
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

/**
 * A bush that has nowhere left to grow fills out its crown: a new branch
 * from a stem out in it, to the edge; now and then a new stem from its foot,
 * fanning out; or a thicker foot. Not too thick with branches, though.
 */
function newBushShoot(w: World, p: Plant, sp: PlantSpecies, stems: number[]): boolean {
  const bx = p.base % W;
  const by = (p.base / W) | 0;
  if (stems.length >= (crownHalfWidth(sp) * crownHeight(sp)) >> 3) return false;
  const roll = w.rng.below(6);
  if (roll === 0) {
    // A thicker foot: a stem beside one low down near the middle.
    for (let attempt = 0; attempt < 4; attempt++) {
      const s = stems[w.rng.below(stems.length)];
      if (by - ((s / W) | 0) > crownHeight(sp) >> 3 || Math.abs((s % W) - bx) > SCALE) continue;
      for (const j of [s - 1, s + 1]) {
        if (Math.abs((j % W) - (s % W)) > 1 || !roomForStem(w, p, j)) continue;
        return growStem(w, p, j);
      }
    }
  }
  // How many stems it has just above its foot.
  let foot = 0;
  const fy = by - 2 * SCALE;
  for (let x = bx - 2 * SCALE; x <= bx + 2 * SCALE; x++) if (x >= 0 && x < W && fy >= 0 && w.org[fy * W + x] === p.id) foot++;
  for (let attempt = 0; attempt < 3; attempt++) {
    let s: number;
    let lean: number;
    if (roll === 1) {
      // A new stem from the foot, low and spreading; up to five of them.
      if (foot >= 5) return false;
      s = p.base;
      lean = 6 + w.rng.below(MAX_LEAN - 5);
    } else {
      // A branch from a stem out in the crown, the one further out of two.
      s = stems[w.rng.below(stems.length)];
      const s2 = stems[w.rng.below(stems.length)];
      if (Math.abs((s2 % W) - bx) > Math.abs((s % W) - bx)) s = s2;
      if (!outerCrown(p, sp, s % W, (s / W) | 0)) continue;
      lean = 2 + w.rng.below(MAX_LEAN - 1);
    }
    const x = s % W;
    const out = x === bx ? (w.rng.below(2) === 0 ? -1 : 1) : x > bx ? 1 : -1;
    for (const j of [s - W + out, s + out, s - W]) {
      if (j < W || Math.abs((j % W) - x) > 1 || !roomForStem(w, p, j) || !inCrown(p, sp, j % W, (j / W) | 0)) continue;
      if (!growStem(w, p, j)) return false;
      p.tips.push({ i: j, dx: out * lean, len: 1, max: 2 * crownHeight(sp), main: false, done: false });
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
  if (n >= (sp.form === "bush" ? BUSH_TIPS : MAX_TIPS)) {
    if (w.rng.below(4) !== 0) return false;
    p.tips.shift();
  }
  return newShoot(w, p, sp, stems);
}

/** A plant that has lost its flowers flowers again at its highest point. */
function regrowFlower(w: World, p: Plant, from: number[]): boolean {
  // On top of the plant itself (a stem, or a blade of grass), never on top
  // of another flower, so flowers do not pile up into a column.
  let top = -1;
  for (const i of from) if (w.type[i] !== ROOT && w.type[i] !== FLOWER && (top < 0 || i < top)) top = i;
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

/**
 * A bush fills its crown with leaves: a new one near a stem out in the
 * crown (`outer`), wherever there is room inside it.
 */
const BUSH_FILL: [number, number][] = [];
for (let dy = -2 * SCALE; dy <= 2 * SCALE; dy++)
  for (let dx = -2 * SCALE; dx <= 2 * SCALE; dx++) if ((dx !== 0 || dy !== 0) && dx * dx + dy * dy <= 4 * SCALE * SCALE) BUSH_FILL.push([dx, dy]);

function regrowBushLeaf(w: World, p: Plant, sp: PlantSpecies, outer: number[]): boolean {
  for (let attempt = 0; attempt < 8 && outer.length > 0; attempt++) {
    const s = outer[w.rng.below(outer.length)];
    const [dx, dy] = BUSH_FILL[w.rng.below(BUSH_FILL.length)];
    const x = (s % W) + dx;
    const y = ((s / W) | 0) + dy;
    if (x < 0 || x >= W || y < 1 || !inCrown(p, sp, x, y)) continue;
    const c = y * W + x;
    if (w.type[c] === EMPTY) return place(w, p, c, LEAF);
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
  // Old leaves and flowers fall: sooner in the shade, or when the plant is
  // thirsty. A bush keeps its leaves about four times as long, in the shade
  // too, and grows new ones all over the outside of its crown.
  const bush = sp.form === "bush";
  const extra = p.thirst > 0 ? 2 : 0;
  const slow = bush ? 2 : 0;
  const dark = bush ? 0 : SHADE;
  let deepest = -1;
  let n = 0;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k];
    const t = type[i];
    if (!PLANT_PART[t] || org[i] !== p.id) continue;
    if ((t === LEAF || t === FLOWER) && wet[i] > 0 && ((p.age + i) & ((1 << slow) - 1)) === 0) {
      const age = wet[i] + (((p.age + i) >> slow) & 1) + (light[i] < dark ? 2 : 0) + extra;
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
      if (bush ? outerCrown(p, sp, i % W, (i / W) | 0) : light[i] >= SHADE) lit.push(i);
      income += light[i] >> 7;
    } else if (t === ROOT) {
      roots.push(i);
      if (i > deepest) deepest = i;
    } else flowers.push(i);
  }
  cells.length = n;

  // Roots that reach down near the water table drink from the groundwater.
  if (roots.length > 0 && ((deepest / W) | 0) >= waterTable(w) - REACH) {
    const take = Math.min(30 + roots.length * 12 - p.water, 4 * roots.length, w.groundwater);
    if (take > 0) {
      p.water += take;
      w.groundwater -= take;
    }
  }

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
    // New leaves where old ones fell first; then grow on. A bush grows on
    // and fills its crown with leaves by turns.
    if (bush ? (g & 1) === 1 && regrowBushLeaf(w, p, sp, lit) : leaves < p.maxLeaves && regrowLeaf(w, p, lit)) {
      p.energy -= cost;
      leaves++;
      continue;
    }
    if (growShoot(w, p, sp, stems)) {
      p.energy -= cost;
      continue;
    }
    if (bush && (g & 1) === 0 && regrowBushLeaf(w, p, sp, lit)) {
      p.energy -= cost;
      leaves++;
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
    if ((p.id + w.life) % PLANT_EVERY !== 0) continue;
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
  const table = waterTable(w);
  // Nutrients spread slowly through the ground with the water in it, from
  // richer soil to poorer: each cell evens out with the one below it or
  // beside it, one cell in eight at a time.
  const phase = (w.life >> 2) & 7;
  const down = (w.life & 32) === 0;
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
      // A seed counts its age in its moisture slot.
      if (wet[i] < 255) wet[i]++;
      if (wet[i] >= SPROUT_AFTER && seedCanSprout(w, i, table)) germinate(w, i);
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
    }
  }
}
