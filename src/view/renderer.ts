import { APHID, EMPTY, FLOWER, FUNGUS, LEAF, PLANT_PART, POROUS, ROOT, SAND, SEED, SLIME, SOIL, STEM, STONE, WATER } from "../sim/cells";
import { SEED_GENES } from "../sim/genes";
import { THIRST_LIMIT } from "../sim/plants";
import { H, SATURATED, SCALE, SIZE, W, type World } from "../sim/world";
import type { Camera } from "./camera";
import {
  BACKDROP_BASE,
  BACKDROP_BLOBS,
  BARE_TABLE,
  CAPS,
  DRY_TABLE,
  DUST,
  hexToRgb,
  MOSS_TABLE,
  shadeTable,
  SPECK_TABLE,
  TABLES,
  variants,
  WATER_TOP,
  WILTED,
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

/** How ground below the groundwater table is darkened, per channel. */
const SOAKED = [0.9, 0.93, 1.04];

/** Colour shift per step of a gene tint: warmer one way, cooler the other. */
const TINT = 6;

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
  private caps = shadeTable(CAPS);
  private wilted = hexToRgb(WILTED);
  /** Colour tables per species and plant part, made when first needed. */
  private speciesTables = new Map<number, Uint8ClampedArray>();
  private sparkles: { i: number; life: number }[] = [];
  /** Where condensed droplets sit on the glass: x and y as parts of the glass. */
  private droplets = Array.from({ length: 70 }, (_, k) => [hash(k, 3) / 255, (hash(k, 11) / 255) ** 2]);
  /** Developer view: moisture, nutrients or light laid over the glass. */
  overlay: "none" | "wet" | "food" | "light" = "none";
  private overlayCanvas = document.createElement("canvas");
  private overlayImage = new ImageData(W, H);

  constructor(
    readonly el: HTMLElement,
    private camera: Camera,
  ) {
    this.backdrop.className = "backdrop";
    this.backdrop.width = 18;
    this.backdrop.height = 32;
    this.screen.className = "screen";
    for (const c of [this.lightCanvas, this.cellCanvas, this.overlayCanvas]) {
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
        vx: (Math.random() - 0.5) * 0.4 * SCALE,
        vy: (Math.random() - 0.5) * 0.25 * SCALE,
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
    this.drawMist(ctx, w);
    if (this.overlay !== "none") {
      this.drawOverlay(w);
      ctx.drawImage(this.overlayCanvas, sx, sy, sw, sh, 0, 0, this.screen.width, this.screen.height);
    }
  }

  /**
   * Moist air shows as a faint haze and still droplets on the glass near the
   * top. Only a picture: the water itself is counted in w.humidity.
   */
  private drawMist(ctx: CanvasRenderingContext2D, w: World): void {
    const a = Math.min(0.5, Math.max(0, (w.humidity - 150) / 1500));
    if (a <= 0.01) return;
    const cam = this.camera;
    const k = this.screen.width / cam.width;
    const s = cam.scale * k;
    const x0 = cam.offsetX * k;
    const y0 = cam.offsetY * k;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + H * 0.35 * s);
    g.addColorStop(0, `rgba(240, 226, 232, ${(0.35 * a).toFixed(3)})`);
    g.addColorStop(1, "rgba(240, 226, 232, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, W * s, H * 0.35 * s);
    ctx.fillStyle = `rgba(250, 240, 245, ${(0.8 * a).toFixed(3)})`;
    const r = Math.max(1, s * 0.3 * SCALE);
    for (const [dx, dy] of this.droplets) {
      // Fewer droplets further down, where the glass is warmer.
      if (dy > a * 1.6) continue;
      ctx.fillRect(x0 + dx * W * s, y0 + dy * H * 0.3 * s, r, r);
    }
  }

  private drawOverlay(w: World): void {
    const d = this.overlayImage.data;
    for (let i = 0; i < SIZE; i++) {
      const o = i * 4;
      const t = w.type[i];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      if (this.overlay === "wet") {
        if (POROUS[t]) [r, g, b, a] = [60, 140, 255, (w.wet[i] / 255) * 230];
        else if (t === WATER) [r, g, b, a] = [60, 140, 255, 230];
      } else if (this.overlay === "food") {
        if (w.food[i] > 0) [r, g, b, a] = [190, 240, 80, Math.min(1, w.food[i] / 10) * 230];
      } else {
        const l = w.light[i] / 255;
        [r, g, b, a] = l > 0.5 ? [255, 250, 210, (l - 0.5) * 300] : [0, 0, 0, (0.5 - l) * 300];
      }
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = a;
    }
    this.overlayCanvas.getContext("2d")!.putImageData(this.overlayImage, 0, 0);
  }

  /** A picture of the glass as it looks now, backdrop included. */
  snapshot(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = this.screen.width;
    c.height = this.screen.height;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.backdrop, 0, 0, c.width, c.height);
    ctx.drawImage(this.screen, 0, 0);
    return c;
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
          if (wet[i] >= SATURATED) {
            // Soaked through: the groundwater shows as darker, cooler ground.
            r *= SOAKED[0];
            g *= SOAKED[1];
            b *= SOAKED[2];
          }
        } else if (t === SEED || t === STEM || t === LEAF || t === FLOWER) {
          const tab = this.speciesTable(w, w.kind[i], t);
          r = tab[s * 3];
          g = tab[s * 3 + 1];
          b = tab[s * 3 + 2];
          if (t === SEED) {
            const v = w.org[i];
            if (v & SEED_GENES) {
              const tint = ((v >> 9) & 31) - 16;
              r += tint * TINT;
              b -= tint * TINT;
            }
          } else {
            const p = w.orgs.get(w.org[i]);
            if (p && p.kind === "plant") {
              // Each line of descent drifts a little in colour.
              r += p.genes.tint * TINT;
              b -= p.genes.tint * TINT;
              // Thirsty plants fade towards straw yellow.
              if (p.thirst > 0) {
                const f = Math.min(0.85, p.thirst / THIRST_LIMIT);
                r += (this.wilted[0] - r) * f;
                g += (this.wilted[1] - g) * f;
                b += (this.wilted[2] - b) * f;
              }
            }
            // Soft edges: cells with open air on several sides are see-through.
            let open = 0;
            if (x > 0 && type[i - 1] === EMPTY) open++;
            if (x < W - 1 && type[i + 1] === EMPTY) open++;
            if (above === EMPTY) open++;
            if (open >= 2) a = 170 + (s & 63);
          }
        } else if (t === FUNGUS && above === EMPTY) {
          r = this.caps[s * 3];
          g = this.caps[s * 3 + 1];
          b = this.caps[s * 3 + 2];
        } else if (t === APHID || t === SLIME) {
          const tab = this.creatureTable(w, w.kind[i]);
          r = tab[s * 3];
          g = tab[s * 3 + 1];
          b = tab[s * 3 + 2];
          const c = w.orgs.get(w.org[i]);
          if (c && c.kind === "creature") {
            r += c.genes.tint * TINT;
            b -= c.genes.tint * TINT;
          }
          if (t === SLIME) {
            // A soft, glistening mass: lighter on top, see-through at the edges.
            if (above !== SLIME) {
              r += (255 - r) * 0.25;
              g += (255 - g) * 0.25;
              b += (255 - b) * 0.2;
              a = 175 + (s & 63);
            }
          } else a = 235;
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
          else if (t === SAND && wet[i] >= SATURATED) {
            r *= SOAKED[0];
            g *= SOAKED[1];
            b *= SOAKED[2];
          } else if (t === SAND && POROUS[t] && wet[i] > 120) {
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
    this.drawSparkles(w, d, dt);
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

  private speciesTable(w: World, kind: number, type: number): Uint8ClampedArray {
    const key = kind * 32 + type;
    let tab = this.speciesTables.get(key);
    if (!tab) {
      const c = w.plantSpecies[kind]?.colors ?? w.plantSpecies[0].colors;
      const base = type === SEED ? c.seed : type === STEM ? c.stem : type === LEAF ? c.leaf : c.flower;
      tab = shadeTable(variants(base));
      this.speciesTables.set(key, tab);
    }
    return tab;
  }

  private creatureTable(w: World, kind: number): Uint8ClampedArray {
    const key = 100000 + kind;
    let tab = this.speciesTables.get(key);
    if (!tab) {
      tab = shadeTable(variants(w.creatureSpecies[kind]?.color ?? "#b8d86a"));
      this.speciesTables.set(key, tab);
    }
    return tab;
  }

  /** Healthy plants glitter now and then. */
  private drawSparkles(w: World, d: Uint8ClampedArray, dt: number): void {
    if (w.plants.length > 0 && Math.random() < dt * 2.5) {
      const p = w.plants[Math.floor(Math.random() * w.plants.length)];
      const c = p.cells[Math.floor(Math.random() * p.cells.length)];
      if (p.thirst === 0 && p.water > 30 && c !== undefined && PLANT_PART[w.type[c]] && w.type[c] !== ROOT) {
        const spot = [c - W, c - 1, c + 1][Math.floor(Math.random() * 3)];
        if (spot >= 0 && w.type[spot] === EMPTY) this.sparkles.push({ i: spot, life: 0.6 });
      }
    }
    for (const sp of this.sparkles) {
      sp.life -= dt;
      if (sp.life <= 0 || w.type[sp.i] !== EMPTY) continue;
      const o = sp.i * 4;
      const a = Math.sin((sp.life / 0.6) * Math.PI);
      d[o] = 255;
      d[o + 1] = 246;
      d[o + 2] = 214;
      d[o + 3] = 230 * a;
    }
    this.sparkles = this.sparkles.filter((sp) => sp.life > 0);
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
        // Shafts keep their width in the glass however fine the cells are.
        const band = (ray / SCALE) | 0;
        const shimmer = 0.85 + 0.15 * Math.sin(time * 0.3 + band * 0.7);
        const shade = 0.6 * (1 - l);
        const shine = 0.32 * l * this.shafts[band] * shimmer * fade;
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
