import { SIZE, SOIL, totalWater, WASTE, type World } from "../sim";

/** One look at the glass, taken every half minute of glass time. */
export interface Sample {
  tick: number;
  plants: number[];
  creatures: number[];
  water: number;
  soilFood: number;
  waste: number;
}

export interface History {
  samples: Sample[];
  /** Oldest plant ever seen, in plant updates. */
  oldestPlant: number;
  biggestPopulation: number;
}

const KEY = "morphogen.history";
const MAX_SAMPLES = 120;
export const SAMPLE_EVERY = 300;

export function emptyHistory(): History {
  return { samples: [], oldestPlant: 0, biggestPopulation: 0 };
}

export function loadHistory(): History {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && Array.isArray(raw.samples)) return raw as History;
  } catch {
    // Start afresh.
  }
  return emptyHistory();
}

export function saveHistory(h: History): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    // Not kept; fine.
  }
}

export function forgetHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}

export function sample(w: World): Sample {
  let soilFood = 0;
  let waste = 0;
  for (let i = 0; i < SIZE; i++) {
    const t = w.type[i];
    if (t === SOIL) soilFood += w.food[i];
    else if (t === WASTE) waste++;
  }
  const plants = w.plantSpecies.map(() => 0);
  for (const p of w.plants) plants[p.species]++;
  const creatures = w.creatureSpecies.map(() => 0);
  for (const c of w.creatures) creatures[c.species]++;
  return { tick: w.tick, plants, creatures, water: totalWater(w), soilFood, waste };
}

export function record(h: History, w: World): void {
  const s = sample(w);
  h.samples.push(s);
  if (h.samples.length > MAX_SAMPLES) h.samples.shift();
  for (const p of w.plants) h.oldestPlant = Math.max(h.oldestPlant, p.age);
  h.biggestPopulation = Math.max(h.biggestPopulation, w.creatures.length);
}
