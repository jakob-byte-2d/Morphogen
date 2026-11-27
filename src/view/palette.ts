/** Colours. Each cell picks one from a list by a stable noise, then varies it a little. */
export const STONE_COLORS = ["#3c5a6a", "#4a6878", "#33464f", "#5a5058", "#4f4450"];
export const SOIL_COLORS = ["#2e2630", "#352a33", "#3d3036", "#2a2229", "#33282f"];
export const DRY_SOIL = ["#55484a", "#625455", "#4d4043"];
export const SOIL_SPECKS = ["#5a5058", "#4a3a48", "#6b6270", "#4f4450"];
/** The top of the soil: moss where it is moist, purple and grey where it is dry. */
export const MOSS = ["#4e7a3c", "#5f8a44", "#3f6a3a"];
export const BARE_TOP = ["#6a4a72", "#7c5a86", "#77727c", "#5a4a5e"];
export const WATER = ["#3f6f8a", "#4f84a0", "#46789a"];
export const WATER_TOP = "#9cc8d8";
/** Dead leaves: brown litter. */
export const LITTER = ["#6b4f2e", "#7d5d34", "#5c4428", "#8a6a3c", "#4e3a24"];
export const DROP = "#9fd0ff";
/** What a thirsty plant fades towards. */
export const WILTED = "#a8924a";
export const DUST = ["#f0d8d0", "#ffffff", "#e8c0b0"];

/** The world behind the glass: soft shapes, drawn tiny and blurred. */
export const BACKDROP_BASE = "#a8443c";
export const BACKDROP_BLOBS: [number, number, number, number, string, number][] = [
  [9, 13, 11, 9, "#c85a50", 0.9],
  [7, 8, 6, 3, "#d97a6a", 0.6],
  [15, 4, 3.5, 2.6, "#e09060", 0.9],
  [16.5, 8.5, 2.6, 2.1, "#d98058", 0.85],
  [0, 0, 6, 6, "#3a2236", 0.85],
  [18, 22, 6, 9, "#4a2a40", 0.6],
  [1, 21, 5, 6, "#7a4a64", 0.55],
  [9, 31, 15, 7, "#2a1d25", 0.85],
  [4, 3, 3, 2, "#d7748a", 0.5],
];

export function hexToRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/**
 * A 256-entry colour table for a list of colours: a noise value picks a
 * colour and nudges its brightness, so neighbouring cells never look alike.
 */
export function shadeTable(colors: string[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  const rgb = colors.map(hexToRgb);
  for (let s = 0; s < 256; s++) {
    const c = rgb[s % rgb.length];
    const k = 1 + (((s >> 3) & 31) - 16) * 0.012;
    lut[s * 3] = c[0] * k;
    lut[s * 3 + 1] = c[1] * k;
    lut[s * 3 + 2] = c[2] * k;
  }
  return lut;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function toHex(c: [number, number, number]): string {
  return "#" + c.map((v) => clamp(v).toString(16).padStart(2, "0")).join("");
}

export function lighten(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex([r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k]);
}

export function darken(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex([r * (1 - k), g * (1 - k), b * (1 - k)]);
}
