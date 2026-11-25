import { alignOrientations, applyBondForces, indexCells, rebuildBonds, shareNutrients } from "./bonds";
import { HALF_PI, PI, TWO_PI, cos, sin, wrapAngle } from "./fmath";
import { DEFAULT_GENOME, normalizeGenome, type Genome } from "./genome";
import { SpatialGrid } from "./grid";
import { isAnimal, isPlant, radiusOf, type Cell, type Environment, type Food, type World } from "./model";
import { addNutrient, diffuseNutrients, takeNutrient } from "./nutrients";
import { Rng } from "./rng";

export * from "./model";

/**
 * Bump this whenever the simulation rules change on purpose. Matches and
 * replays store the engine version, so results from different rule sets are
 * never mixed. Remember to update the golden hash in src/engine/golden.ts.
 */
export const ENGINE_VERSION = 6;

/** Fixed simulation time step in seconds. Never vary this at runtime. */
export const DT = 1 / 30;

/** Swimmers weave from side to side once every 20 seconds. */
const WOBBLE_STEP = (TWO_PI * DT) / 20;

/**
 * The glass, seen from the side. x runs left to right, y runs from the water
 * surface (0) down to the bottom (tankHeight).
 */
export const DEFAULT_ENVIRONMENT: Environment = {
  tankWidth: 300,
  tankHeight: 450,
  foodPerSecond: 0,
  maxFood: 500,
  foodMass: 12,
  foodKick: 0.25,
  foodDamping: 0.9,
  foodSink: 0.008,
  sludgeDrift: 1.2,
  sludgeDissolve: 0.003,
  nutrientCellSize: 15,
  nutrientDiffusion: 0.02,
  initialNutrient: 40,
  nutrientUptake: 0.05,
  light: 1,
  lightDepth: 1000,
  lightColumnWidth: 20,
  shadePerCell: 0.35,
  photoRate: 4,
  sink: { eater: 4, photo: -6, swim: 0, root: 30, grazer: 2, hunter: 2, decomposer: 6 },
  metabolism: 0.5,
  digestEfficiency: 0.7,
  decomposerShare: 0.25,
  grazeRate: 3,
  grazeFloor: 60,
  huntRate: 3,
  minMass: 40,
  lifespan: 1800,
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
  swimCost: 0.5,
  swimWobble: 0.7,
};

/** No cell type sinks or floats. Handy for tests and measurements. */
export const NO_SINKING: Environment["sink"] = {
  eater: 0,
  photo: 0,
  swim: 0,
  root: 0,
  grazer: 0,
  hunter: 0,
  decomposer: 0,
};

/** Mass of the first cell of each species: enough to divide right away and still get going. */
export const FOUNDER_MASS = 200;

export interface WorldOptions {
  env?: Environment;
  /** One genome per species. Defaults to a single species with DEFAULT_GENOME. */
  genomes?: readonly unknown[];
  /**
   * When each species is released into the glass, in seconds (default 0 =
   * at the start). Lets plants get going before the animals arrive.
   */
  arrivals?: readonly number[];
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
  const nutrientCols = Math.ceil(env.tankWidth / env.nutrientCellSize);
  const nutrientRows = Math.ceil(env.tankHeight / env.nutrientCellSize);
  const world: World = {
    env,
    seed,
    genomes,
    tick: 0,
    rng,
    cells: [],
    food: [],
    bonds: [],
    nutrients: new Float64Array(nutrientCols * nutrientRows).fill(env.initialNutrient),
    nutrientCols,
    nutrientRows,
    nextId: 1,
    nextOrganism: 1,
    arrivals: [],
    founderAngle: 0,
    foodAccumulator: 0,
    scratch: {
      cellGrid: new SpatialGrid(env.tankWidth, env.tankHeight, gridSize),
      foodGrid: new SpatialGrid(env.tankWidth, env.tankHeight, gridSize),
      indexById: new Map(),
      divisions: new Map(),
      bondDegree: new Map(),
      appetite: new Float64Array(64),
      nutrientNext: new Float64Array(nutrientCols * nutrientRows),
      light: new Float64Array(64),
      lightKey: new Float64Array(64),
      lightOrder: [],
      turnX: new Float64Array(64),
      turnY: new Float64Array(64),
      wallHits: new Map(),
      turned: new Set(),
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
  world.founderAngle = baseAngle;
  for (let s = 0; s < genomes.length; s++) {
    const seconds = options.arrivals?.[s] ?? 0;
    const tick = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds / DT) : 0;
    if (tick === 0) releaseFounder(world, s);
    else world.arrivals.push({ tick, species: s });
  }
  world.arrivals.sort((a, b) => a.tick - b.tick || a.species - b.species);
  indexCells(world);

  return world;
}

/** Puts the first cell of a species into the glass, at half depth in its own lane. */
function releaseFounder(w: World, s: number): void {
  const g = w.genomes[s];
  w.cells.push({
    id: w.nextId++,
    species: s,
    mode: g.startMode,
    type: g.modes[g.startMode].cellType,
    x: (w.env.tankWidth * (s + 1)) / (w.genomes.length + 1),
    y: w.env.tankHeight / 2,
    vx: 0,
    vy: 0,
    mass: FOUNDER_MASS,
    angle: s % 2 === 0 ? w.founderAngle : PI - w.founderAngle,
    age: 0,
    organism: w.nextOrganism++,
    anchored: false,
  });
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

  // 0. Species due now are released into the glass.
  if (w.arrivals.length > 0 && w.arrivals[0].tick <= w.tick) {
    while (w.arrivals.length > 0 && w.arrivals[0].tick <= w.tick) releaseFounder(w, w.arrivals.shift()!.species);
    indexCells(w);
  }

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
  //    creeps slowly sideways and little by little dissolves into nutrients.
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
        addNutrient(w, f.x, f.y, env.foodMass);
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

  // 3. Scavengers (eaters) eat dead matter floating in the water; decomposers
  //    eat the sludge on the bottom. Earlier cells in the list win ties. What
  //    they do not keep becomes nutrients.
  foodGrid.clear();
  for (let i = 0; i < w.food.length; i++) foodGrid.insert(i, w.food[i].x, w.food[i].y);
  const eaten = new Uint8Array(w.food.length);
  let anyEaten = false;
  for (const c of w.cells) {
    const keep = c.type === "eater" ? env.digestEfficiency : c.type === "decomposer" ? env.decomposerShare : -1;
    if (keep < 0) continue;
    const wantsSludge = c.type === "decomposer";
    const r = radiusOf(c.mass);
    foodGrid.query(c.x, c.y, r, (i) => {
      if (eaten[i] || w.food[i].y >= bottom !== wantsSludge) return;
      const dx = w.food[i].x - c.x;
      const dy = w.food[i].y - c.y;
      if (dx * dx + dy * dy <= r * r) {
        eaten[i] = 1;
        anyEaten = true;
        gain(w, c, env.foodMass * keep);
        addNutrient(w, c.x, c.y, env.foodMass * (1 - keep));
      }
    });
  }
  if (anyEaten) w.food = w.food.filter((_, i) => eaten[i] === 0);

  // 4. Overlapping cells push each other apart (each pair once, i < k).
  //    Grazers and hunters bite into the cells of other organisms they touch.
  //    Roots anchored to the bottom do not budge.
  const n = w.cells.length;
  if (w.scratch.appetite.length < n) w.scratch.appetite = new Float64Array(n * 2);
  const appetite = w.scratch.appetite;
  for (let i = 0; i < n; i++) {
    const t = w.cells[i].type;
    appetite[i] = t === "grazer" ? env.grazeRate * DT : t === "hunter" ? env.huntRate * DT : 0;
  }
  cellGrid.clear();
  for (let i = 0; i < n; i++) cellGrid.insert(i, w.cells[i].x, w.cells[i].y);
  const maxRadius = radiusOf(env.maxCellMass);
  for (let i = 0; i < n; i++) {
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
      if (appetite[i] > 0) bite(w, a, b, i, appetite);
      if (appetite[k] > 0) bite(w, b, a, k, appetite);
      // A loose root (a seed) falls through other plants instead of getting
      // caught in their leaves, so it always reaches the bottom.
      if (a.type === "root" && !a.anchored && isPlant(b.type)) return;
      if (b.type === "root" && !b.anchored && isPlant(a.type)) return;
      if (a.anchored && b.anchored) return;
      const dist = Math.sqrt(d2);
      const push = (minDist - dist) * env.stiffness;
      let nx = 1;
      let ny = 0; // Fixed direction if the cells are exactly on top of each other.
      if (dist > 0) {
        nx = dx / dist;
        ny = dy / dist;
      }
      const total = a.mass + b.mass;
      const pa = a.anchored ? 0 : b.anchored ? push : push * (b.mass / total);
      const pb = b.anchored ? 0 : a.anchored ? push : push * (a.mass / total);
      a.vx -= nx * pa;
      a.vy -= ny * pa;
      b.vx += nx * pb;
      b.vy += ny * pb;
    });
  }

  // 5. Light collectors build mass from light and nutrients. Swimmers push
  //    themselves forward at a cost. Cells sink or float by type. Everyone
  //    burns mass, which goes back into the water as nutrients.
  computeLight(w);
  const light = w.scratch.light;
  for (let i = 0; i < n; i++) {
    const c = w.cells[i];
    let burn = env.metabolism * DT;
    if (c.type === "photo") {
      const want = env.photoRate * light[i] * DT;
      gain(w, c, takeNutrient(w, c.x, c.y, want, env.nutrientUptake));
    } else if (c.type === "swim") {
      // Swimmers weave from side to side, each in its own rhythm, so animals
      // wander around the glass instead of getting stuck against a wall.
      const heading = c.angle + env.swimWobble * sin(c.age * WOBBLE_STEP + c.id);
      c.vx += cos(heading) * env.swimForce * DT;
      c.vy += sin(heading) * env.swimForce * DT;
      burn += env.swimCost * DT;
    }
    if (!c.anchored) c.vy += env.sink[c.type] * DT;
    c.mass -= burn;
    addNutrient(w, c.x, c.y, burn);
    c.age++;
  }

  // 6. Bonded cells share food. Stretched bonds pull; overstretched bonds
  //    break. Bonded cells turn along with their organism. Roots always point
  //    up, so a plant grows towards the light.
  indexCells(w);
  shareNutrients(w, DT);
  applyBondForces(w);
  alignOrientations(w);
  for (const c of w.cells) if (c.type === "root") c.angle = -HALF_PI;

  // 7. Move, apply friction and keep cells inside the glass. A root that
  //    reaches the bottom anchors there for good. When an organism bumps
  //    into a wall, its swimmers that push towards the wall turn around.
  const wallHits = w.scratch.wallHits;
  wallHits.clear();
  for (const c of w.cells) {
    if (c.anchored) {
      c.vx = 0;
      c.vy = 0;
      continue;
    }
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
    if (c.type === "root" && ny === 1) {
      c.anchored = true;
      c.vx = 0;
      c.vy = 0;
    }
    if (nx !== 0 || ny !== 0) {
      const hit = wallHits.get(c.organism);
      if (hit) {
        hit.x += nx;
        hit.y += ny;
      } else wallHits.set(c.organism, { x: nx, y: ny });
    }
  }
  if (wallHits.size > 0) turnAwayFromWalls(w);

  // 8. Division and death, following each cell's mode. Order is preserved:
  //    daughters replace the parent in the list. Cells die when they starve
  //    or grow old. A dead cell leaves its mass behind as particles of dead
  //    matter; what does not fill a whole particle dissolves as nutrients.
  //    Roots only sprout once anchored.
  const divisions = w.scratch.divisions;
  divisions.clear();
  let anyDeaths = false;
  let population = w.cells.length;
  const maxAge = Math.round(env.lifespan / DT);
  const next: Cell[] = [];
  for (const c of w.cells) {
    if (c.mass < env.minMass || c.age >= maxAge) {
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
      addNutrient(w, c.x, c.y, c.mass - pieces * env.foodMass);
      continue;
    }
    const m = w.genomes[c.species].modes[c.mode];
    const rootWaiting = c.type === "root" && !c.anchored;
    if (!m.canSplit || rootWaiting || c.mass < m.splitMass || population >= env.maxCells) {
      next.push(c);
      continue;
    }
    population++;
    const axis = c.angle + m.splitAngle;
    const ox = cos(axis);
    const oy = sin(axis);
    const half = c.mass / 2;
    const offset = radiusOf(half) * 0.5;
    // A daughter stays in her mother's organism if the sisters bond or she
    // keeps the mother's bonds. If neither does, the first one carries on the
    // line and the second starts a new organism.
    const firstStays = m.makeBond || m.childKeepsBonds[0];
    const secondStays = m.makeBond || m.childKeepsBonds[1];
    const firstOrganism = firstStays || !secondStays ? c.organism : w.nextOrganism++;
    const secondOrganism = secondStays ? c.organism : w.nextOrganism++;
    const first = daughter(w, c, half, ox, oy, offset, 1, m.childModes[0], m.childTurns[0], firstOrganism);
    const second = daughter(w, c, half, ox, oy, offset, -1, m.childModes[1], m.childTurns[1], secondOrganism);
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

  // 10. Nutrients spread through the water.
  diffuseNutrients(w);

  w.tick++;
}

/**
 * Swimmers in an organism that bumped into a wall turn around if they push
 * towards it. A bonded swimmer's direction is held by its bonds, so the
 * bonds' attachment angles turn with it; otherwise the bonds would turn it
 * straight back.
 */
function turnAwayFromWalls(w: World): void {
  const { wallHits, turned } = w.scratch;
  turned.clear();
  for (const c of w.cells) {
    if (c.type !== "swim") continue;
    const hit = wallHits.get(c.organism);
    if (!hit || cos(c.angle) * hit.x + sin(c.angle) * hit.y <= 0) continue;
    c.angle = wrapAngle(c.angle + PI);
    turned.add(c.id);
  }
  if (turned.size === 0) return;
  for (const b of w.bonds) {
    if (turned.has(b.a)) b.angA = wrapAngle(b.angA + PI);
    if (turned.has(b.b)) b.angB = wrapAngle(b.angB + PI);
  }
}

/** Adds mass to a cell. Anything above the mass limit goes back into the water. */
function gain(w: World, c: Cell, amount: number): void {
  const room = w.env.maxCellMass - c.mass;
  if (amount <= room) {
    c.mass += amount;
    return;
  }
  c.mass += Math.max(0, room);
  addNutrient(w, c.x, c.y, amount - Math.max(0, room));
}

/**
 * A grazer or hunter bites into a cell it touches, if that cell is from
 * another species and the right kind of food. Grazers eat light collectors,
 * but never below grazeFloor, so the plant survives and grows back. Hunters
 * eat animal cells and can kill them. Part of the bite becomes the eater's
 * mass, the rest nutrients.
 */
function bite(w: World, eater: Cell, prey: Cell, eaterIndex: number, appetite: Float64Array): void {
  if (eater.species === prey.species) return;
  let available: number;
  if (eater.type === "grazer") {
    if (prey.type !== "photo") return;
    available = prey.mass - w.env.grazeFloor;
  } else {
    if (!isAnimal(prey.type)) return;
    available = prey.mass;
  }
  const amount = Math.min(appetite[eaterIndex], available);
  if (amount <= 0) return;
  appetite[eaterIndex] -= amount;
  prey.mass -= amount;
  const keep = amount * w.env.digestEfficiency;
  gain(w, eater, keep);
  addNutrient(w, eater.x, eater.y, amount - keep);
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
  organism: number,
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
    organism,
    anchored: false,
  };
}

export function stepWorldN(w: World, n: number): void {
  for (let i = 0; i < n; i++) stepWorld(w);
}
