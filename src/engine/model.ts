import type { SpatialGrid } from "./grid";
import { sqrt } from "./fmath";
import type { Genome } from "./genome";
import type { Rng } from "./rng";

export interface Environment {
  /** Radius of the petri dish. */
  dishRadius: number;
  /** New food particles per second. */
  foodPerSecond: number;
  maxFood: number;
  /** Mass an eater gains from one food particle. */
  foodMass: number;
  /** Random push food gets every tick (makes it drift like plankton). */
  foodKick: number;
  /** Food velocity multiplier per tick. */
  foodDamping: number;
  /** Light strength, 0 (dark) to 1 (full sun). */
  light: number;
  /** Mass a light collector gains per second in full light, before shading. */
  photoRate: number;
  /** Each touching neighbour shades a light collector by this much (1 / (1 + n * shade)). */
  shadePerContact: number;
  /** Mass every cell burns per second. */
  metabolism: number;
  /** A cell dies below this mass. */
  minMass: number;
  /** No cell grows heavier than this; extra food is wasted. */
  maxCellMass: number;
  /** Cells stop dividing when the dish holds this many. Keeps phones fast. */
  maxCells: number;
  /** Speed the two daughter cells get when a cell divides. */
  splitSpeed: number;
  /** How hard overlapping cells push each other apart. */
  stiffness: number;
  /** Velocity multiplier per tick (1 = no friction). */
  drag: number;
  /** How hard a stretched bond pulls its two cells together. */
  bondStiffness: number;
  /** Bond rest length as a fraction of the two radii. Below 1, bonded cells overlap slightly. */
  bondRestFactor: number;
  /** A bond breaks when stretched beyond this many times its rest length. */
  bondBreakStretch: number;
  /** Bond limit per cell. Extra bonds are not inherited when the cell divides. */
  maxBondsPerCell: number;
  /** Fraction of the mass difference that flows across a bond per second. */
  nutrientShare: number;
  /** How quickly a bonded cell turns to follow its organism, per tick (0–1). */
  alignRate: number;
  /** Push a swimmer gives itself, as speed gained per second. */
  swimForce: number;
  /** Extra mass a swimmer burns per second. */
  swimCost: number;
}

/**
 * Cell types. The order is part of the save format and the hash: only ever
 * add new types at the end.
 */
export const CELL_TYPES = ["eater", "photo", "swim"] as const;
export type CellType = (typeof CELL_TYPES)[number];

export interface Cell {
  id: number;
  /** Which genome (species) the cell belongs to: index into world.genomes. */
  species: number;
  /** Which mode (recipe) of its genome the cell follows. */
  mode: number;
  /** Copied from the mode when the cell is born. */
  type: CellType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  /** Orientation in radians. The mode's split angle is relative to this. */
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

/**
 * A bond (adhesion) between two cells, by cell id. Each end remembers where
 * on its cell the bond is attached, as an angle relative to the cell's
 * orientation. That is what lets cells turn along with their organism.
 */
export interface Bond {
  a: number;
  b: number;
  /** Direction from a to b, relative to a's orientation, in radians. */
  angA: number;
  /** Direction from b to a, relative to b's orientation, in radians. */
  angB: number;
}

/** Record of one division this tick, used to hand bonds over to the daughters. */
export interface Division {
  parentId: number;
  /** Daughter on the + side of the division axis. */
  first: number;
  /** Daughter on the - side of the division axis. */
  second: number;
  /** Parent position just before it divided. */
  x: number;
  y: number;
  /** Unit vector of the division axis, pointing towards the first daughter. */
  dirX: number;
  dirY: number;
  /** Whether the two daughters bond to each other. */
  makeBond: boolean;
  /** Whether each daughter keeps the parent's bonds. */
  keepFirst: boolean;
  keepSecond: boolean;
}

export interface Scratch {
  cellGrid: SpatialGrid;
  foodGrid: SpatialGrid;
  /** Cell id -> index in world.cells. Rebuilt whenever the list changes. */
  indexById: Map<number, number>;
  /** Parent id -> division, for the current tick. */
  divisions: Map<number, Division>;
  /** Cell id -> number of bonds, while bonds are rebuilt. */
  bondDegree: Map<number, number>;
  /** Touching neighbours per cell index, counted during collisions. */
  contacts: Uint16Array;
  /** Sum of the directions each cell's bonds want it to face, per cell index. */
  turnX: Float64Array;
  turnY: Float64Array;
}

export interface World {
  readonly env: Environment;
  readonly seed: number;
  /** One genome per species. Normalised, never changed after creation. */
  readonly genomes: readonly Genome[];
  tick: number;
  readonly rng: Rng;
  cells: Cell[];
  food: Food[];
  bonds: Bond[];
  nextId: number;
  /** Fractional food carried over between ticks. */
  foodAccumulator: number;
  /** Reusable lookup structures. Not part of the simulation state. */
  readonly scratch: Scratch;
}

export function radiusOf(mass: number): number {
  return sqrt(mass);
}
