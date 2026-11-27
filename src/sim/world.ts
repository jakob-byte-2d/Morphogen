import { H, SIZE, W } from "./dims";
import { Rng } from "./rng";

/**
 * The glass is a few layers on top of each other, each with its own short
 * rules (one file each):
 *
 * - ground: a grid of air, soil and stone (ground.ts)
 * - water: one number, the water line; below it, air is pond and soil is wet (water.ts)
 * - litter: dead leaves lying on the ground, a count per column (litter.ts)
 * - plants and seeds: lists; each plant has a fixed form that grows (plants.ts, forms.ts)
 * - animals: a list of skrukketroll walking on the ground (animals.ts)
 */

/** Ground cells. */
export const EMPTY = 0;
export const SOIL = 1;
export const STONE = 2;

/** A drop of water on its way down from the watering can. */
export interface Drop {
  x: number;
  y: number;
}

export interface Seed {
  id: number;
  species: number;
  x: number;
  y: number;
  /** Life steps it has lain somewhere it can sprout. */
  ready: number;
  /** Life steps it has lain at all. */
  age: number;
}

export interface Plant {
  id: number;
  species: number;
  /** Its foot: the cell just above the ground it grows from. */
  x: number;
  y: number;
  /** Life steps lived. */
  age: number;
  /** How far grown, from 0 to its species' full size. */
  size: number;
  /** Life steps with water since it last grew. */
  grow: number;
  /** Life steps without water (it wilts, and in the end dies). */
  thirst: number;
  /** Life steps it lives, if nothing kills it first. */
  life: number;
}

export interface Animal {
  id: number;
  /** Its column; it always stands on the ground there. */
  x: number;
  /** Which way it is walking: -1 or 1. */
  dir: number;
  age: number;
  life: number;
  energy: number;
  mother: number;
  young: number;
  dead: boolean;
  starved: boolean;
  /** Where it was let go, for the view to show it falling (not saved). */
  dropY?: number;
}

export interface World {
  seed: number;
  rng: Rng;
  /** Fast steps since the glass was made. */
  tick: number;
  /** Life steps since the glass was made. */
  life: number;
  nextId: number;
  ground: Uint8Array;
  /** The highest ground cell in each column (H if none). Kept up to date by the ground layer. */
  top: Int16Array;
  /** Nothing in the ground is falling. */
  settled: boolean;
  /** The water line, in 1/256 rows from the top. */
  waterLine: number;
  drops: Drop[];
  litter: Uint8Array;
  seeds: Seed[];
  plants: Plant[];
  animals: Animal[];
}

export function emptyWorld(seed: number): World {
  return {
    seed,
    rng: new Rng(seed),
    tick: 0,
    life: 0,
    nextId: 1,
    ground: new Uint8Array(SIZE),
    top: new Int16Array(W).fill(H),
    settled: true,
    waterLine: H * 256,
    drops: [],
    litter: new Uint8Array(W),
    seeds: [],
    plants: [],
    animals: [],
  };
}

export function newId(w: World): number {
  return w.nextId++;
}
