import { ABSORB, EMPTY, PLANT_PART, POWDER, ROOT, SAND, SOIL, STONE, WASTE, WATER } from "./cells";
import { crawlCreatures, updateCreatures, type Creature } from "./creatures";
import { MAX_ORG_ID } from "./genes";
import { slowPass, updatePlants, type Plant } from "./plants";
import { Rng } from "./rng";
import { CREATURE_SPECIES, PLANT_SPECIES, type CreatureSpecies, type PlantSpecies } from "./species";

import { H, LIFE_EVERY, SCALE, SIZE, W } from "./dims";

export { AREA, H, LIFE_EVERY, LIFE_PER_DAY, SCALE, SIZE, TICKS_PER_SECOND, W } from "./dims";

/**
 * Bump this whenever the rules change on purpose, and update the golden hash
 * in src/sim/golden.ts.
 */
export const SIM_VERSION = 17;

/**
 * The glass is split into chunks of CHUNK × CHUNK cells. Only chunks where
 * something changed recently are checked for falling and flowing, which keeps
 * the step fast when most of the glass is at rest.
 */
export const CHUNK = 8;
export const CHUNKS_X = W / CHUNK;
export const CHUNKS_Y = H / CHUNK;

/** Every so many steps all chunks are woken, so nothing stays asleep for good. */
const WAKE_ALL_EVERY = 16;

/** Water in one water cell, in units. */
export const WATER_UNITS = 32;

/**
 * The groundwater is one body of water under the whole glass, like the
 * water in a bath: every cell below its surface (the water table) holds as
 * much as a water cell, so the table is a level line, one row per ROW_UNITS.
 * Where the ground dips below it, the water stands in the open: the pond.
 */
const ROW_UNITS = W * WATER_UNITS;

/** Roots this close above the water table (or below it) drink from it; seeds this close sprout. */
export const REACH = 12 * SCALE;

/** The row of the water table: cells at this row and below are under it. */
export function waterTable(w: World): number {
  return H - Math.min(H, (w.groundwater / ROW_UNITS) | 0);
}

/** Water one dew event puts back. */
const DEW = 8 * SCALE;
/** Plants drink dew and drops until they hold this much water. */
const PLANT_DRINKS_TO = 200 * SCALE;

export interface World {
  readonly seed: number;
  /** Fast steps since the glass was made (TICKS_PER_SECOND a second). */
  tick: number;
  /** Life steps since the glass was made (one every LIFE_EVERY fast steps). */
  life: number;
  readonly rng: Rng;
  /** Cell type per cell (see cells.ts). */
  readonly type: Uint8Array;
  /** A fixed random shade per cell, so every cell looks a little different. */
  readonly shade: Uint8Array;
  /**
   * The age of a leaf, flower, seed or feed, 0–255. (It held moisture in
   * soil and sand once; the ground now has one groundwater for the glass.)
   */
  readonly wet: Uint8Array;
  /**
   * Nutrients, in units. In soil they are free for roots to take; in a plant
   * cell, seed or dead leaf they are what the cell is made of. Plants make
   * units from light (photosynthesis, counted in `fixed`), and animals burn
   * them (respiration, counted in `burned`); otherwise they are only moved.
   */
  readonly food: Uint8Array;
  /** Species of a seed, plant cell or creature cell. */
  readonly kind: Uint8Array;
  /**
   * Organism a living cell belongs to (0 = none). A seed has no organism yet;
   * its slot holds the seed's genes instead (see packSeed in genes.ts).
   */
  readonly org: Uint16Array;
  /** Light reaching each cell, 0–255. Recomputed every four steps. */
  readonly light: Uint8Array;
  /** Step in which a cell last moved, so nothing moves twice in one step. */
  readonly stamp: Uint32Array;
  /** Chunks to check this step, and chunks woken for the next step. */
  awake: Uint8Array;
  wakeNext: Uint8Array;
  /**
   * Water in the air, in units. Plants and the pond breathe it out; it
   * settles again as dew.
   */
  humidity: number;
  /** The groundwater, in units: its surface is the water table (see waterTable). */
  groundwater: number;
  /** Water that has escaped from the glass for good (it is not quite airtight). */
  lostWater: number;
  /** Plant species in this glass. Cells refer to them by index (kind). */
  readonly plantSpecies: PlantSpecies[];
  /** Living plants, oldest first. */
  plants: Plant[];
  /** Creature species in this glass. Creature cells refer to them by index (kind). */
  readonly creatureSpecies: CreatureSpecies[];
  /** Living creatures, oldest first. */
  creatures: Creature[];
  /** Every living organism by id. */
  readonly orgs: Map<number, Plant | Creature>;
  nextOrgId: number;
  /**
   * Nutrient units made by plants from light and air, and units burnt (by
   * animals, and by dead leaves rotting). totalUnits - fixed + burned stays
   * the same unless the player adds or takes something.
   */
  fixed: number;
  burned: number;
}

export function emptyWorld(
  seed: number,
  plantSpecies: PlantSpecies[] = PLANT_SPECIES,
  creatureSpecies: CreatureSpecies[] = CREATURE_SPECIES,
): World {
  return {
    seed,
    tick: 0,
    life: 0,
    rng: new Rng(seed),
    type: new Uint8Array(SIZE),
    shade: new Uint8Array(SIZE),
    wet: new Uint8Array(SIZE),
    food: new Uint8Array(SIZE),
    org: new Uint16Array(SIZE),
    light: new Uint8Array(SIZE),
    stamp: new Uint32Array(SIZE),
    awake: new Uint8Array(CHUNKS_X * CHUNKS_Y).fill(1),
    wakeNext: new Uint8Array(CHUNKS_X * CHUNKS_Y).fill(1),
    kind: new Uint8Array(SIZE),
    humidity: 0,
    groundwater: 0,
    lostWater: 0,
    plantSpecies: plantSpecies.map((p) => ({ ...p, colors: { ...p.colors }, traits: { ...p.traits } })),
    plants: [],
    creatureSpecies: creatureSpecies.map((c) => ({ ...c, traits: { ...c.traits } })),
    creatures: [],
    orgs: new Map(),
    nextOrgId: 1,
    fixed: 0,
    burned: 0,
  };
}

/** A free organism id (0 if every id is taken). Ids stay below the seed-genes bit. */
export function newOrgId(w: World): number {
  for (let n = 0; n < MAX_ORG_ID; n++) {
    const id = w.nextOrgId;
    w.nextOrgId = id >= MAX_ORG_ID ? 1 : id + 1;
    if (!w.orgs.has(id)) return id;
  }
  return 0;
}

/** Wakes the chunk holding cell i and its neighbours for the next step. */
export function wake(w: World, i: number): void {
  const cx = ((i % W) / CHUNK) | 0;
  const cy = ((i / W / CHUNK) | 0);
  const x0 = cx > 0 ? cx - 1 : 0;
  const x1 = cx < CHUNKS_X - 1 ? cx + 1 : cx;
  const y0 = cy > 0 ? cy - 1 : 0;
  const y1 = cy < CHUNKS_Y - 1 ? cy + 1 : cy;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.wakeNext[y * CHUNKS_X + x] = 1;
}

/** Turns a cell into a fresh cell of the given type, with its own shade. */
export function setCell(w: World, i: number, type: number): void {
  wake(w, i);
  w.type[i] = type;
  w.shade[i] = w.rng.nextU32() & 255;
  w.wet[i] = 0;
  w.food[i] = 0;
  w.org[i] = 0;
  w.kind[i] = 0;
}

export function clearCell(w: World, i: number): void {
  wake(w, i);
  w.type[i] = EMPTY;
  w.wet[i] = 0;
  w.food[i] = 0;
  w.org[i] = 0;
  w.kind[i] = 0;
}

/** Swaps two cells with everything they carry, without marking them as moved. */
export function swapCells(w: World, i: number, j: number): void {
  move(w, i, j, 0);
}

/** Swaps two cells with everything they carry, and marks both as moved. */
function move(w: World, i: number, j: number, mark: number): void {
  const { type, shade, wet, food, org, kind } = w;
  let t = type[i];
  type[i] = type[j];
  type[j] = t;
  t = shade[i];
  shade[i] = shade[j];
  shade[j] = t;
  t = wet[i];
  wet[i] = wet[j];
  wet[j] = t;
  t = food[i];
  food[i] = food[j];
  food[j] = t;
  t = org[i];
  org[i] = org[j];
  org[j] = t;
  t = kind[i];
  kind[i] = kind[j];
  kind[j] = t;
  w.stamp[i] = mark;
  w.stamp[j] = mark;
  wake(w, i);
  wake(w, j);
}

function isFree(t: number): boolean {
  return t === EMPTY || t === WATER;
}

/** Is t part of a plant above ground (roots are part of the ground)? */
function shoot(t: number): boolean {
  return PLANT_PART[t] === 1 && t !== ROOT;
}

/**
 * Plants are not something to rest on. A cell lying on a plant falls on
 * through it if there is room under it, or else slides off to the nearest
 * open cell beside it. Returns false if there is nowhere to go.
 */
function offPlant(w: World, x: number, i: number, mark: number): boolean {
  const { type } = w;
  let j = i + W;
  while (j < SIZE && shoot(type[j])) j += W;
  if (j < SIZE && type[j] === EMPTY) {
    move(w, i, j, mark);
    return true;
  }
  const first = (w.rng.nextU32() & 1) === 1 ? 1 : -1;
  for (let d = 1; d <= OFF_PLANT_REACH; d++) {
    for (const s of [first, -first]) {
      const nx = x + s * d;
      if (nx >= 0 && nx < W && type[i + s * d] === EMPTY) {
        move(w, i, i + s * d, mark);
        return true;
      }
    }
  }
  return false;
}

/** How far sideways something slides to get off a plant. */
const OFF_PLANT_REACH = 4 * SCALE;

/** Sand and soil fall, sinking through water, and slide off slopes. */
function fallPowder(w: World, x: number, y: number, i: number, mark: number): void {
  if (y === H - 1) return;
  const { type } = w;
  const b = i + W;
  if (isFree(type[b])) {
    move(w, i, b, mark);
    return;
  }
  // Nothing rests on a plant: it falls through, or slides off.
  if (shoot(type[b]) && offPlant(w, x, i, mark)) return;
  // Soil is a little sticky: it only slides where the cell beside it is open.
  const sticky = type[i] === SOIL;
  const canL = x > 0 && isFree(type[b - 1]) && (!sticky || isFree(type[i - 1]));
  const canR = x < W - 1 && isFree(type[b + 1]) && (!sticky || isFree(type[i + 1]));
  if (!canL && !canR) return;
  const right = canL && canR ? (w.rng.nextU32() & 1) === 1 : canR;
  move(w, i, right ? b + 1 : b - 1, mark);
}

/**
 * Water falls. Where it comes to rest on the ground above the water table
 * it sinks in and joins the groundwater (on a plant, it runs down to the
 * ground); below the table it flows, as the pond.
 */
function flowWater(w: World, x: number, y: number, i: number, mark: number): void {
  const { type } = w;
  const below = y >= waterTable(w);
  if (y < H - 1) {
    const b = i + W;
    const tb = type[b];
    if (tb === EMPTY) {
      move(w, i, b, mark);
      return;
    }
    // A drop on a plant: the plant drinks it, or it runs down to the
    // ground. It never rests on the leaves (or on dead leaves).
    if (shoot(tb) || tb === WASTE) {
      const p = w.orgs.get(w.org[b]);
      if (p && p.kind === "plant" && p.water < PLANT_DRINKS_TO) {
        p.water += WATER_UNITS;
        clearCell(w, i);
        return;
      }
      if (!below) {
        soak(w, i);
        return;
      }
      if (offPlant(w, x, i, mark)) return;
    }
    // On the ground (or on water standing above the table): it sinks in.
    if (!below && (tb === SOIL || tb === SAND || tb === ROOT || tb === WATER)) {
      soak(w, i);
      return;
    }
  }
  if (y < H - 1) {
    const b = i + W;
    const dl = x > 0 && type[b - 1] === EMPTY;
    const dr = x < W - 1 && type[b + 1] === EMPTY;
    if (dl || dr) {
      const right = dl && dr ? (w.rng.nextU32() & 1) === 1 : dr;
      move(w, i, right ? b + 1 : b - 1, mark);
      return;
    }
  }
  const d = w.rng.nextU32() & 1 ? 1 : -1;
  for (let n = 0; n < 2; n++) {
    const dx = n === 0 ? d : -d;
    const nx = x + dx;
    if (nx < 0 || nx >= W) continue;
    if (type[i + dx] === EMPTY) {
      move(w, i, i + dx, mark);
      return;
    }
  }
}

/** The water in cell i sinks into the ground and joins the groundwater. */
function soak(w: World, i: number): void {
  clearCell(w, i);
  w.groundwater += WATER_UNITS;
}

/**
 * Where the ground lies below the water table, water comes up out of it and
 * fills the open cells to the table, from the bottom up.
 */
function seep(w: World): void {
  const { type } = w;
  for (let y = H - 1; y >= waterTable(w); y--) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (type[i] !== EMPTY || (y < H - 1 && type[i + W] === EMPTY)) continue;
      if (y < waterTable(w) || w.groundwater < WATER_UNITS) return;
      setCell(w, i, WATER);
      w.groundwater -= WATER_UNITS;
    }
  }
}

/**
 * Light comes from the upper left. Each ray runs one column to the right
 * for every three rows, and every cell it passes takes its share.
 */
const RAY_SHIFT = Array.from({ length: H }, (_, y) => (y / 3) | 0);

export function computeLight(w: World): void {
  const { type, light } = w;
  for (let c = -RAY_SHIFT[H - 1]; c < W; c++) {
    let l = 255;
    for (let y = 0; y < H; y++) {
      const x = c + RAY_SHIFT[y];
      if (x < 0) continue;
      if (x >= W) break;
      const i = y * W + x;
      light[i] = l;
      l -= (l * ABSORB[type[i]]) >> 8;
    }
  }
}

/**
 * Water in the air settles again as dew. It does not fall as drops: it goes
 * straight onto whatever is on top in a random column. Plants drink it, and
 * on the ground it sinks into the groundwater.
 */
function condense(w: World): void {
  // A little water escapes all the time, so the glass needs watering now
  // and then: the water table sinks a few rows a week.
  const leak = Math.min(LEAK, w.humidity);
  w.humidity -= leak;
  w.lostWater += leak;
  if (w.humidity < DEW * 4) return;
  // The more water in the air, the more dew.
  const events = Math.min(12 * SCALE, w.humidity >> 8) + (w.rng.below(4) === 0 ? 1 : 0);
  const { type } = w;
  for (let k = 0; k < events && w.humidity >= DEW; k++) {
    const x = w.rng.below(W);
    let i = x;
    while (i < SIZE && type[i] === EMPTY) i += W;
    if (i >= SIZE) continue;
    // Dew on a plant: it drinks it if it is thirsty, otherwise it runs down
    // to the ground, through any dead leaves lying there.
    if (PLANT_PART[type[i]] && type[i] !== ROOT) {
      const p = w.orgs.get(w.org[i]);
      if (p && p.kind === "plant" && p.water < PLANT_DRINKS_TO) {
        p.water += DEW;
        w.humidity -= DEW;
        continue;
      }
    }
    while (i < SIZE && (type[i] === EMPTY || type[i] === WASTE || (PLANT_PART[type[i]] && type[i] !== ROOT))) i += W;
    if (i >= SIZE) continue;
    if (type[i] === WATER) {
      // Dew on open water adds to it, a drop's worth at a time.
      if (w.rng.below(4) === 0 && w.humidity >= WATER_UNITS && i >= W && type[i - W] === EMPTY) {
        setCell(w, i - W, WATER);
        w.humidity -= WATER_UNITS;
      }
      continue;
    }
    const t = type[i];
    if (t === SOIL || t === SAND || t === ROOT) {
      w.groundwater += DEW;
      w.humidity -= DEW;
    }
  }
}

/** Advances the glass by one step. */
/** Water escaping from the glass, in units per life step. */
const LEAK = 9;

/**
 * One fast step: things fall and flow, the pond fills to the water table,
 * creatures crawl. Every LIFE_EVERY fast steps, one step of life.
 */
export function stepWorld(w: World): void {
  fastStep(w, true);
}

/** One fast step; creatures walk about only if `walk` (not while catching up). */
function fastStep(w: World, walk: boolean): void {
  // Things fall and flow SCALE cells per step, so they keep their speed
  // in the glass.
  for (let pass = 0; pass < SCALE; pass++) movePass(w, pass);
  if ((w.tick & 1) === 0) seep(w);
  crawlCreatures(w, walk);
  w.tick++;
  if (w.tick % LIFE_EVERY === 0) lifeStep(w);
}

/** Fast steps of falling and crawling in each life step while catching up. */
const SETTLE = 4;

/**
 * Moves the glass on by n fast steps the quick way, for catching up while
 * the app was closed: every life step runs, but only the last few fast steps
 * before each (enough for what has come loose to fall; creatures do not
 * walk about in them, but go to food in their life steps), and the rest are
 * skipped. It is the same on every device for the same glass and n.
 */
export function sleepWorld(w: World, n: number): void {
  while (n > 0) {
    const toLife = LIFE_EVERY - (w.tick % LIFE_EVERY);
    const span = Math.min(n, toLife);
    const skip = Math.max(0, span - SETTLE);
    // Nothing moves in the skipped steps, so nothing needs waking.
    w.tick += skip;
    for (let k = skip; k < span; k++) fastStep(w, false);
    n -= span;
  }
}

/** Moves the glass on by n life steps, the quick way (see sleepWorld). */
export function stepLifeN(w: World, n: number): void {
  sleepWorld(w, n * LIFE_EVERY - (w.tick % LIFE_EVERY));
}

/** One step of life: five minutes of growing, ageing, eating and rotting. */
function lifeStep(w: World): void {
  // Plants change slowly: the light is worked out every other life step.
  if ((w.life & 1) === 0) computeLight(w);
  updatePlants(w);
  updateCreatures(w);
  if ((w.life & 3) === 2) slowPass(w);
  condense(w);
  w.life++;
}

/** Per band of chunks: is any chunk in it awake? (Scratch space for movePass.) */
const rowAwake = new Uint8Array(CHUNKS_Y);

/** One sweep of falling and flowing over the chunks that are awake. */
function movePass(w: World, pass: number): void {
  const mark = w.tick * SCALE + pass + 1;
  const { type, stamp } = w;
  const awake = w.wakeNext;
  w.wakeNext = w.awake;
  w.awake = awake;
  if (pass === 0 && w.tick % WAKE_ALL_EVERY === 0) awake.fill(1);
  w.wakeNext.fill(0);
  for (let cy = 0; cy < CHUNKS_Y; cy++) {
    let any = 0;
    for (let cx = 0; cx < CHUNKS_X; cx++) any |= awake[cy * CHUNKS_X + cx];
    rowAwake[cy] = any;
  }
  for (let y = H - 1; y >= 0; y--) {
    const cy = (y / CHUNK) | 0;
    if (rowAwake[cy] === 0) {
      // The whole band of chunks is asleep: skip to the band above.
      y = cy * CHUNK;
      continue;
    }
    const row = cy * CHUNKS_X;
    const leftToRight = ((y + w.tick + pass) & 1) === 0;
    for (let n = 0; n < W; n++) {
      const x = leftToRight ? n : W - 1 - n;
      if (awake[row + ((x / CHUNK) | 0)] === 0) {
        // Skip the rest of this sleeping chunk's row.
        n += leftToRight ? CHUNK - 1 - (x % CHUNK) : x % CHUNK;
        continue;
      }
      const i = y * W + x;
      if (stamp[i] === mark) continue;
      const t = type[i];
      if (POWDER[t]) fallPowder(w, x, y, i, mark);
      else if (t === WATER) flowWater(w, x, y, i, mark);
      else if (t === STONE && y < H - 1 && isFree(type[i + W])) {
        // A stone with nothing under it drops straight down (it never slides).
        move(w, i, i + W, mark);
      }
    }
  }
}

/** All water in the glass, in units: groundwater, open water, in plants and in the air. */
export function totalWater(w: World): number {
  let n = w.humidity + w.groundwater;
  for (let i = 0; i < SIZE; i++) if (w.type[i] === WATER) n += WATER_UNITS;
  for (const p of w.plants) n += p.water;
  return n;
}

/** All nutrient units in the glass: in cells and held by organisms. */
export function totalUnits(w: World): number {
  let n = 0;
  for (let i = 0; i < SIZE; i++) n += w.food[i];
  for (const p of w.plants) n += p.store;
  for (const c of w.creatures) n += c.store;
  return n;
}

/**
 * The nutrient ledger: units in the glass, less those made by plants, plus
 * those burnt. It changes only when the player adds or takes something.
 */
export function unitLedger(w: World): number {
  return totalUnits(w) - w.fixed + w.burned;
}

export function stepWorldN(w: World, n: number): void {
  for (let k = 0; k < n; k++) stepWorld(w);
}
