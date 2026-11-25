/** How a plant grows. Everything a player can design about a plant is here. */
export type PlantForm = "grass" | "flower" | "bush";

export interface PlantSpecies {
  name: string;
  form: PlantForm;
  /** Tallest shoot, in cells. */
  height: number;
  /** How readily shoots branch, 0–3. */
  branches: number;
  /** How leafy, 0–3. */
  leaves: number;
  /** How deep the roots go, in cells. */
  rootDepth: number;
  /** Seconds a plant lives. (Plants now live on as long as they have water and light; kept for old species.) */
  lifespan: number;
  /** Base colours; the renderer varies them cell by cell. */
  colors: { leaf: string; stem: string; flower: string; seed: string };
  /** The genes its first plants get (see genes.ts): growth and seed 1–5, mutation 0–5. */
  traits: { growth: number; seed: number; mutation: number };
}

/** The middle of every trait, and a little mutation. */
const PLANT_TRAITS = { growth: 3, seed: 3, mutation: 1 };
const CREATURE_TRAITS = { size: 3, speed: 3, growth: 3, mutation: 1 };

export const PLANT_SPECIES: PlantSpecies[] = [
  {
    name: "Gress",
    form: "grass",
    height: 9,
    branches: 2,
    leaves: 0,
    rootDepth: 6,
    lifespan: 420,
    colors: { leaf: "#4f8a3a", stem: "#3f6e32", flower: "#c9b46a", seed: "#a08c48" },
    traits: { ...PLANT_TRAITS },
  },
  {
    name: "Blomst",
    form: "flower",
    height: 20,
    branches: 0,
    leaves: 2,
    rootDepth: 10,
    lifespan: 540,
    colors: { leaf: "#4a7c3a", stem: "#3a6a32", flower: "#e7a0b0", seed: "#b8894a" },
    traits: { ...PLANT_TRAITS },
  },
  {
    name: "Busk",
    form: "bush",
    height: 24,
    branches: 2,
    leaves: 3,
    rootDepth: 14,
    lifespan: 1500,
    colors: { leaf: "#4f7c3e", stem: "#4a3428", flower: "#c97a8a", seed: "#8a5a3a" },
    traits: { ...PLANT_TRAITS },
  },
];

const FORMS: PlantForm[] = ["grass", "flower", "bush"];
const HEX = /^#[0-9a-f]{6}$/i;

function int(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : def;
  return Math.min(max, Math.max(min, n));
}

function color(v: unknown, def: string): string {
  return typeof v === "string" && HEX.test(v) ? v.toLowerCase() : def;
}

/** Species can come from other players: always pass them through this. */
export function normalizePlantSpecies(raw: unknown): PlantSpecies {
  const d = PLANT_SPECIES[1];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const c = (o.colors && typeof o.colors === "object" ? o.colors : {}) as Record<string, unknown>;
  const tr = (o.traits && typeof o.traits === "object" ? o.traits : {}) as Record<string, unknown>;
  return {
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 24) : d.name,
    form: FORMS.includes(o.form as PlantForm) ? (o.form as PlantForm) : d.form,
    height: int(o.height, d.height, 3, 40),
    branches: int(o.branches, d.branches, 0, 3),
    leaves: int(o.leaves, d.leaves, 0, 3),
    rootDepth: int(o.rootDepth, d.rootDepth, 3, 20),
    lifespan: int(o.lifespan, d.lifespan, 60, 3600),
    colors: {
      leaf: color(c.leaf, d.colors.leaf),
      stem: color(c.stem, d.colors.stem),
      flower: color(c.flower, d.colors.flower),
      seed: color(c.seed, d.colors.seed),
    },
    traits: {
      growth: int(tr.growth, PLANT_TRAITS.growth, 1, 5),
      seed: int(tr.seed, PLANT_TRAITS.seed, 1, 5),
      mutation: int(tr.mutation, PLANT_TRAITS.mutation, 0, 5),
    },
  };
}

/**
 * All creatures are plant eaters of one kind: skrukketroll-like specks that
 * crawl about the ground eating fallen leaves (never living plants), and
 * feed the soil with their droppings. The field is kept so species keep
 * their shape; there were plant eaters, worms and slime once.
 */
export type Diet = "litter";

export interface CreatureSpecies {
  name: string;
  diet: Diet;
  color: string;
  /** The genes its first creatures get (see genes.ts): size, speed and growth 1–5, mutation 0–5. */
  traits: { size: number; speed: number; growth: number; mutation: number };
}

export const CREATURE_SPECIES: CreatureSpecies[] = [
  { name: "Skrukketroll", diet: "litter", color: "#8c8e96", traits: { ...CREATURE_TRAITS } },
];

export function normalizeCreatureSpecies(raw: unknown): CreatureSpecies {
  const d = CREATURE_SPECIES[0];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tr = (o.traits && typeof o.traits === "object" ? o.traits : {}) as Record<string, unknown>;
  return {
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 24) : d.name,
    // Whatever it ate before (plants, waste, creatures), it eats dead leaves now.
    diet: "litter",
    color: color(o.color, d.color),
    traits: {
      size: int(tr.size, CREATURE_TRAITS.size, 1, 5),
      speed: int(tr.speed, CREATURE_TRAITS.speed, 1, 5),
      growth: int(tr.growth, CREATURE_TRAITS.growth, 1, 5),
      mutation: int(tr.mutation, CREATURE_TRAITS.mutation, 0, 5),
    },
  };
}
