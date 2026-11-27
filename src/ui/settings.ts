/** The player's settings, kept in the browser. */
export interface Settings {
  vibration: boolean;
  /** Let time pass (catch up) while the app is closed. */
  timeAway: boolean;
  devMode: boolean;
}

const KEY = "morphogen2.settings";
const DEFAULTS: Settings = { vibration: true, timeAway: true, devMode: false };

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      vibration: typeof raw.vibration === "boolean" ? raw.vibration : DEFAULTS.vibration,
      timeAway: typeof raw.timeAway === "boolean" ? raw.timeAway : DEFAULTS.timeAway,
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
