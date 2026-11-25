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
    const creatures = Array.isArray(raw.creatures) ? raw.creatures : [];
    return {
      plants: Array.isArray(raw.plants) ? raw.plants : [],
      // Waste eaters (worms) are no more; leave out any made before.
      creatures: creatures.filter((c: { diet?: unknown }) => c && c.diet !== "waste"),
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
