import { SpatialGrid } from "./grid";
import { HALF_PI, TWO_PI, cos, sin, sqrt } from "./fmath";
import { Rng } from "./rng";

/**
 * Bump this whenever the simulation rules change on purpose. Matches and
 * replays store the engine version, so results from different rule sets are
 * never mixed. Remember to update the golden hash in tests/determinism.test.ts.
 */
export const ENGINE_VERSION = 1;

/** Fixed simulation time step in seconds. Never vary this at runtime. */
export const DT = 1 / 30;

export interface Environment {
  /** Radius of the petri dish. */
  dishRadius: number;
  /** New food particles per second. */
  foodPerSecond: number;
  maxFood: number;
  /** Mass a cell gains from one food particle. */
  foodMass: number;
  /** Random push food gets every tick (makes it drift like plankton). */
  foodKick: number;
  /** Food velocity multiplier per tick. */
  foodDamping: number;
  /** Mass every cell burns per second. */
  metabolism: number;
  /** A cell divides when it reaches this mass. */
  splitMass: number;
  /** A cell dies below this mass. */
  minMass: number;
  /** Speed the two daughter cells get when a cell divides. */
  splitSpeed: number;
  /** How hard overlapping cells push each other apart. */
  stiffness: number;
  /** Velocity multiplier per tick (1 = no friction). */
  drag: number;
}

export const DEFAULT_ENVIRONMENT: Environment = {
  dishRadius: 300,
  foodPerSecond: 25,
  maxFood: 1000,
  foodMass: 12,
  foodKick: 0.5,
  foodDamping: 0.9,
  metabolism: 1.5,
  splitMass: 200,
  minMass: 40,
  splitSpeed: 30,
  stiffness: 18,
  drag: 0.85,
};

/** Cell types. Only one so far; more arrive in phase 2. */
export type CellType = "eater";
export const CELL_TYPES: readonly CellType[] = ["eater"];

export interface Cell {
  id: number;
  type: CellType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  /** Direction the cell will divide along, in radians. */
  angle: number;
  /** Age in ticks. */
  age: number;
}

export interface Food {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface World {
  readonly env: Environment;
  readonly seed: number;
  tick: number;
  readonly rng: Rng;
  cells: Cell[];
  food: Food[];
  nextId: number;
  /** Fractional food carried over between ticks. */
  foodAccumulator: number;
  /** Reusable lookup structures. Not part of the simulation state. */
  readonly scratch: { cellGrid: SpatialGrid; foodGrid: SpatialGrid };
}

export function radiusOf(mass: number): number {
  return sqrt(mass);
}

function randomPointInDish(rng: Rng, radius: number): Food {
  const r = radius * sqrt(rng.next());
  const a = rng.range(0, TWO_PI);
  return { x: r * cos(a), y: r * sin(a), vx: 0, vy: 0 };
}

export function createWorld(seed: number, env: Environment = DEFAULT_ENVIRONMENT): World {
  const rng = new Rng(seed);
  const maxRadius = radiusOf(env.splitMass);
  const world: World = {
    env,
    seed,
    tick: 0,
    rng,
    cells: [],
    food: [],
    nextId: 1,
    foodAccumulator: 0,
    scratch: {
      cellGrid: new SpatialGrid(env.dishRadius, maxRadius * 2),
      foodGrid: new SpatialGrid(env.dishRadius, maxRadius * 2),
    },
  };

  const initialFood = Math.floor(env.maxFood * 0.4);
  for (let i = 0; i < initialFood; i++) {
    world.food.push(randomPointInDish(rng, env.dishRadius - 2));
  }

  world.cells.push({
    id: world.nextId++,
    type: "eater",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    mass: env.splitMass * 0.6,
    angle: rng.range(0, TWO_PI),
    age: 0,
  });

  return world;
}

/** Keeps a point inside a circle of the given radius around the origin. */
function clampToDish(p: { x: number; y: number }, limit: number): boolean {
  const d2 = p.x * p.x + p.y * p.y;
  if (d2 <= limit * limit) return false;
  const s = limit / sqrt(d2);
  p.x *= s;
  p.y *= s;
  return true;
}

/** Advances the world by exactly one fixed time step (DT). */
export function stepWorld(w: World): void {
  const { env, rng } = w;
  const { cellGrid, foodGrid } = w.scratch;

  // 1. Spawn food.
  w.foodAccumulator += env.foodPerSecond * DT;
  while (w.foodAccumulator >= 1) {
    w.foodAccumulator -= 1;
    if (w.food.length < env.maxFood) w.food.push(randomPointInDish(rng, env.dishRadius - 2));
  }

  // 2. Food drifts randomly.
  const kick = env.foodKick;
  for (const f of w.food) {
    f.vx = (f.vx + rng.range(-kick, kick)) * env.foodDamping;
    f.vy = (f.vy + rng.range(-kick, kick)) * env.foodDamping;
    f.x += f.vx;
    f.y += f.vy;
    if (clampToDish(f, env.dishRadius - 2)) {
      f.vx = 0;
      f.vy = 0;
    }
  }

  // 3. Cells eat food they touch. Earlier cells in the list win ties.
  foodGrid.clear();
  for (let i = 0; i < w.food.length; i++) foodGrid.insert(i, w.food[i].x, w.food[i].y);
  const eaten = new Uint8Array(w.food.length);
  for (const c of w.cells) {
    const r = radiusOf(c.mass);
    foodGrid.query(c.x, c.y, r, (i) => {
      if (eaten[i]) return;
      const dx = w.food[i].x - c.x;
      const dy = w.food[i].y - c.y;
      if (dx * dx + dy * dy <= r * r) {
        eaten[i] = 1;
        c.mass += env.foodMass;
      }
    });
  }
  if (eaten.some((e) => e === 1)) w.food = w.food.filter((_, i) => eaten[i] === 0);

  // 4. Metabolism.
  for (const c of w.cells) {
    c.mass -= env.metabolism * DT;
    c.age++;
  }

  // 5. Overlapping cells push each other apart (each pair once, i < k).
  cellGrid.clear();
  for (let i = 0; i < w.cells.length; i++) cellGrid.insert(i, w.cells[i].x, w.cells[i].y);
  const maxRadius = radiusOf(env.splitMass);
  for (let i = 0; i < w.cells.length; i++) {
    const a = w.cells[i];
    const ra = radiusOf(a.mass);
    cellGrid.query(a.x, a.y, ra + maxRadius, (k) => {
      if (k <= i) return;
      const b = w.cells[k];
      const rb = radiusOf(b.mass);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = ra + rb;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minDist * minDist) return;
      const dist = sqrt(d2);
      const push = (minDist - dist) * env.stiffness;
      let nx = 1;
      let ny = 0; // Fixed direction if the cells are exactly on top of each other.
      if (dist > 0) {
        nx = dx / dist;
        ny = dy / dist;
      }
      const total = a.mass + b.mass;
      const pa = push * (b.mass / total);
      const pb = push * (a.mass / total);
      a.vx -= nx * pa;
      a.vy -= ny * pa;
      b.vx += nx * pb;
      b.vy += ny * pb;
    });
  }

  // 6. Move, apply friction and keep cells inside the dish.
  for (const c of w.cells) {
    c.vx *= env.drag;
    c.vy *= env.drag;
    c.x += c.vx * DT;
    c.y += c.vy * DT;
    const limit = env.dishRadius - radiusOf(c.mass);
    if (clampToDish(c, limit)) {
      // Remove the outward part of the velocity.
      const d = sqrt(c.x * c.x + c.y * c.y);
      const vn = (c.vx * c.x + c.vy * c.y) / d;
      if (vn > 0) {
        c.vx -= (vn * c.x) / d;
        c.vy -= (vn * c.y) / d;
      }
    }
  }

  // 7. Division and death. Order is preserved: daughters replace the parent.
  const next: Cell[] = [];
  for (const c of w.cells) {
    if (c.mass < env.minMass) continue;
    if (c.mass < env.splitMass) {
      next.push(c);
      continue;
    }
    const half = c.mass / 2;
    const ox = cos(c.angle);
    const oy = sin(c.angle);
    const offset = radiusOf(half) * 0.5;
    // Daughters divide at right angles to the parent, so colonies grow in 2D.
    for (const side of [1, -1]) {
      next.push({
        id: w.nextId++,
        type: c.type,
        x: c.x + side * ox * offset,
        y: c.y + side * oy * offset,
        vx: c.vx + side * ox * env.splitSpeed,
        vy: c.vy + side * oy * env.splitSpeed,
        mass: half,
        angle: c.angle + side * HALF_PI,
        age: 0,
      });
    }
  }
  w.cells = next;

  w.tick++;
}

export function stepWorldN(w: World, n: number): void {
  for (let i = 0; i < n; i++) stepWorld(w);
}
