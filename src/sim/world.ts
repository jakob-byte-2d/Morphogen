import { ABSORB, EMPTY, FIELD_CAPACITY, POROUS, POWDER, SOIL, WATER } from "./cells";
import { updateCreatures, type Creature } from "./creatures";
import { slowPass, updatePlants, type Plant } from "./plants";
import { Rng } from "./rng";
import { CREATURE_SPECIES, PLANT_SPECIES, type CreatureSpecies, type PlantSpecies } from "./species";

import { H, SIZE, W } from "./dims";

export { H, SIZE, TICKS_PER_SECOND, W } from "./dims";

/**
 * Bump this whenever the rules change on purpose, and update the golden hash
 * in src/sim/golden.ts.
 */
export const SIM_VERSION = 3;

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
  /** Organism a living cell belongs to (0 = none). */
  readonly org: Uint16Array;
  /** Light reaching each cell, 0–255. Recomputed every step. */
  readonly light: Uint8Array;
  /** Step in which a cell last moved, so nothing moves twice in one step. */
  readonly stamp: Uint32Array;
  /** Chunks to check this step, and chunks woken for the next step. */
  awake: Uint8Array;
  wakeNext: Uint8Array;
  /**
   * Water in the air, in moisture units. Plants breathe it out; it condenses
   * under the lid and drips back down.
   */
  humidity: number;
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
    plantSpecies: plantSpecies.map((p) => ({ ...p, colors: { ...p.colors } })),
    plants: [],
    creatureSpecies: creatureSpecies.map((c) => ({ ...c })),
    creatures: [],
    orgs: new Map(),
    nextOrgId: 1,
  };
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
 * Moisture spreads through soil and sand: sideways and upwards a little,
 * downwards whatever the soil cannot hold against gravity.
 */
function spreadMoisture(w: World): void {
  const { type, wet } = w;
  // Runs every other step; alternate the side it shares with each time.
  const side = (w.tick & 2) === 0 ? 1 : -1;
  for (let y = H - 1; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!POROUS[type[i]]) continue;
      if (y < H - 1) {
        const b = i + W;
        if (POROUS[type[b]]) {
          const excess = wet[i] - FIELD_CAPACITY[type[i]];
          const room = MAX_WET - wet[b];
          if (excess > 0 && room > 0) {
            const f = Math.min(room, (excess + 3) >> 2);
            wet[i] -= f;
            wet[b] += f;
          } else if (wet[b] > wet[i] + 16) {
            // Capillary rise: dry soil draws water up from below.
            const f = (wet[b] - wet[i]) >> 3;
            wet[b] -= f;
            wet[i] += f;
          }
        }
      }
      const nx = x + side;
      if (nx >= 0 && nx < W) {
        const k = i + side;
        if (POROUS[type[k]]) {
          const f = ((wet[i] - wet[k]) / 8) | 0;
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

/** Water in the air gathers under the lid and falls as a drop now and then. */
function condense(w: World): void {
  if (w.humidity < WATER_UNITS * 4) return;
  // The more water in the air, the more often it drips.
  const drops = Math.min(3, (w.humidity / 800) | 0) + (w.rng.below(4) === 0 ? 1 : 0);
  for (let k = 0; k < drops; k++) {
    const x = 1 + w.rng.below(W - 2);
    if (w.type[x] !== EMPTY) continue;
    setCell(w, x, WATER);
    w.humidity -= WATER_UNITS;
  }
}

/** Advances the glass by one step. */
export function stepWorld(w: World): void {
  const mark = w.tick + 1;
  const { type, stamp } = w;
  const awake = w.wakeNext;
  w.wakeNext = w.awake;
  w.awake = awake;
  if (w.tick % WAKE_ALL_EVERY === 0) awake.fill(1);
  w.wakeNext.fill(0);
  for (let y = H - 1; y >= 0; y--) {
    const row = ((y / CHUNK) | 0) * CHUNKS_X;
    const leftToRight = ((y + w.tick) & 1) === 0;
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
    }
  }
  if ((w.tick & 1) === 0) spreadMoisture(w);
  computeLight(w);
  updatePlants(w);
  updateCreatures(w);
  if ((w.tick & 3) === 2) slowPass(w);
  condense(w);
  w.tick++;
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
