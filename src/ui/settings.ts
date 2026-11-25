/** The player's settings, kept in the browser. */
export interface Settings {
  vibration: boolean;
  /** Let time pass (catch up) while the app is closed. */
  timeAway: boolean;
  /** Normal speed: 1, 2 or 4. */
  speed: number;
  devMode: boolean;
}

const KEY = "morphogen.settings";
const DEFAULTS: Settings = { vibration: true, timeAway: true, speed: 1, devMode: false };

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      vibration: typeof raw.vibration === "boolean" ? raw.vibration : DEFAULTS.vibration,
      timeAway: typeof raw.timeAway === "boolean" ? raw.timeAway : DEFAULTS.timeAway,
      speed: [1, 2, 4].includes(raw.speed) ? raw.speed : DEFAULTS.speed,
      devMode: raw.devMode === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not kept; fine.
  }
}
