import { alignOrientations, applyBondForces, indexCells, rebuildBonds, shareNutrients } from "./bonds";
import { TWO_PI, atan2, cos, sin, sqrt } from "./fmath";
import { DEFAULT_GENOME, normalizeGenome, type Genome } from "./genome";
import { SpatialGrid } from "./grid";
import { radiusOf, type Cell, type Environment, type Food, type World } from "./model";
import { Rng } from "./rng";

export * from "./model";

/**
 * Bump this whenever the simulation rules change on purpose. Matches and
 * replays store the engine version, so results from different rule sets are
 * never mixed. Remember to update the golden hash in src/engine/golden.ts.
 */
export const ENGINE_VERSION = 4;

/** Fixed simulation time step in seconds. Never vary this at runtime. */
export const DT = 1 / 30;

export const DEFAULT_ENVIRONMENT: Environment = {
  dishRadius: 300,
  foodPerSecond: 25,
  maxFood: 1000,
  foodMass: 12,
  foodKick: 0.5,
  foodDamping: 0.9,
  light: 1,
  photoRate: 4.5,
  shadePerContact: 0.5,
  metabolism: 1.5,
  minMass: 40,
  maxCellMass: 400,
  maxCells: 1000,
  splitSpeed: 30,
  stiffness: 18,
  drag: 0.85,
  bondStiffness: 18,
  bondRestFactor: 0.9,
  bondBreakStretch: 1.6,
  maxBondsPerCell: 6,
  nutrientShare: 0.5,
  alignRate: 0.3,
  swimForce: 150,
  swimCost: 1,
};

export interface WorldOptions {
  env?: Environment;
  /** One genome per species. Defaults to a single species with DEFAULT_GENOME. */
  genomes?: readonly unknown[];
}

function randomPointInDish(rng: Rng, radius: number): Food {
  const r = radius * sqrt(rng.next());
  const a = rng.range(0, TWO_PI);
  return { x: r * cos(a), y: r * sin(a), vx: 0, vy: 0 };
}

export function createWorld(seed: number, options: WorldOptions = {}): World {
  const env = options.env ?? DEFAULT_ENVIRONMENT;
  const genomes: Genome[] = (options.genomes ?? [DEFAULT_GENOME]).map(normalizeGenome);
  if (genomes.length === 0) genomes.push(normalizeGenome(DEFAULT_GENOME));
  const rng = new Rng(seed);
  const maxRadius = radiusOf(env.maxCellMass);
  const world: World = {
    env,
    seed,
    genomes,
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
      contacts: new Uint16Array(64),
      turnX: new Float64Array(64),
      turnY: new Float64Array(64),
    },
  };

  const initialFood = Math.floor(env.maxFood * 0.4);
  for (let i = 0; i < initialFood; i++) {
    world.food.push(randomPointInDish(rng, env.dishRadius - 2));
  }

  // One founder per species. Several species start evenly around the dish,
  // turned the same way relative to the centre, so no one gets a better start.
  const baseAngle = rng.range(0, TWO_PI);
  for (let s = 0; s < genomes.length; s++) {
    const g = genomes[s];
    const around = (s * TWO_PI) / genomes.length;
    const r = genomes.length === 1 ? 0 : env.dishRadius / 2;
    world.cells.push({
      id: world.nextId++,
      species: s,
      mode: g.startMode,
      type: g.modes[g.startMode].cellType,
      x: r * cos(around),
      y: r * sin(around),
      vx: 0,
      vy: 0,
      mass: 120,
      angle: baseAngle + around,
      age: 0,
    });
  }
  indexCells(world);

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

  // 3. Eaters eat food they touch. Earlier cells in the list win ties.
  foodGrid.clear();
  for (let i = 0; i < w.food.length; i++) foodGrid.insert(i, w.food[i].x, w.food[i].y);
  const eaten = new Uint8Array(w.food.length);
  let anyEaten = false;
  for (const c of w.cells) {
    if (c.type !== "eater") continue;
    const r = radiusOf(c.mass);
    foodGrid.query(c.x, c.y, r, (i) => {
      if (eaten[i]) return;
      const dx = w.food[i].x - c.x;
      const dy = w.food[i].y - c.y;
      if (dx * dx + dy * dy <= r * r) {
        eaten[i] = 1;
        anyEaten = true;
        c.mass = Math.min(c.mass + env.foodMass, env.maxCellMass);
      }
    });
  }
  if (anyEaten) w.food = w.food.filter((_, i) => eaten[i] === 0);

  // 4. Overlapping cells push each other apart (each pair once, i < k),
  //    and we count how many neighbours touch each cell.
  if (w.scratch.contacts.length < w.cells.length) {
    w.scratch.contacts = new Uint16Array(w.cells.length * 2);
  }
  const contacts = w.scratch.contacts;
  contacts.fill(0, 0, w.cells.length);
  cellGrid.clear();
  for (let i = 0; i < w.cells.length; i++) cellGrid.insert(i, w.cells[i].x, w.cells[i].y);
  const maxRadius = radiusOf(env.maxCellMass);
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
      contacts[i]++;
      contacts[k]++;
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

  // 5. Light collectors gain mass; neighbours shade them. Swimmers push
  //    themselves forward at a cost. Everyone burns food.
  const photoGain = env.light * env.photoRate * DT;
  for (let i = 0; i < w.cells.length; i++) {
    const c = w.cells[i];
    if (c.type === "photo") {
      c.mass += photoGain / (1 + contacts[i] * env.shadePerContact);
    } else if (c.type === "swim") {
      c.vx += cos(c.angle) * env.swimForce * DT;
      c.vy += sin(c.angle) * env.swimForce * DT;
      c.mass -= env.swimCost * DT;
    }
    c.mass -= env.metabolism * DT;
    if (c.mass > env.maxCellMass) c.mass = env.maxCellMass;
    c.age++;
  }

  // 6. Bonded cells share food. Stretched bonds pull; overstretched bonds
  //    break. Bonded cells turn along with their organism.
  indexCells(w);
  shareNutrients(w, DT);
  applyBondForces(w);
  alignOrientations(w);

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
      const nx = c.x / d;
      const ny = c.y / d;
      const vn = c.vx * nx + c.vy * ny;
      if (vn > 0) {
        c.vx -= vn * nx;
        c.vy -= vn * ny;
      }
      // A swimmer heading into the wall turns away, like a ball bouncing off it.
      if (c.type === "swim") {
        const fx = cos(c.angle);
        const fy = sin(c.angle);
        const fn = fx * nx + fy * ny;
        if (fn > 0) c.angle = atan2(fy - 2 * fn * ny, fx - 2 * fn * nx);
      }
    }
  }

  // 8. Division and death, following each cell's mode. Order is preserved:
  //    daughters replace the parent in the list.
  const divisions = w.scratch.divisions;
  divisions.clear();
  let anyDeaths = false;
  let population = w.cells.length;
  const next: Cell[] = [];
  for (const c of w.cells) {
    if (c.mass < env.minMass) {
      anyDeaths = true;
      population--;
      continue;
    }
    const m = w.genomes[c.species].modes[c.mode];
    if (!m.canSplit || c.mass < m.splitMass || population >= env.maxCells) {
      next.push(c);
      continue;
    }
    population++;
    const axis = c.angle + m.splitAngle;
    const ox = cos(axis);
    const oy = sin(axis);
    const half = c.mass / 2;
    const offset = radiusOf(half) * 0.5;
    const first = daughter(w, c, half, ox, oy, offset, 1, m.childModes[0], m.childTurns[0]);
    const second = daughter(w, c, half, ox, oy, offset, -1, m.childModes[1], m.childTurns[1]);
    next.push(first, second);
    divisions.set(c.id, {
      parentId: c.id,
      first: first.id,
      second: second.id,
      x: c.x,
      y: c.y,
      dirX: ox,
      dirY: oy,
      makeBond: m.makeBond,
      keepFirst: m.childKeepsBonds[0],
      keepSecond: m.childKeepsBonds[1],
    });
  }
  w.cells = next;

  // 9. Hand bonds over to daughters and drop bonds to dead cells.
  indexCells(w);
  rebuildBonds(w, anyDeaths);

  w.tick++;
}

function daughter(
  w: World,
  parent: Cell,
  mass: number,
  ox: number,
  oy: number,
  offset: number,
  side: 1 | -1,
  mode: number,
  turn: number,
): Cell {
  return {
    id: w.nextId++,
    species: parent.species,
    mode,
    type: w.genomes[parent.species].modes[mode].cellType,
    x: parent.x + side * ox * offset,
    y: parent.y + side * oy * offset,
    vx: parent.vx + side * ox * w.env.splitSpeed,
    vy: parent.vy + side * oy * w.env.splitSpeed,
    mass,
    angle: parent.angle + turn,
    age: 0,
  };
}

export function stepWorldN(w: World, n: number): void {
  for (let i = 0; i < n; i++) stepWorld(w);
}
