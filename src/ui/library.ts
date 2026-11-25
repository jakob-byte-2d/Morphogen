import type { CreatureSpecies, PlantSpecies } from "../sim";

/** Species the player has made, kept so new glasses get them too. */
export interface Library {
  plants: PlantSpecies[];
  creatures: CreatureSpecies[];
}

const KEY = "morphogen.mySpecies";

export function loadLibrary(): Library {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      plants: Array.isArray(raw.plants) ? raw.plants : [],
      // Creatures made before, whatever they ate, eat dead leaves now (see normalizeCreatureSpecies).
      creatures: Array.isArray(raw.creatures) ? raw.creatures : [],
    };
  } catch {
    return { plants: [], creatures: [] };
  }
}

export function saveLibrary(lib: Library): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(lib));
  } catch {
    // Not kept; fine.
  }
}
