import { EMPTY, POROUS, SAND, SOIL, STONE, WATER } from "../sim/cells";
import { H, SIZE, W, type World } from "../sim/world";
import type { Camera } from "./camera";
import {
  BACKDROP_BASE,
  BACKDROP_BLOBS,
  BARE_TABLE,
  DRY_TABLE,
  DUST,
  hexToRgb,
  MOSS_TABLE,
  SPECK_TABLE,
  TABLES,
  WATER_TOP,
} from "./palette";

/** Stable per-position noise for the renderer, 0–255. */
function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) & 255;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  c: [number, number, number];
}

const SOLID = new Uint8Array(32);
SOLID[STONE] = 1;
SOLID[SAND] = 1;
SOLID[SOIL] = 1;

/**
 * Draws the glass in three layers: a blurred backdrop, soft light and
 * shadow, and the cells on top, crisp. Reads the world, never changes it.
 */
export class Renderer {
  private backdrop = document.createElement("canvas");
  /** What the player sees: the visible part of the light and cell layers, scaled up. */
  private screen = document.createElement("canvas");
  private lightCanvas = document.createElement("canvas");
  private cellCanvas = document.createElement("canvas");
  private lightImage: ImageData;
  private cellImage: ImageData;
  private motes: Mote[] = [];
  private lastLayout = "";
  private shafts = new Float32Array(W + H);
  private top = new Uint8Array(SIZE);
  private waterTop = hexToRgb(WATER_TOP);

  constructor(
    readonly el: HTMLElement,
    private camera: Camera,
  ) {
    this.backdrop.className = "backdrop";
    this.backdrop.width = 18;
    this.backdrop.height = 32;
    this.screen.className = "screen";
    for (const c of [this.lightCanvas, this.cellCanvas]) {
      c.width = W;
      c.height = H;
    }
    el.append(this.backdrop, this.screen);
    this.lightImage = new ImageData(W, H);
    this.cellImage = new ImageData(W, H);
    this.drawBackdrop();
    for (let k = 0; k < this.shafts.length; k++) this.shafts[k] = 0.25 + 0.75 * (hash(k, 7) / 255) ** 1.5;
    for (let k = 0; k < 46; k++) {
      this.motes.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.7,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.25,
        a: 0.12 + Math.random() * 0.3,
        c: hexToRgb(DUST[k % DUST.length]),
      });
    }
  }

  private drawBackdrop(): void {
    const ctx = this.backdrop.getContext("2d")!;
    ctx.fillStyle = BACKDROP_BASE;
    ctx.fillRect(0, 0, 18, 32);
    for (const [x, y, rx, ry, col, a] of BACKDROP_BLOBS) {
      ctx.globalAlpha = a;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Sizes the screen canvas and places the backdrop. Cheap when nothing changed. */
  private layout(): void {
    const cam = this.camera;
    const key = `${cam.width}|${cam.height}|${cam.zoom.toFixed(3)}|${cam.cx.toFixed(2)}|${cam.cy.toFixed(2)}`;
    if (key === this.lastLayout) return;
    this.lastLayout = key;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const sw = Math.round(cam.width * dpr);
    const sh = Math.round(cam.height * dpr);
    if (this.screen.width !== sw || this.screen.height !== sh) {
      this.screen.width = sw;
      this.screen.height = sh;
      this.screen.style.width = `${cam.width}px`;
      this.screen.style.height = `${cam.height}px`;
    }
    // The backdrop zooms much less than the glass, so it feels far away.
    const bz = 1 + Math.min(0.6, (cam.zoom - 1) * 0.1);
    const bw = cam.width * bz * 1.08;
    const bh = cam.height * bz * 1.08;
    const fx = cam.cx / W;
    const fy = cam.cy / H;
    const bx = Math.min(0, Math.max(cam.width - bw, cam.width / 2 - fx * bw));
    const by = Math.min(0, Math.max(cam.height - bh, cam.height / 2 - fy * bh));
    this.backdrop.style.width = `${bw}px`;
    this.backdrop.style.height = `${bh}px`;
    this.backdrop.style.transform = `translate(${bx}px, ${by}px)`;
    this.backdrop.style.filter = `blur(${(cam.width * 0.06).toFixed(1)}px)`;
  }

  draw(w: World, time: number, dt: number): void {
    this.layout();
    this.drawCells(w, dt);
    this.drawLight(w, time);
    // Copy the visible part of each layer onto the screen: light smoothly,
    // so shadows are soft, and cells crisp.
    const cam = this.camera;
    const s = cam.scale;
    const sx = -cam.offsetX / s;
    const sy = -cam.offsetY / s;
    const sw = cam.width / s;
    const sh = cam.height / s;
    const ctx = this.screen.getContext("2d")!;
    ctx.clearRect(0, 0, this.screen.width, this.screen.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.lightCanvas, sx, sy, sw, sh, 0, 0, this.screen.width, this.screen.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.cellCanvas, sx, sy, sw, sh, 0, 0, this.screen.width, this.screen.height);
  }

  private drawCells(w: World, dt: number): void {
    const { type, shade, wet, light } = w;
    const d = this.cellImage.data;
    const top = this.top;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const t = type[i];
        const o = i * 4;
        const above = y > 0 ? type[i - W] : EMPTY;
        top[i] = above === EMPTY || (above === WATER && t !== WATER) ? 1 : 0;
        if (t === EMPTY) {
          // Frayed edges: a few loose bits of the surface just above the ground.
          const below = y < H - 1 ? type[i + W] : EMPTY;
          const below2 = y < H - 2 ? type[i + 2 * W] : EMPTY;
          const h = hash(x, y);
          if (SOLID[below] && h < 70) this.surfaceColor(d, o, w, i + W, h, 150);
          else if (SOLID[below2] && h < 22) this.surfaceColor(d, o, w, i + 2 * W, h, 80);
          else d[o + 3] = 0;
          continue;
        }
        const s = shade[i];
        const l = light[i] / 255;
        let r: number, g: number, b: number;
        let a = 255;
        if (t === SOIL) {
          if (top[i] && (s & 3) !== 0) {
            const tab = wet[i] > 70 ? MOSS_TABLE : BARE_TABLE;
            r = tab[s * 3];
            g = tab[s * 3 + 1];
            b = tab[s * 3 + 2];
          } else if (s < 18) {
            r = SPECK_TABLE[s * 3];
            g = SPECK_TABLE[s * 3 + 1];
            b = SPECK_TABLE[s * 3 + 2];
          } else {
            // Dry soil is lighter; it darkens as it takes up water.
            const m = Math.min(1, wet[i] / 150);
            const tab = TABLES[SOIL]!;
            r = DRY_TABLE[s * 3] * (1 - m) + tab[s * 3] * m;
            g = DRY_TABLE[s * 3 + 1] * (1 - m) + tab[s * 3 + 1] * m;
            b = DRY_TABLE[s * 3 + 2] * (1 - m) + tab[s * 3 + 2] * m;
          }
        } else if (t === WATER && top[i] && y < H - 1 && type[i + W] !== EMPTY) {
          [r, g, b] = this.waterTop;
          a = 170;
        } else {
          const tab = TABLES[t];
          if (!tab) {
            d[o + 3] = 0;
            continue;
          }
          r = tab[s * 3];
          g = tab[s * 3 + 1];
          b = tab[s * 3 + 2];
          if (t === WATER) a = 215;
          else if (t === SAND && POROUS[t] && wet[i] > 120) {
            r *= 0.85;
            g *= 0.85;
            b *= 0.85;
          }
        }
        const k = SOLID[t] ? 0.8 + 0.3 * l : 0.6 + 0.5 * l;
        d[o] = r * k;
        d[o + 1] = g * k;
        d[o + 2] = b * k;
        d[o + 3] = a;
      }
    }
    // Dust drifting in the air.
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x < 0) m.x += W;
      if (m.x >= W) m.x -= W;
      if (m.y < 0 || m.y >= H) m.vy = -m.vy;
      const xi = m.x | 0;
      const yi = Math.min(H - 1, Math.max(0, m.y | 0));
      const i = yi * W + xi;
      if (type[i] !== EMPTY) continue;
      const o = i * 4;
      const lit = 0.4 + 0.6 * (light[i] / 255);
      d[o] = m.c[0];
      d[o + 1] = m.c[1];
      d[o + 2] = m.c[2];
      d[o + 3] = 255 * m.a * lit;
    }
    this.cellCanvas.getContext("2d")!.putImageData(this.cellImage, 0, 0);
  }

  private surfaceColor(d: Uint8ClampedArray, o: number, w: World, ground: number, h: number, alpha: number): void {
    const tab = w.wet[ground] > 70 ? MOSS_TABLE : BARE_TABLE;
    const k = 0.7 + 0.4 * (w.light[ground] / 255);
    d[o] = tab[h * 3] * k;
    d[o + 1] = tab[h * 3 + 1] * k;
    d[o + 2] = tab[h * 3 + 2] * k;
    d[o + 3] = alpha;
  }

  /** Warm shafts of light, and soft shadows where something blocks it. */
  private drawLight(w: World, time: number): void {
    const { type, light } = w;
    const d = this.lightImage.data;
    const off = Math.ceil(H / 3);
    for (let y = 0; y < H; y++) {
      const fade = 1 - (0.5 * y) / H;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const o = i * 4;
        const t = type[i];
        if (t !== EMPTY && t !== WATER) {
          d[o + 3] = 0;
          continue;
        }
        const ray = x - ((y / 3) | 0) + off;
        const l = light[i] / 255;
        const shimmer = 0.85 + 0.15 * Math.sin(time * 0.3 + ray * 0.7);
        const shade = 0.6 * (1 - l);
        const shine = 0.32 * l * this.shafts[ray] * shimmer * fade;
        if (shade > shine) {
          d[o] = 24;
          d[o + 1] = 12;
          d[o + 2] = 26;
          d[o + 3] = shade * 255;
        } else {
          d[o] = 255;
          d[o + 1] = 236;
          d[o + 2] = 200;
          d[o + 3] = shine * 255;
        }
      }
    }
    this.lightCanvas.getContext("2d")!.putImageData(this.lightImage, 0, 0);
  }
}
