import { ABSORB, EMPTY, FIELD_CAPACITY, PLANT_PART, POROUS, POWDER, ROOT, SAND, SEED, SOIL, STONE, WATER, WORM } from "./cells";
import { updateCreatures, type Creature } from "./creatures";
import { MAX_ORG_ID } from "./genes";
import { slowPass, updatePlants, type Plant } from "./plants";
import { Rng } from "./rng";
import { CREATURE_SPECIES, PLANT_SPECIES, type CreatureSpecies, type PlantSpecies } from "./species";

import { H, SCALE, SIZE, W } from "./dims";

export { AREA, H, SCALE, SIZE, TICKS_PER_SECOND, W } from "./dims";

/**
 * Bump this whenever the rules change on purpose, and update the golden hash
 * in src/sim/golden.ts.
 */
export const SIM_VERSION = 8;

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

/** Moisture one water cell carries into the soil. */
export const WATER_UNITS = 32;
export const MAX_WET = 255;

/** Moisture one dew event puts back into the ground. */
const DEW = 8 * SCALE;
/** Plants drink dew and drops until they hold this much water. */
const PLANT_DRINKS_TO = 200 * SCALE;

export interface World {
  readonly seed: number;
  tick: number;
  readonly rng: Rng;
  /** Cell type per cell (see cells.ts). */
  readonly type: Uint8Array;
  /** A fixed random shade per cell, so every cell looks a little different. */
  readonly shade: Uint8Array;
  /** Moisture in soil and sand, 0–255. */
  readonly wet: Uint8Array;
  /**
   * Nutrients, in units. In soil they are free for roots to take; in a plant
   * cell, seed or waste they are what the cell is made of. Units are never
   * created or destroyed by the rules, only moved (see totalUnits).
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
   * Water in the air, in moisture units. Plants breathe it out; it settles
   * again as dew.
   */
  humidity: number;
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
}

export function emptyWorld(
  seed: number,
  plantSpecies: PlantSpecies[] = PLANT_SPECIES,
  creatureSpecies: CreatureSpecies[] = CREATURE_SPECIES,
): World {
  return {
    seed,
    tick: 0,
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
    lostWater: 0,
    plantSpecies: plantSpecies.map((p) => ({ ...p, colors: { ...p.colors }, traits: { ...p.traits } })),
    plants: [],
    creatureSpecies: creatureSpecies.map((c) => ({ ...c, traits: { ...c.traits } })),
    creatures: [],
    orgs: new Map(),
    nextOrgId: 1,
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
  // Moisture in a cell that disappears goes into the air.
  if (POROUS[w.type[i]]) w.humidity += w.wet[i];
  w.type[i] = EMPTY;
  w.wet[i] = 0;
  w.food[i] = 0;
  w.org[i] = 0;
  w.kind[i] = 0;
}

/** What counts as being under ground: a cell with one of these above it is buried. */
const GROUND = new Uint8Array(32);
for (const t of [SOIL, SAND, STONE, ROOT, WORM]) GROUND[t] = 1;

/**
 * Waste or fungus that has given up all it had. On the surface it is simply
 * gone; buried in the ground, now and then it has become soil (humus), so
 * the ground builds up a little, slowly, as things live and die on it.
 */
export function rotAway(w: World, i: number): void {
  if (i >= W && GROUND[w.type[i - W]] && w.rng.below(4) === 0) {
    wake(w, i);
    w.type[i] = SOIL;
    w.food[i] = 0;
    w.org[i] = 0;
    w.kind[i] = 0;
  } else clearCell(w, i);
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

/** Sand and soil fall, sinking through water, and slide off slopes. */
function fallPowder(w: World, x: number, y: number, i: number, mark: number): void {
  if (y === H - 1) return;
  const { type } = w;
  const b = i + W;
  if (isFree(type[b])) {
    move(w, i, b, mark);
    return;
  }
  // A seed that lands on a plant slips down between the leaves to the ground.
  if (type[i] === SEED && PLANT_PART[type[b]] && type[b] !== ROOT) {
    let j = b + W;
    while (j < SIZE && PLANT_PART[type[j]] && type[j] !== ROOT) j += W;
    if (j < SIZE && type[j] === EMPTY) {
      move(w, i, j, mark);
      return;
    }
  }
  // Soil is a little sticky: it only slides where the cell beside it is open.
  const sticky = type[i] === SOIL;
  const canL = x > 0 && isFree(type[b - 1]) && (!sticky || isFree(type[i - 1]));
  const canR = x < W - 1 && isFree(type[b + 1]) && (!sticky || isFree(type[i + 1]));
  if (!canL && !canR) return;
  const right = canL && canR ? (w.rng.nextU32() & 1) === 1 : canR;
  move(w, i, right ? b + 1 : b - 1, mark);
}

/** Water falls, soaks into soil and sand that has room, and spreads sideways. */
function flowWater(w: World, x: number, y: number, i: number, mark: number): void {
  const { type, wet } = w;
  if (y < H - 1) {
    const b = i + W;
    const tb = type[b];
    if (tb === EMPTY) {
      move(w, i, b, mark);
      return;
    }
    if (POROUS[tb] && wet[b] <= MAX_WET - WATER_UNITS) {
      wet[b] += WATER_UNITS;
      clearCell(w, i);
      return;
    }
    // A drop on a plant: the plant drinks it, or it runs down through the
    // plant to the ground. It never rests on the leaves.
    if (PLANT_PART[tb] && tb !== ROOT) {
      const p = w.orgs.get(w.org[b]);
      if (p && p.kind === "plant" && p.water < PLANT_DRINKS_TO) {
        p.water += WATER_UNITS;
        clearCell(w, i);
        return;
      }
      let j = b + W;
      while (j < SIZE && PLANT_PART[type[j]] && type[j] !== ROOT) j += W;
      if (j < SIZE) {
        if (type[j] === EMPTY) {
          move(w, i, j, mark);
          return;
        }
        if (POROUS[type[j]] && wet[j] <= MAX_WET - WATER_UNITS) {
          wet[j] += WATER_UNITS;
          clearCell(w, i);
          return;
        }
      }
    }
    const dl = x > 0 && type[b - 1] === EMPTY;
    const dr = x < W - 1 && type[b + 1] === EMPTY;
    if (dl || dr) {
      const right = dl && dr ? (w.rng.nextU32() & 1) === 1 : dr;
      move(w, i, right ? b + 1 : b - 1, mark);
      return;
    }
  }
  const r = w.rng.nextU32();
  const d = r & 1 ? 1 : -1;
  for (let n = 0; n < 2; n++) {
    const dx = n === 0 ? d : -d;
    const nx = x + dx;
    if (nx < 0 || nx >= W) continue;
    const k = i + dx;
    if (type[k] === EMPTY) {
      move(w, i, k, mark);
      return;
    }
    if (POROUS[type[k]] && wet[k] <= MAX_WET - WATER_UNITS && (r & 6) === 0) {
      wet[k] += WATER_UNITS;
      clearCell(w, i);
      return;
    }
  }
}

/**
 * Dry soil draws water up from moister soil below while the difference from
 * one cell to the next is bigger than this, so the surface stays moist
 * enough for seeds as long as there is water further down.
 */
const CAPILLARY_STEP = 4;

/**
 * Moisture spreads through soil and sand: sideways and upwards a little,
 * downwards whatever the soil cannot hold against gravity.
 */
function spreadMoisture(w: World): void {
  const { type, wet } = w;
  // Runs every other step and shares with one side each time, alternating.
  // The row is walked towards that side, so both sides get the same.
  const side = (w.tick & 2) === 0 ? 1 : -1;
  for (let y = H - 1; y >= 0; y--) {
    const rowStart = y * W;
    for (let n = 0; n < W; n++) {
      const x = side === 1 ? n : W - 1 - n;
      const i = rowStart + x;
      const t = type[i];
      if (!POROUS[t]) continue;
      if (y < H - 1) {
        const b = i + W;
        if (POROUS[type[b]]) {
          const excess = wet[i] - FIELD_CAPACITY[t];
          const room = MAX_WET - wet[b];
          if (excess > 0 && room > 0) {
            const f = Math.min(room, (excess + 1) >> 1);
            wet[i] -= f;
            wet[b] += f;
          } else if (wet[b] > wet[i] + CAPILLARY_STEP) {
            // Capillary rise: dry soil draws water up from below.
            const f = (wet[b] - wet[i]) >> 2;
            wet[b] -= f;
            wet[i] += f;
          }
        }
      }
      const nx = x + side;
      if (nx >= 0 && nx < W) {
        const k = i + side;
        if (POROUS[type[k]]) {
          const f = ((wet[i] - wet[k]) / 4) | 0;
          wet[i] -= f;
          wet[k] += f;
        }
      }
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
 * straight into whatever is on top in a random column. Plants drink it, soil
 * and sand soak it up, and only where the ground is soaked does it gather
 * into a puddle on the surface.
 */
function condense(w: World): void {
  // A little water escapes all the time, so the glass needs watering now and then.
  // (Half a unit per step for every SCALE: plants, which keep the air moist,
  // have about SCALE times as many cells as at scale 1.)
  const leak = Math.min(w.humidity, (SCALE + (w.rng.nextU32() & 1)) >> 1);
  w.humidity -= leak;
  w.lostWater += leak;
  if (w.humidity < DEW * 4) return;
  // The more water in the air, the more dew.
  const events = Math.min(12 * SCALE, w.humidity >> 8) + (w.rng.below(4) === 0 ? 1 : 0);
  const { type, wet } = w;
  for (let k = 0; k < events && w.humidity >= DEW; k++) {
    const x = w.rng.below(W);
    let i = x;
    while (i < SIZE && type[i] === EMPTY) i += W;
    if (i >= SIZE) continue;
    // Dew on a plant: it drinks it if it is thirsty, otherwise it runs down to the ground.
    if (PLANT_PART[type[i]] && type[i] !== ROOT) {
      const p = w.orgs.get(w.org[i]);
      if (p && p.kind === "plant" && p.water < PLANT_DRINKS_TO) {
        p.water += DEW;
        w.humidity -= DEW;
        continue;
      }
      while (i < SIZE && (type[i] === EMPTY || (PLANT_PART[type[i]] && type[i] !== ROOT))) i += W;
      if (i >= SIZE) continue;
    }
    if (type[i] === WATER) {
      // Dew on open water adds to it, a drop's worth at a time.
      if (w.rng.below(4) === 0 && w.humidity >= WATER_UNITS && i >= W && type[i - W] === EMPTY) {
        setCell(w, i - W, WATER);
        w.humidity -= WATER_UNITS;
      }
      continue;
    }
    if (!POROUS[type[i]]) continue;
    if (wet[i] <= MAX_WET - DEW) {
      wet[i] += DEW;
      w.humidity -= DEW;
    } else if (w.humidity >= WATER_UNITS && i >= W && type[i - W] === EMPTY) {
      // Soaked ground: the dew gathers into a puddle.
      setCell(w, i - W, WATER);
      w.humidity -= WATER_UNITS;
    }
  }
}

/** Advances the glass by one step. */
export function stepWorld(w: World): void {
  // Things fall and flow SCALE cells per step, so they keep their speed
  // in the glass.
  for (let pass = 0; pass < SCALE; pass++) movePass(w, pass);
  if ((w.tick & 1) === 0) spreadMoisture(w);
  // Light changes slowly (as plants grow), so it is worked out every few steps.
  if ((w.tick & 3) === 0) computeLight(w);
  updatePlants(w);
  updateCreatures(w);
  if ((w.tick & 3) === 2) slowPass(w);
  condense(w);
  w.tick++;
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

/** All water in the glass, in moisture units: in cells, in plants and in the air. */
export function totalWater(w: World): number {
  let n = w.humidity;
  for (let i = 0; i < SIZE; i++) {
    if (w.type[i] === WATER) n += WATER_UNITS;
    else if (POROUS[w.type[i]]) n += w.wet[i];
  }
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

export function stepWorldN(w: World, n: number): void {
  for (let k = 0; k < n; k++) stepWorld(w);
}
