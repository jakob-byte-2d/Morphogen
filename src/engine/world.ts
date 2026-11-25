import { applyBondForces, indexCells, rebuildBonds, shareNutrients } from "./bonds";
import { HALF_PI, TWO_PI, cos, sin, sqrt } from "./fmath";
import { SpatialGrid } from "./grid";
import { radiusOf, type Cell, type Environment, type Food, type World } from "./model";
import { Rng } from "./rng";

export * from "./model";

/**
 * Bump this whenever the simulation rules change on purpose. Matches and
 * replays store the engine version, so results from different rule sets are
 * never mixed. Remember to update the golden hash in tests/determinism.test.ts.
 */
export const ENGINE_VERSION = 2;

/** Fixed simulation time step in seconds. Never vary this at runtime. */
export const DT = 1 / 30;

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
  daughtersStick: true,
  budEvery: 4,
  bondStiffness: 18,
  bondRestFactor: 0.9,
  bondBreakStretch: 1.6,
  maxBondsPerCell: 6,
  nutrientShare: 0.5,
};

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
    bonds: [],
    nextId: 1,
    foodAccumulator: 0,
    scratch: {
      cellGrid: new SpatialGrid(env.dishRadius, maxRadius * 2),
      foodGrid: new SpatialGrid(env.dishRadius, maxRadius * 2),
      indexById: new Map(),
      divisions: new Map(),
      bondDegree: new Map(),
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
    generation: 0,
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

  // 4. Metabolism, then bonded cells share food.
  for (const c of w.cells) {
    c.mass -= env.metabolism * DT;
    c.age++;
  }
  indexCells(w);
  shareNutrients(w, DT);

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

  // 6. Stretched bonds pull cells together; overstretched bonds break.
  applyBondForces(w);

  // 7. Move, apply friction and keep cells inside the dish.
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

  // 8. Division and death. Order is preserved: daughters replace the parent.
  const divisions = w.scratch.divisions;
  divisions.clear();
  let anyDeaths = false;
  const next: Cell[] = [];
  for (const c of w.cells) {
    if (c.mass < env.minMass) {
      anyDeaths = true;
      continue;
    }
    if (c.mass < env.splitMass) {
      next.push(c);
      continue;
    }
    const half = c.mass / 2;
    const ox = cos(c.angle);
    const oy = sin(c.angle);
    const offset = radiusOf(half) * 0.5;
    const buds = env.budEvery > 0 && c.generation >= env.budEvery - 1;
    const first = daughter(w, c, half, ox, oy, offset, 1, buds ? c.generation : c.generation + 1);
    const second = daughter(w, c, half, ox, oy, offset, -1, buds ? 0 : c.generation + 1);
    next.push(first, second);
    divisions.set(c.id, {
      parentId: c.id,
      first: first.id,
      second: second.id,
      x: c.x,
      y: c.y,
      dirX: ox,
      dirY: oy,
      secondBuds: buds,
    });
  }
  w.cells = next;

  // 9. Hand bonds over to daughters and drop bonds to dead cells.
  indexCells(w);
  rebuildBonds(w, anyDeaths);

  w.tick++;
}

/** Daughters divide at right angles to the parent, so colonies grow in 2D. */
function daughter(
  w: World,
  parent: Cell,
  mass: number,
  ox: number,
  oy: number,
  offset: number,
  side: 1 | -1,
  generation: number,
): Cell {
  return {
    id: w.nextId++,
    type: parent.type,
    x: parent.x + side * ox * offset,
    y: parent.y + side * oy * offset,
    vx: parent.vx + side * ox * w.env.splitSpeed,
    vy: parent.vy + side * oy * w.env.splitSpeed,
    mass,
    angle: parent.angle + side * HALF_PI,
    age: 0,
    generation,
  };
}

export function stepWorldN(w: World, n: number): void {
  for (let i = 0; i < n; i++) stepWorld(w);
}
