/**
 * The fixed forms of the plants. Each plant's full-grown form is made once
 * from its id, so it is the same on every phone; as the plant grows, more of
 * it shows (each part has an order: when it appears, 1–255).
 */

/** What a part of a plant is. */
export const STEM = 1;
export const LEAF = 2;
export const PETAL = 3;
export const CENTER = 4;
export const BERRY = 5;

export type FormKind = "grass" | "flower" | "bush";

export interface Form {
  n: number;
  /** Offsets from the plant's foot (up is negative). */
  dx: Int8Array;
  dy: Int8Array;
  kind: Uint8Array;
  /** 0–3, dark to light: for colours. */
  tone: Uint8Array;
  /** When it shows: a part shows once size / full size × 255 has reached it. */
  order: Uint8Array;
  /** How far it reaches to each side and up, full grown. */
  half: number;
  height: number;
  /** Parts that carry seeds (flower heads, berries). */
  heads: number[];
}

/** A stable random number for a plant and a question k. */
function rand(id: number, k: number): number {
  let h = (Math.imul(id, 0x9e3779b1) + Math.imul(k, 0x85ebca6b)) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Integer square root. */
function isqrt(n: number): number {
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

/** Collects parts; the first part in a cell wins. */
class Builder {
  private seen = new Set<number>();
  dx: number[] = [];
  dy: number[] = [];
  kind: number[] = [];
  tone: number[] = [];
  order: number[] = [];
  heads: number[] = [];

  has(dx: number, dy: number): boolean {
    return this.seen.has((dy + 128) * 256 + dx + 128);
  }

  add(dx: number, dy: number, kind: number, tone: number, order: number): number {
    const key = (dy + 128) * 256 + dx + 128;
    if (this.seen.has(key) || dx < -127 || dx > 127 || dy < -127 || dy > 0) return -1;
    this.seen.add(key);
    this.dx.push(dx);
    this.dy.push(dy);
    this.kind.push(kind);
    this.tone.push(Math.max(0, Math.min(3, tone)));
    this.order.push(Math.max(1, Math.min(255, order | 0)));
    return this.dx.length - 1;
  }

  done(): Form {
    let half = 0;
    let height = 0;
    for (let k = 0; k < this.dx.length; k++) {
      half = Math.max(half, Math.abs(this.dx[k]));
      height = Math.max(height, -this.dy[k]);
    }
    return {
      n: this.dx.length,
      dx: Int8Array.from(this.dx),
      dy: Int8Array.from(this.dy),
      kind: Uint8Array.from(this.kind),
      tone: Uint8Array.from(this.tone),
      order: Uint8Array.from(this.order),
      half,
      height,
      heads: this.heads.filter((k) => k >= 0),
    };
  }
}

/** A tuft of blades, curving outwards, the tallest last to grow. */
function grass(id: number): Form {
  const b = new Builder();
  const n = 5 + (rand(id, 1) % 4);
  const tallest = 14;
  for (let k = 0; k < n; k++) {
    const base = ((2 * k - (n - 1)) * 13) / 20 | 0;
    const h = 6 + (rand(id, 10 + k) % 9);
    const lean = base === 0 ? ((rand(id, 30 + k) & 1) === 0 ? 1 : -1) : Math.sign(base);
    const bend = 3 + (rand(id, 50 + k) % 4);
    for (let row = 0; row < h; row++) {
      const x = base + lean * ((row * row) / (bend * h) | 0);
      b.add(x, -row, LEAF, ((row * 4) / h) | 0, 1 + (row * 254) / tallest);
    }
  }
  return b.done();
}

/** A stem with leaves on alternate sides and a flower on top. */
function flower(id: number): Form {
  const b = new Builder();
  const h = 18 + (rand(id, 1) % 12);
  const sway = (rand(id, 2) & 1) === 0 ? 1 : -1;
  const kink1 = 5 + (rand(id, 3) % 6);
  const kink2 = kink1 + 6 + (rand(id, 4) % 6);
  const xs: number[] = [];
  let x = 0;
  for (let row = 0; row <= h; row++) {
    if (row === kink1) x += sway;
    if (row === kink2) x -= sway;
    xs.push(x);
    if (row < h) b.add(x, -row, STEM, ((row * 3) / h) | 0, 1 + (row * 200) / h);
  }
  let side = (rand(id, 5) & 1) === 0 ? 1 : -1;
  for (let row = 3 + (rand(id, 6) % 2); row < h - 5; row += 4 + (rand(id, 7 + row) % 2)) {
    const o = 10 + (row * 200) / h;
    const sx = xs[row];
    b.add(sx + side, -row, LEAF, 1, o);
    b.add(sx + 2 * side, -row - 1, LEAF, 2, o + 4);
    b.add(sx + 3 * side, -row - 1, LEAF, 3, o + 8);
    side = -side;
  }
  // The head.
  const hx = xs[h];
  b.heads.push(b.add(hx, -h, CENTER, 2, 225));
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(hx + dx, -h + dy, PETAL, 2, 238);
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2]]) b.add(hx + dx, -h + dy, PETAL, 3, 250);
  return b.done();
}

/** Steps to the side (or up) on step `len` of a line that takes `a` eighths of one each step. */
function slant(len: number, a: number): number {
  return (((len + 1) * a + 4) >> 3) - ((len * a + 4) >> 3);
}

/**
 * A bush: woody stems fanning out from its foot, branching, under a round
 * dome of leaves with berries in it. It grows from the foot outwards.
 */
function bush(id: number): Form {
  const b = new Builder();
  const rx = 20 + (rand(id, 1) % 6);
  const ry = 16 + (rand(id, 2) % 5);
  const whole = rx * rx * ry * ry;
  /** How far out in the dome, 0 at the foot to 100 at the edge. */
  const far = (dx: number, dy: number) => isqrt(((dx * dx * ry * ry + dy * dy * rx * rx) * 10000) / whole);

  // Stems: one walk per stem, slanting by `lean` eighths (0 up, 8 at 45°, 12 out and a little up).
  // Where each first stem is a little way out, a young bush has its first leaves.
  const early: [number, number, number][] = [];
  const walk = (x: number, y: number, lean: number, stop: number, k: number) => {
    const side = Math.sign(lean);
    const a = Math.abs(lean);
    for (let len = 0; len < 60; len++) {
      if (a <= 8) {
        y -= 1;
        x += side * slant(len, a);
      } else {
        x += side;
        y -= slant(len, 16 - a);
      }
      const d = far(x, y);
      if (d > stop || y > 0) return;
      b.add(x, y, STEM, d < 30 ? 0 : 1, (d * 255) / 100);
      if (k <= 9 && len === 2) early.push([x, y, (d * 255) / 100 + 2]);
      // Now and then a branch, out and up.
      if (len > 4 && rand(id, k * 100 + len) % 9 === 0) walk(x, y, a >= 6 ? lean - side * 4 : lean + (side || 1) * 4, stop, k * 7 + len);
    }
  };
  b.add(0, 0, STEM, 0, 1);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) b.add(dx, dy, STEM, 0, 4);
  const n = 5 + (rand(id, 3) % 3);
  for (let k = 0; k < n; k++) {
    const lean = -11 + (((22 * k + ((n - 1) >> 1)) / (n - 1)) | 0) + ((rand(id, 20 + k) % 3) - 1);
    walk(0, 0, lean, 82, k + 1);
  }

  for (const [x, y, o] of early) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]]) b.add(x + dx, y + dy, LEAF, 2, o);
  // Leaves fill the outer part of the dome, in clumps; the middle is bare stems.
  for (let dy = -ry; dy <= 0; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const d = far(dx, dy);
      if (d > 100 || d < 40 || b.has(dx, dy)) continue;
      const noise = rand(id, 1000 + (dy + 64) * 256 + dx + 128) & 255;
      const clump = rand(id, 5000 + ((dy + 64) >> 2) * 64 + ((dx + 128) >> 2)) & 255;
      if (noise > 110 + (clump >> 1) + (d > 75 ? 20 : 0)) continue;
      const order = (d * 255) / 100;
      if (d > 55 && (noise & 31) === 3) b.heads.push(b.add(dx, dy, BERRY, 2, Math.max(order, 235)));
      else b.add(dx, dy, LEAF, (noise >> 3) & 3, order);
    }
  }
  return b.done();
}

const cache = new Map<number, Form>();

/** A plant's full-grown form. The same for the same id and form, everywhere. */
export function formOf(kind: FormKind, id: number): Form {
  const key = id * 4 + (kind === "grass" ? 0 : kind === "flower" ? 1 : 2);
  let f = cache.get(key);
  if (!f) {
    if (cache.size > 4000) cache.clear();
    f = kind === "grass" ? grass(id) : kind === "flower" ? flower(id) : bush(id);
    cache.set(key, f);
  }
  return f;
}
