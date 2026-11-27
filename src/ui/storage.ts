import { loadWorld, saveWorld, type World } from "../sim";

/** Its own key: the first version, on the same site, keeps its glass. */
const GLASS_KEY = "morphogen2.glass";

/** Saves the glass in the browser, with the time, so time can pass while the app is closed. */
export function storeGlass(w: World): void {
  try {
    localStorage.setItem(GLASS_KEY, JSON.stringify({ savedAt: Date.now(), glass: saveWorld(w) }));
  } catch {
    // Storage full or blocked: the glass just is not kept.
  }
}

export function restoreGlass(): { world: World; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(GLASS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const world = loadWorld(data.glass);
    const savedAt = typeof data.savedAt === "number" ? data.savedAt : Date.now();
    return world ? { world, savedAt } : null;
  } catch {
    return null;
  }
}

export function forgetGlass(): void {
  try {
    localStorage.removeItem(GLASS_KEY);
  } catch {
    // Nothing to forget.
  }
}
