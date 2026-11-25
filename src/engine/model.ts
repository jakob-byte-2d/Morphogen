import type { SpatialGrid } from "./grid";
import { sqrt } from "./fmath";
import type { Genome } from "./genome";
import type { Rng } from "./rng";

export interface Environment {
  /** Inner width of the glass. x runs from 0 (left) to tankWidth (right). */
  tankWidth: number;
  /** Water depth. y runs from 0 (water surface) to tankHeight (bottom). */
  tankHeight: number;
  /** New food particles per second, dropped in at the water surface. */
  foodPerSecond: number;
  /** No new food is dropped in while this many particles float in the water (sludge not counted). */
  maxFood: number;
  /** Mass an eater gains from one food particle. */
  foodMass: number;
  /** Random push food gets every tick (makes it drift like plankton). */
  foodKick: number;
  /** Food velocity multiplier per tick. */
  foodDamping: number;
  /** How fast food and dead matter sink: speed gained per tick, per tick. */
  foodSink: number;
  /** Random sideways step of sludge on the bottom per tick, so eaters there can reach it. */
  sludgeDrift: number;
  /**
   * Share of the sludge that dissolves per second. For now it just disappears;
   * in phase 5 it will turn into nutrients in the water.
   */
  sludgeDissolve: number;
  /** Light strength at the water surface, 0 (dark) to 1 (full sun). */
  light: number;
  /** Depth at which the water has swallowed all the light. */
  lightDepth: number;
  /** Width of the light columns cells shade each other in. */
  lightColumnWidth: number;
  /** Share of the light a cell as wide as a column blocks for those below it. */
  shadePerCell: number;
  /** Mass a light collector gains per second in full light. */
  photoRate: number;
  /** Sinking (positive) or rising (negative) per cell type, as speed gained per second. */
  sink: Record<CellType, number>;
  /** Mass every cell burns per second. */
  metabolism: number;
  /** A cell dies below this mass. */
  minMass: number;
  /** No cell grows heavier than this; extra food is wasted. */
  maxCellMass: number;
  /** Cells stop dividing when the glass holds this many. Keeps phones fast. */
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

/**
 * A particle of organic matter: food dropped in at the surface, or what is
 * left of a dead cell. It sinks and settles on the bottom as sludge.
 */
export interface Food {
  x: number;
  y: number;
  /** Velocity in units per tick. */
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
  /** Light reaching each cell this tick, per cell index (0–1). */
  light: Float64Array;
  /** Sort key (column and depth) per cell index, for the light calculation. */
  lightKey: Float64Array;
  /** Cell indices sorted by light column and depth. */
  lightOrder: number[];
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
