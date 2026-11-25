import { FEED, FUNGUS, MAX_TYPES, ROOT, SAND, SOIL, STONE, WASTE, WATER } from "../sim/cells";

/** Colours per cell type. Each cell picks one by its shade, then varies it a little. */
export const COLORS: Partial<Record<number, string[]>> = {
  [STONE]: ["#3c5a6a", "#4a6878", "#33464f", "#5a5058", "#4f4450"],
  [SAND]: ["#7d695c", "#8a7466", "#6f5d52", "#958070"],
  [SOIL]: ["#2e2630", "#352a33", "#3d3036", "#2a2229", "#33282f"],
  [WATER]: ["#3f6f8a", "#4f84a0", "#46789a"],
  [ROOT]: ["#8a7458", "#7a6650", "#968062", "#6e5c48"],
  [WASTE]: ["#3a2e26", "#463628", "#2e241e", "#4a3a2c", "#52402e"],
  [FEED]: ["#e0a060", "#c88850", "#d89a58", "#eab070"],
  [FUNGUS]: ["#e2d4c4", "#d6c8b4", "#cbbca6", "#eadfd0"],
};

/** Mushroom caps: fungus cells with open air above. */
export const CAPS = ["#c97a4e", "#b8693f", "#d98a5a", "#a85c38"];

/** What a thirsty plant fades towards. */
export const WILTED = "#a8924a";

export const DRY_SOIL = ["#55484a", "#625455", "#4d4043"];
export const SOIL_SPECKS = ["#5a5058", "#4a3a48", "#6b6270", "#4f4450"];
/** The top of the soil: moss where it is moist, purple and grey where it is dry. */
export const MOSS = ["#4e7a3c", "#5f8a44", "#3f6a3a"];
export const BARE_TOP = ["#6a4a72", "#7c5a86", "#77727c", "#5a4a5e"];
export const WATER_TOP = "#9cc8d8";
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
 * A 256-entry colour table for a list of colours: shade picks a colour and
 * nudges its brightness, so neighbouring cells never look exactly alike.
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

export const TABLES: (Uint8ClampedArray | null)[] = Array.from({ length: MAX_TYPES }, (_, t) => {
  const c = COLORS[t];
  return c ? shadeTable(c) : null;
});
export const DRY_TABLE = shadeTable(DRY_SOIL);
export const SPECK_TABLE = shadeTable(SOIL_SPECKS);
export const MOSS_TABLE = shadeTable(MOSS);
export const BARE_TABLE = shadeTable(BARE_TOP);

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function toHex(c: [number, number, number]): string {
  return "#" + c.map((v) => clamp(v).toString(16).padStart(2, "0")).join("");
}

/** A colour, a lighter and a darker version, and one shifted a little in hue. */
export function variants(hex: string): string[] {
  const [r, g, b] = hexToRgb(hex);
  return [
    hex,
    toHex([r * 1.18, g * 1.18, b * 1.18]),
    toHex([r * 0.82, g * 0.82, b * 0.82]),
    toHex([r * 1.05 + 8, g * 0.97, b * 0.92]),
  ];
}

export function lighten(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex([r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k]);
}

export function darken(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex([r * (1 - k), g * (1 - k), b * (1 - k)]);
}
