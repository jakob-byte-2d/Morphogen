import type { CreatureSpecies, PlantSpecies } from "./species";
import type { World } from "./world";

/**
 * Genes: what every plant and creature carries and passes on. A species
 * gives its first individuals their genes; after that each one inherits from
 * its parent, now and then with one trait a notch up or down (a mutation).
 * Traits run from 1 to 5 (3 is the middle); mutation runs from 0 (exact
 * copies) to 5. Tint is a small shift in colour that drifts with every
 * mutation, so lines of descent can be told apart.
 */
export interface PlantGenes {
  /** How fast it grows; faster costs more energy per cell. */
  growth: number;
  /** Few big seeds (5) or many small ones (1). */
  seed: number;
  mutation: number;
  tint: number;
}

export interface CreatureGenes {
  /** How big it gets before it breeds or splits: few big young (5) or many small (1). */
  size: number;
  /** How far it moves; faster costs much more energy. */
  speed: number;
  /** How fast food becomes body; faster gets less out of each meal. */
  growth: number;
  mutation: number;
  tint: number;
}

export const TRAIT_MIN = 1;
export const TRAIT_MAX = 5;
export const MUTATION_MAX = 5;
export const TINT_MAX = 15;

export function clampTrait(v: number, min = TRAIT_MIN, max = TRAIT_MAX): number {
  return v < min ? min : v > max ? max : v;
}

export function plantGenesOf(sp: PlantSpecies): PlantGenes {
  return { growth: sp.traits.growth, seed: sp.traits.seed, mutation: sp.traits.mutation, tint: 0 };
}

export function creatureGenesOf(sp: CreatureSpecies): CreatureGenes {
  return { size: sp.traits.size, speed: sp.traits.speed, growth: sp.traits.growth, mutation: sp.traits.mutation, tint: 0 };
}

/** The chance of a mutation is mutation in 10 per birth. */
function mutates(w: World, mutation: number): boolean {
  return w.rng.below(10) < mutation;
}

function nudge(w: World): number {
  return w.rng.below(2) === 0 ? -1 : 1;
}

function drift(w: World, tint: number): number {
  return clampTrait(tint + nudge(w) * (1 + w.rng.below(2)), -TINT_MAX, TINT_MAX);
}

/** A seed's genes: the parent's, maybe with one trait changed. */
export function inheritPlant(w: World, g: PlantGenes): PlantGenes {
  const c = { ...g };
  if (!mutates(w, g.mutation)) return c;
  const k = w.rng.below(3);
  const d = nudge(w);
  if (k === 0) c.growth = clampTrait(c.growth + d);
  else if (k === 1) c.seed = clampTrait(c.seed + d);
  else c.mutation = clampTrait(c.mutation + d, 0, MUTATION_MAX);
  c.tint = drift(w, c.tint);
  return c;
}

/** A young creature's genes: the parent's, maybe with one trait changed. */
export function inheritCreature(w: World, g: CreatureGenes): CreatureGenes {
  const c = { ...g };
  if (!mutates(w, g.mutation)) return c;
  const k = w.rng.below(4);
  const d = nudge(w);
  if (k === 0) c.size = clampTrait(c.size + d);
  else if (k === 1) c.speed = clampTrait(c.speed + d);
  else if (k === 2) c.growth = clampTrait(c.growth + d);
  else c.mutation = clampTrait(c.mutation + d, 0, MUTATION_MAX);
  c.tint = drift(w, c.tint);
  return c;
}

/**
 * A seed is a single cell with no organism yet, so its genes are packed into
 * the cell's org slot. The top bit marks them; organism ids stay below it
 * (see MAX_ORG_ID), so the two can never be mixed up.
 */
export const SEED_GENES = 0x8000;
export const MAX_ORG_ID = SEED_GENES - 1;

export function packSeed(g: PlantGenes): number {
  return SEED_GENES | g.growth | (g.seed << 3) | (g.mutation << 6) | ((g.tint + 16) << 9);
}

/** The genes in a seed cell's org slot, or `fallback` for a seed without any. */
export function unpackSeed(v: number, fallback: PlantGenes): PlantGenes {
  if ((v & SEED_GENES) === 0) return { ...fallback };
  return {
    growth: clampTrait(v & 7),
    seed: clampTrait((v >> 3) & 7),
    mutation: clampTrait((v >> 6) & 7, 0, MUTATION_MAX),
    tint: clampTrait(((v >> 9) & 31) - 16, -TINT_MAX, TINT_MAX),
  };
}

/** Reads genes from saved data, which may be damaged or from someone else. */
export function cleanPlantGenes(raw: unknown, fallback: PlantGenes): PlantGenes {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown, d: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? clampTrait(Math.trunc(v), min, max) : d;
  return {
    growth: n(o.growth, fallback.growth, TRAIT_MIN, TRAIT_MAX),
    seed: n(o.seed, fallback.seed, TRAIT_MIN, TRAIT_MAX),
    mutation: n(o.mutation, fallback.mutation, 0, MUTATION_MAX),
    tint: n(o.tint, 0, -TINT_MAX, TINT_MAX),
  };
}

export function cleanCreatureGenes(raw: unknown, fallback: CreatureGenes): CreatureGenes {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown, d: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? clampTrait(Math.trunc(v), min, max) : d;
  return {
    size: n(o.size, fallback.size, TRAIT_MIN, TRAIT_MAX),
    speed: n(o.speed, fallback.speed, TRAIT_MIN, TRAIT_MAX),
    growth: n(o.growth, fallback.growth, TRAIT_MIN, TRAIT_MAX),
    mutation: n(o.mutation, fallback.mutation, 0, MUTATION_MAX),
    tint: n(o.tint, 0, -TINT_MAX, TINT_MAX),
  };
}

/**
 * Energy a creature spends on moving, per four updates, by speed. Speed 3
 * costs 4; going faster costs a lot more.
 */
export const SPEED_COST = [2, 3, 4, 6, 9];

/** Spends base × SPEED_COST / 4 energy, the fraction spread over updates by age. */
export function upkeep(base: number, speed: number, age: number): number {
  const q = base * SPEED_COST[speed - 1];
  return (q >> 2) + ((age & 3) < (q & 3) ? 1 : 0);
}
