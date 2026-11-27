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
    c: { a: "#9a9ca4", A: "#5c5e66", h: "#c4c6ce", k: INK },
    r: ["           ", "           ", "    hhhh   ", "k  haAaAa  ", " kaAaAaAaa ", " aAaAaAaAaa", "  k k k k  "],
  },
  look: {
    c: { f: "#d8d2c8", g: "#7fb8e0", h: "#e8f6ff", d: "#a06a3a" },
    r: ["  fffff    ", " fhhgggf   ", " fhggggf   ", " fgggggf   ", " fgggggf   ", "  fffff    ", "      dd   ", "       dd  ", "        dd "],
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

export function plantIcon(form: string, colors: { leaf: string; stem: string; petal: string; center: string }, light: (c: string) => string, dark: (c: string) => string): Icon {
  return {
    c: {
      L: colors.leaf,
      l: light(colors.leaf),
      S: colors.stem,
      p: colors.petal,
      P: dark(colors.petal),
      c: colors.center,
      d: "#5a4236",
    },
    r: PLANT_ICONS[form] ?? PLANT_ICONS.flower,
  };
}

/** The skrukketroll's icon. */
const BUG_ICON = ["           ", "           ", "    hhhh   ", "k  haAaAa  ", " kaAaAaAaa ", " aAaAaAaAaa", "  k k k k  "];

export function creatureIcon(color: string, light: (c: string) => string, dark: (c: string) => string): Icon {
  return { c: { a: color, A: dark(color), h: light(color), k: INK }, r: BUG_ICON };
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
