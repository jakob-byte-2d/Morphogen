/** Tiny pixel-art icons, 11 × 10, drawn on canvases. */
export interface Icon {
  c: Record<string, string>;
  r: string[];
}

const INK = "#e9dfe6";

export const ICONS: Record<string, Icon> = {
  water: {
    c: { b: "#2f6fd6", l: "#5aa7ff", w: "#dff0ff" },
    r: ["     b     ", "    blb    ", "   blllb   ", "  blllllb  ", " bwllllllb ", " bwllllllb ", " blllllllb ", "  blllllb  ", "   bbbbb   "],
  },
  soil: {
    c: { h: "#b07a4c", m: "#8a5a35", d: "#5b3a22" },
    r: ["    hhh    ", "   hmmmm   ", "  hmmdmmm  ", " hmmmmmdmm ", "hmdmmmmmmmd", "ddddddddddd"],
  },
  seed: {
    c: { g: "#62c13d", G: "#3d8a26", s: "#d1a25a", S: "#8f6a32" },
    r: [" gg     gg ", "gggG   Gggg", " ggGG GGgg ", "     G     ", "     G     ", "    sss    ", "   sssSs   ", "   ssSSs   ", "    sSS    "],
  },
  creature: {
    c: { k: INK, r: "#e0503c", w: "#ffffff" },
    r: ["   k   k   ", "    kkk    ", "   kwkwk   ", " k rrkrr k ", "  rrrkrrr  ", " krkrkrkrk ", "  rrrkrrr  ", " k rrkrr k ", "    rrr    "],
  },
  feed: {
    c: { y: "#f5c24c", Y: "#d98f2b", o: "#9fc4dc", O: "#6f9cbc" },
    r: ["  y    y   ", "     Y   y ", "  Y  y     ", " yYyYyYyYy ", "OOOOOOOOOOO", " ooooooooo ", "  ooooooo  "],
  },
  spade: {
    c: { h: "#a06a3a", m: "#d3dae0", M: "#8c96a0" },
    r: ["   hhhhh   ", "     h     ", "     h     ", "     h     ", "    MMM    ", "   mmmmM   ", "   mmmmM   ", "   mmmmM   ", "    mmM    ", "     m     "],
  },
};

/** Plant icons by form. Letters are colour roles filled in from the species. */
const PLANT_ICONS: Record<string, string[]> = {
  grass: ["    l      ", " l  l   l  ", " l  Ll  l  ", " ll L l ll ", "  l L l l  ", "  lLL Ll l ", " LlL LLlLl ", "LLLLLLLLLLL", "ddddddddddd"],
  flower: ["    PpP    ", "   PpcpP   ", "    PpP    ", "     S     ", "   llS     ", "     S     ", "     Sll   ", "     S     ", "ddddddddddd"],
  bush: ["   lLl     ", "  lLLLll   ", " lLLlLLLl  ", " LLLLLlLLl ", "  lLLSLLl  ", "   LS SL   ", "     S     ", "     S     ", "ddddddddddd"],
};

export function plantIcon(form: string, colors: { leaf: string; stem: string; flower: string }, light: (c: string) => string, dark: (c: string) => string): Icon {
  return {
    c: {
      L: colors.leaf,
      l: light(colors.leaf),
      S: colors.stem,
      p: colors.flower,
      P: dark(colors.flower),
      c: "#ffd84a",
      d: "#5a4236",
    },
    r: PLANT_ICONS[form] ?? PLANT_ICONS.flower,
  };
}

/** Creature icons by diet, coloured from the species. */
const CREATURE_ICONS: Record<string, string[]> = {
  plants: ["           ", "   k   k   ", "    k k    ", "   aaaaa   ", "  aAaaaaa  ", " kaaaaaaak ", "  aaaaaaa  ", " k aaaaa k "],
  creatures: ["           ", "    yyy    ", "  yhyyYyy  ", " yhyyyyyYy ", "yyyyYyyyyyy", "YyyyyyyYyyY", " YYYyyYYY  "],
};

export function creatureIcon(diet: string, color: string, light: (c: string) => string, dark: (c: string) => string): Icon {
  return {
    c: { a: color, A: dark(color), y: color, Y: dark(color), h: light(color), k: INK },
    r: CREATURE_ICONS[diet] ?? CREATURE_ICONS.plants,
  };
}

/** Makes a canvas showing an icon; scale it up with CSS. */
export function iconCanvas(icon: Icon): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 11;
  c.height = 10;
  const ctx = c.getContext("2d")!;
  const off = Math.floor((10 - icon.r.length) / 2);
  icon.r.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = icon.c[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y + off, 1, 1);
    }
  });
  c.setAttribute("aria-hidden", "true");
  return c;
}
