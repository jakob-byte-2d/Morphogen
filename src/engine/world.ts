import { alignOrientations, applyBondForces, indexCells, rebuildBonds, shareNutrients } from "./bonds";
import { PI, TWO_PI, atan2, cos, sin } from "./fmath";
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
export const ENGINE_VERSION = 5;

/** Fixed simulation time step in seconds. Never vary this at runtime. */
export const DT = 1 / 30;

/**
 * The glass, seen from the side. x runs left to right, y runs from the water
 * surface (0) down to the bottom (tankHeight).
 */
export const DEFAULT_ENVIRONMENT: Environment = {
  tankWidth: 300,
  tankHeight: 450,
  foodPerSecond: 18,
  maxFood: 500,
  foodMass: 12,
  foodKick: 0.25,
  foodDamping: 0.9,
  foodSink: 0.008,
  sludgeDrift: 1.2,
  sludgeDissolve: 0.003,
  light: 1,
  lightDepth: 560,
  lightColumnWidth: 20,
  shadePerCell: 0.35,
  photoRate: 4.5,
  sink: { eater: 4, photo: -6, swim: 0 },
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

/** Food dropped in just below the water surface. */
function surfaceFood(rng: Rng, env: Environment): Food {
  return { x: rng.range(2, env.tankWidth - 2), y: rng.range(1, 6), vx: 0, vy: 0 };
}

export function createWorld(seed: number, options: WorldOptions = {}): World {
  const env = options.env ?? DEFAULT_ENVIRONMENT;
  const genomes: Genome[] = (options.genomes ?? [DEFAULT_GENOME]).map(normalizeGenome);
  if (genomes.length === 0) genomes.push(normalizeGenome(DEFAULT_GENOME));
  const rng = new Rng(seed);
  const gridSize = radiusOf(env.maxCellMass) * 2;
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
      cellGrid: new SpatialGrid(env.tankWidth, env.tankHeight, gridSize),
      foodGrid: new SpatialGrid(env.tankWidth, env.tankHeight, gridSize),
      indexById: new Map(),
      divisions: new Map(),
      bondDegree: new Map(),
      light: new Float64Array(64),
      lightKey: new Float64Array(64),
      lightOrder: [],
      turnX: new Float64Array(64),
      turnY: new Float64Array(64),
    },
  };

  // A fresh glass starts with some food spread through the water.
  const initialFood = Math.floor(env.maxFood * 0.4);
  for (let i = 0; i < initialFood; i++) {
    world.food.push({
      x: rng.range(2, env.tankWidth - 2),
      y: rng.range(2, env.tankHeight - 2),
      vx: 0,
      vy: 0,
    });
  }

  // One founder per species, side by side at half depth. With two species
  // the start is a mirror image, so neither gets a better position.
  const baseAngle = rng.range(0, TWO_PI);
  for (let s = 0; s < genomes.length; s++) {
    const g = genomes[s];
    world.cells.push({
      id: world.nextId++,
      species: s,
      mode: g.startMode,
      type: g.modes[g.startMode].cellType,
      x: (env.tankWidth * (s + 1)) / (genomes.length + 1),
      y: env.tankHeight / 2,
      vx: 0,
      vy: 0,
      mass: 120,
      angle: s % 2 === 0 ? baseAngle : PI - baseAngle,
      age: 0,
    });
  }
  indexCells(world);

  return world;
}

/**
 * Computes how much light reaches every cell. Light comes from above, fades
 * with depth, and each cell blocks part of it for the cells below it in the
 * same column. Results go to world.scratch.light.
 */
function computeLight(w: World): void {
  const { env, cells } = w;
  const n = cells.length;
  if (w.scratch.light.length < n) {
    w.scratch.light = new Float64Array(n * 2);
    w.scratch.lightKey = new Float64Array(n * 2);
  }
  const light = w.scratch.light;
  // Only light collectors use light, so skip the work when there are none.
  let anyPhoto = false;
  for (let i = 0; i < n; i++) {
    if (cells[i].type === "photo") {
      anyPhoto = true;
      break;
    }
  }
  if (!anyPhoto) return;

  // Sort by column, then depth, then index. One number per cell (column
  // times a factor bigger than any depth, plus depth) keeps the sort cheap,
  // and the index tie-break makes the order fully determined.
  const colWidth = env.lightColumnWidth;
  const key = w.scratch.lightKey;
  const stride = env.tankHeight + 1;
  for (let i = 0; i < n; i++) key[i] = Math.floor(cells[i].x / colWidth) * stride + cells[i].y;
  const order = w.scratch.lightOrder;
  order.length = n;
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => key[a] - key[b] || a - b);

  let currentColumn = -1;
  let remaining = 0;
  for (const i of order) {
    const c = cells[i];
    const col = Math.floor(key[i] / stride);
    if (col !== currentColumn) {
      currentColumn = col;
      remaining = env.light;
    }
    const depthFactor = Math.max(0, 1 - c.y / env.lightDepth);
    light[i] = remaining * depthFactor;
    const coverage = Math.min(1, (2 * radiusOf(c.mass)) / colWidth);
    remaining *= 1 - env.shadePerCell * coverage;
  }
}

/** Advances the world by exactly one fixed time step (DT). */
export function stepWorld(w: World): void {
  const { env, rng } = w;
  const { cellGrid, foodGrid } = w.scratch;
  const W = env.tankWidth;
  const H = env.tankHeight;

  // 1. Food is dropped in at the surface, unless the water is already full of it.
  const bottom = H - 1.5;
  let floating = 0;
  for (const f of w.food) if (f.y < bottom) floating++;
  w.foodAccumulator += env.foodPerSecond * DT;
  while (w.foodAccumulator >= 1) {
    w.foodAccumulator -= 1;
    if (floating < env.maxFood) {
      w.food.push(surfaceFood(rng, env));
      floating++;
    }
  }

  // 2. Food drifts and sinks. On the bottom it settles as sludge, which
  //    creeps slowly sideways and little by little dissolves.
  const kick = env.foodKick;
  const dissolve = env.sludgeDissolve * DT;
  let anyDissolved = false;
  const dissolved = new Uint8Array(w.food.length);
  for (let i = 0; i < w.food.length; i++) {
    const f = w.food[i];
    if (f.y >= bottom) {
      if (rng.next() < dissolve) {
        dissolved[i] = 1;
        anyDissolved = true;
        continue;
      }
      f.x = Math.min(W - 1, Math.max(1, f.x + rng.range(-env.sludgeDrift, env.sludgeDrift)));
      continue;
    }
    f.vx = (f.vx + rng.range(-kick, kick)) * env.foodDamping;
    f.vy = (f.vy + rng.range(-kick, kick) + env.foodSink) * env.foodDamping;
    f.x += f.vx;
    f.y += f.vy;
    if (f.x < 1) {
      f.x = 1;
      f.vx = 0;
    } else if (f.x > W - 1) {
      f.x = W - 1;
      f.vx = 0;
    }
    if (f.y < 1) {
      f.y = 1;
      f.vy = 0;
    } else if (f.y >= bottom) {
      f.y = bottom;
      f.vx = 0;
      f.vy = 0;
    }
  }
  if (anyDissolved) w.food = w.food.filter((_, i) => dissolved[i] === 0);

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

  // 4. Overlapping cells push each other apart (each pair once, i < k).
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
      const dist = Math.sqrt(d2);
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

  // 5. Light collectors grow in the light that reaches them. Swimmers push
  //    themselves forward at a cost. Cells sink or float by type. Everyone
  //    burns food.
  computeLight(w);
  const light = w.scratch.light;
  for (let i = 0; i < w.cells.length; i++) {
    const c = w.cells[i];
    if (c.type === "photo") {
      c.mass += env.photoRate * light[i] * DT;
    } else if (c.type === "swim") {
      c.vx += cos(c.angle) * env.swimForce * DT;
      c.vy += sin(c.angle) * env.swimForce * DT;
      c.mass -= env.swimCost * DT;
    }
    c.vy += env.sink[c.type] * DT;
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

  // 7. Move, apply friction and keep cells inside the glass.
  for (const c of w.cells) {
    c.vx *= env.drag;
    c.vy *= env.drag;
    c.x += c.vx * DT;
    c.y += c.vy * DT;
    const r = radiusOf(c.mass);
    // Outward normal of the wall the cell hit, if any.
    let nx = 0;
    let ny = 0;
    if (c.x < r) {
      c.x = r;
      nx = -1;
    } else if (c.x > W - r) {
      c.x = W - r;
      nx = 1;
    }
    if (c.y < r) {
      c.y = r;
      ny = -1;
    } else if (c.y > H - r) {
      c.y = H - r;
      ny = 1;
    }
    if (nx !== 0 && c.vx * nx > 0) c.vx = 0;
    if (ny !== 0 && c.vy * ny > 0) c.vy = 0;
    // A swimmer heading into a wall turns away, like a ball bouncing off it.
    if (c.type === "swim" && (nx !== 0 || ny !== 0)) {
      let fx = cos(c.angle);
      let fy = sin(c.angle);
      if (fx * nx > 0) fx = -fx;
      if (fy * ny > 0) fy = -fy;
      c.angle = atan2(fy, fx);
    }
  }

  // 8. Division and death, following each cell's mode. Order is preserved:
  //    daughters replace the parent in the list. A dead cell leaves its mass
  //    behind as particles of dead matter, which sink like food.
  const divisions = w.scratch.divisions;
  divisions.clear();
  let anyDeaths = false;
  let population = w.cells.length;
  const next: Cell[] = [];
  for (const c of w.cells) {
    if (c.mass < env.minMass) {
      anyDeaths = true;
      population--;
      const r = radiusOf(c.mass);
      const pieces = Math.floor(c.mass / env.foodMass);
      for (let p = 0; p < pieces; p++) {
        w.food.push({
          x: Math.min(W - 1, Math.max(1, c.x + rng.range(-r, r) * 0.5)),
          y: Math.min(H - 1.5, Math.max(1, c.y + rng.range(-r, r) * 0.5)),
          vx: 0,
          vy: 0,
        });
      }
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
  // Keep the daughter inside the glass even if her mother sat against a wall.
  const r = radiusOf(mass);
  const { tankWidth: W, tankHeight: H } = w.env;
  return {
    id: w.nextId++,
    species: parent.species,
    mode,
    type: w.genomes[parent.species].modes[mode].cellType,
    x: Math.min(W - r, Math.max(r, parent.x + side * ox * offset)),
    y: Math.min(H - r, Math.max(r, parent.y + side * oy * offset)),
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
