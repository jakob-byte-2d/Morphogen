import {
  BERRY,
  canSprout,
  CENTER,
  EMPTY,
  formOf,
  H,
  heapHeight,
  LEAF,
  PETAL,
  PLANTS,
  SKRUKKETROLL,
  SOIL,
  STEM,
  STONE,
  W,
  waterLine,
  WILTS,
  type Animal,
  type World,
} from "../sim";
import type { Camera } from "./camera";
import {
  BACKDROP_BASE,
  BACKDROP_BLOBS,
  BARE_TOP,
  darken,
  DROP,
  DRY_SOIL,
  DUST,
  hexToRgb,
  lighten,
  LITTER,
  MOSS,
  shadeTable,
  SOIL_COLORS,
  SOIL_SPECKS,
  STONE_COLORS,
  WATER,
  WATER_TOP,
  WILTED,
} from "./palette";

/** Stable per-position noise for the view, 0–255. */
function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) & 255;
}

const SOIL_T = shadeTable(SOIL_COLORS);
const DRY_T = shadeTable(DRY_SOIL);
const SPECK_T = shadeTable(SOIL_SPECKS);
const MOSS_T = shadeTable(MOSS);
const BARE_T = shadeTable(BARE_TOP);
const STONE_T = shadeTable(STONE_COLORS);
const WATER_T = shadeTable(WATER);
const LITTER_T = shadeTable(LITTER);
const WATER_TOP_RGB = hexToRgb(WATER_TOP);
const DROP_RGB = hexToRgb(DROP);
const WILTED_RGB = hexToRgb(WILTED);

/** Plant colours per species: [kind][tone] → rgb. */
const PLANT_RGB = PLANTS.map((sp) => {
  const c = sp.colors;
  const four = (hex: string) => [darken(hex, 0.3), darken(hex, 0.12), hex, lighten(hex, 0.18)].map(hexToRgb);
  const rows: [number, number, number][][] = [];
  rows[STEM] = sp.form === "bush" ? [darken(c.stem, 0.35), c.stem, darken(c.leaf, 0.35), darken(c.leaf, 0.2)].map(hexToRgb) : four(c.stem);
  rows[LEAF] = four(c.leaf);
  rows[PETAL] = four(c.petal);
  rows[CENTER] = four(c.center);
  rows[BERRY] = four(c.petal);
  return { rows, seed: hexToRgb(c.seed), root: hexToRgb(lighten(c.stem, 0.35)) };
});
const BUG = [darken(SKRUKKETROLL.color, 0.35), SKRUKKETROLL.color, lighten(SKRUKKETROLL.color, 0.25)].map(hexToRgb);

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  c: [number, number, number];
}

/** Where a skrukketroll is shown: it strolls about its spot in the glass between life steps. */
interface Shown {
  x: number;
  y: number;
  seen: number;
}

/**
 * Draws the glass layer by layer: a blurred backdrop, then ground, water,
 * dead leaves, plants, seeds, drops and animals, crisp, and dust on top.
 * Reads the world, never changes it.
 */
export class Renderer {
  private backdrop = document.createElement("canvas");
  private screen = document.createElement("canvas");
  private cellCanvas = document.createElement("canvas");
  private image = new ImageData(W, H);
  private motes: Mote[] = [];
  private lastLayout = "";
  private shown = new Map<number, Shown>();
  private frame = 0;
  /** The animal under the magnifying glass, or 0. */
  selected = 0;

  constructor(
    readonly el: HTMLElement,
    private camera: Camera,
  ) {
    this.backdrop.className = "backdrop";
    this.backdrop.width = 18;
    this.backdrop.height = 32;
    this.screen.className = "screen";
    this.cellCanvas.width = W;
    this.cellCanvas.height = H;
    el.append(this.backdrop, this.screen);
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
    for (let k = 0; k < 46; k++) {
      this.motes.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.7,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.5,
        a: 0.12 + Math.random() * 0.3,
        c: hexToRgb(DUST[k % DUST.length]),
      });
    }
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
    const bx = Math.min(0, Math.max(cam.width - bw, cam.width / 2 - (cam.cx / W) * bw));
    const by = Math.min(0, Math.max(cam.height - bh, cam.height / 2 - (cam.cy / H) * bh));
    this.backdrop.style.width = `${bw}px`;
    this.backdrop.style.height = `${bh}px`;
    this.backdrop.style.transform = `translate(${bx}px, ${by}px)`;
    this.backdrop.style.filter = `blur(${(cam.width * 0.06).toFixed(1)}px)`;
  }

  /** Where an animal is shown now (cells), for the magnifying glass. */
  shownAt(a: Animal): { x: number; y: number } {
    const s = this.shown.get(a.id);
    return s ? { x: s.x, y: s.y } : { x: a.x, y: 0 };
  }

  draw(w: World, time: number, dt: number): void {
    this.frame++;
    this.layout();
    const d = this.image.data;
    const line = waterLine(w);
    this.drawGround(w, d, line);
    this.drawLitter(w, d, line);
    this.drawPlants(w, d, line);
    this.drawSeeds(w, d, time);
    for (const p of w.drops) this.put(d, p.x, p.y, DROP_RGB, 230);
    this.drawAnimals(w, d, line, dt);
    // Dust drifting in the air.
    for (const m of this.motes) {
      m.x = (m.x + m.vx * dt + W) % W;
      m.y += m.vy * dt;
      if (m.y < 0 || m.y >= H) m.vy = -m.vy;
      const x = m.x | 0;
      const y = Math.min(H - 1, Math.max(0, m.y | 0));
      if (w.ground[y * W + x] !== EMPTY || y >= line) continue;
      const o = (y * W + x) * 4;
      const a = m.a * (0.6 + 0.4 * Math.sin(time * 0.7 + m.x));
      d[o] = d[o] * (1 - a) + m.c[0] * a;
      d[o + 1] = d[o + 1] * (1 - a) + m.c[1] * a;
      d[o + 2] = d[o + 2] * (1 - a) + m.c[2] * a;
      d[o + 3] = Math.max(d[o + 3], a * 255);
    }
    this.cellCanvas.getContext("2d")!.putImageData(this.image, 0, 0);

    const cam = this.camera;
    const s = cam.scale;
    const sx = -cam.offsetX / s;
    const sy = -cam.offsetY / s;
    const sw = cam.width / s;
    const sh = cam.height / s;
    const ctx = this.screen.getContext("2d")!;
    ctx.clearRect(0, 0, this.screen.width, this.screen.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.cellCanvas, sx, sy, sw, sh, 0, 0, this.screen.width, this.screen.height);
    const sel = this.selected ? this.shown.get(this.selected) : undefined;
    if (sel) {
      // A soft ring round the animal under the magnifying glass.
      const px = this.screen.width / sw;
      const cx = (sel.x + 0.5 - sx) * px;
      const cy = (sel.y + 0.5 - sy) * px;
      const r = Math.max(10 * devicePixelRatio, 4 * px) * (1 + 0.08 * Math.sin(time * 4));
      ctx.strokeStyle = "rgba(255, 240, 220, 0.9)";
      ctx.lineWidth = 1.5 * devicePixelRatio;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private put(d: Uint8ClampedArray, x: number, y: number, c: ArrayLike<number>, a = 255): void {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const o = (y * W + x) * 4;
    d[o] = c[0];
    d[o + 1] = c[1];
    d[o + 2] = c[2];
    d[o + 3] = a;
  }

  /** Ground and water: moss and dark soil near the water, lighter dry soil far above it, pond below the line. */
  private drawGround(w: World, d: Uint8ClampedArray, line: number): void {
    const g = w.ground;
    for (let y = 0; y < H; y++) {
      const moist = Math.max(0, Math.min(1, 1 - (line - 20 - y) / 20));
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const o = i * 4;
        const t = g[i];
        const s = hash(x, y);
        if (t === EMPTY) {
          if (y >= line) {
            const c = y === line ? WATER_TOP_RGB : [WATER_T[s * 3], WATER_T[s * 3 + 1], WATER_T[s * 3 + 2]];
            d[o] = c[0];
            d[o + 1] = c[1];
            d[o + 2] = c[2];
            d[o + 3] = y === line ? 190 : 215;
          } else if (y === w.top[x] - 1 && s < 60) {
            // Frayed edges: a few loose bits of the surface just above the ground.
            const tab = moist > 0.5 ? MOSS_T : BARE_T;
            d[o] = tab[s * 3];
            d[o + 1] = tab[s * 3 + 1];
            d[o + 2] = tab[s * 3 + 2];
            d[o + 3] = 140;
          } else d[o + 3] = 0;
          continue;
        }
        let r: number;
        let gg: number;
        let b: number;
        if (t === STONE) {
          r = STONE_T[s * 3];
          gg = STONE_T[s * 3 + 1];
          b = STONE_T[s * 3 + 2];
        } else if (y === w.top[x] && (s & 3) !== 0 && y < line) {
          const tab = moist > 0.5 ? MOSS_T : BARE_T;
          r = tab[s * 3];
          gg = tab[s * 3 + 1];
          b = tab[s * 3 + 2];
        } else if (s < 18) {
          r = SPECK_T[s * 3];
          gg = SPECK_T[s * 3 + 1];
          b = SPECK_T[s * 3 + 2];
        } else {
          // Dry soil is lighter; it darkens near the water.
          const m = 0.25 + 0.75 * moist;
          r = DRY_T[s * 3] * (1 - m) + SOIL_T[s * 3] * m;
          gg = DRY_T[s * 3 + 1] * (1 - m) + SOIL_T[s * 3 + 1] * m;
          b = DRY_T[s * 3 + 2] * (1 - m) + SOIL_T[s * 3 + 2] * m;
        }
        if (t === SOIL && y >= line) {
          // Soaked: darker and cooler.
          r *= 0.88;
          gg *= 0.92;
          b *= 1.05;
        }
        d[o] = r;
        d[o + 1] = gg;
        d[o + 2] = b;
        d[o + 3] = 255;
      }
    }
  }

  /** Dead leaves: a little heap on the ground in each column, as high as there are leaves. */
  private drawLitter(w: World, d: Uint8ClampedArray, line: number): void {
    for (let x = 0; x < W; x++) {
      const n = w.litter[x];
      if (n === 0) continue;
      const h = heapHeight(n);
      for (let k = 0; k < h; k++) {
        const y = w.top[x] - 1 - k;
        if (y < 0) break;
        const s = hash(x * 7 + 3, y);
        // The top of the heap is ragged.
        if (k === h - 1 && h > 1 && (s & 1) === 0) continue;
        const under = y >= line;
        this.put(d, x, y, [LITTER_T[s * 3] * (under ? 0.75 : 1), LITTER_T[s * 3 + 1] * (under ? 0.8 : 1), LITTER_T[s * 3 + 2] * (under ? 1 : 1)]);
      }
    }
  }

  /** Plants: as much of each one's fixed form as it has grown, faded if thirsty. */
  private drawPlants(w: World, d: Uint8ClampedArray, line: number): void {
    for (const p of w.plants) {
      const sp = PLANTS[p.species];
      const f = formOf(sp.form, p.id);
      const shows = Math.max(14, ((p.size * 255) / sp.full) | 0);
      const fade = Math.min(0.8, p.thirst / (WILTS * 4));
      const rgb = PLANT_RGB[p.species].rows;
      // The pale shoot from where the seed lay up to the surface.
      for (let y = p.y + 1; y <= p.root; y++) if (w.ground[y * W + p.x] !== EMPTY) this.put(d, p.x, y, PLANT_RGB[p.species].root, 200);
      for (let k = 0; k < f.n; k++) {
        if (f.order[k] > shows) continue;
        const x = p.x + f.dx[k];
        const y = p.y + f.dy[k];
        if (x < 0 || x >= W || y < 0 || y >= H || w.ground[y * W + x] !== EMPTY) continue;
        const c = rgb[f.kind[k]][f.tone[k]];
        let r = c[0];
        let g = c[1];
        let b = c[2];
        if (fade > 0 && f.kind[k] !== STEM) {
          r += (WILTED_RGB[0] - r) * fade;
          g += (WILTED_RGB[1] - g) * fade;
          b += (WILTED_RGB[2] - b) * fade;
        }
        if (y >= line) {
          r *= 0.7;
          g *= 0.85;
          b = b * 0.9 + 30;
        }
        this.put(d, x, y, [r, g, b]);
      }
    }
  }

  /** Seeds; one that can sprout where it lies blinks softly green. */
  private drawSeeds(w: World, d: Uint8ClampedArray, time: number): void {
    for (const s of w.seeds) {
      let [r, g, b] = PLANT_RGB[s.species].seed;
      if (canSprout(w, s)) {
        const f = 0.35 + 0.35 * Math.sin(time * 4);
        r += (150 - r) * f;
        g += (255 - g) * f;
        b += (120 - b) * f;
      }
      this.put(d, s.x, s.y, [r, g, b]);
    }
  }

  /**
   * Skrukketroll: little grey bugs. Between life steps each strolls about its
   * spot (only a picture: the glass moves them every five minutes); one just
   * let go falls to the ground first.
   */
  private drawAnimals(w: World, d: Uint8ClampedArray, line: number, dt: number): void {
    const t = performance.now() / 1000;
    for (const a of w.animals) {
      let s = this.shown.get(a.id);
      if (!s) {
        s = { x: a.x, y: a.dropY ?? w.top[a.x] - 1, seen: 0 };
        this.shown.set(a.id, s);
      }
      s.seen = this.frame;
      // Stroll: towards a spot that wanders slowly round where it really is, as far as it can walk.
      const hungry = a.energy < 300;
      const wander = Math.round(4 * Math.sin(t * 0.13 + a.id * 1.7) + 2 * Math.sin(t * 0.31 + a.id));
      let goal = a.x;
      const dir = Math.sign(wander);
      for (let k = 0; k < Math.abs(wander); k++) {
        const n = goal + dir;
        if (n < 0 || n >= W || Math.abs(w.top[n] - w.top[goal]) > 3 || w.top[n] - 1 >= line) break;
        goal = n;
      }
      const speed = hungry ? 3 : 1.2;
      const step = Math.min(Math.abs(goal - s.x), speed * dt);
      const facing = goal > s.x ? 1 : goal < s.x ? -1 : a.dir;
      s.x += Math.sign(goal - s.x) * step;
      const cx = Math.max(0, Math.min(W - 1, Math.round(s.x)));
      const ground = w.top[cx] - 1;
      s.y = s.y < ground ? Math.min(ground, s.y + 60 * dt) : ground;
      const y = Math.round(s.y);
      // Body three cells long with a rounded back, head forward.
      this.put(d, cx - 1, y, BUG[0]);
      this.put(d, cx, y, BUG[1]);
      this.put(d, cx + 1, y, BUG[0]);
      this.put(d, cx - facing, y - 1, BUG[1]);
      this.put(d, cx, y - 1, BUG[2]);
      this.put(d, cx + 2 * facing, y, BUG[0], 200);
    }
    // Forget animals that are gone.
    for (const [id, s] of this.shown) if (s.seen !== this.frame) this.shown.delete(id);
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
}
