import type { SpatialGrid } from "./grid";
import { sqrt } from "./fmath";
import type { Genome } from "./genome";
import type { Rng } from "./rng";

export interface Environment {
  /** Inner width of the glass. x runs from 0 (left) to tankWidth (right). */
  tankWidth: number;
  /** Water depth. y runs from 0 (water surface) to tankHeight (bottom). */
  tankHeight: number;
  /**
   * New food particles per second, dropped in at the water surface. This adds
   * matter from outside, so a closed glass has 0 (feeding is a player action).
   */
  foodPerSecond: number;
  /** No new food is dropped in while this many particles float in the water (sludge not counted). */
  maxFood: number;
  /** Mass in one particle of food or dead matter. */
  foodMass: number;
  /** Random push food gets every tick (makes it drift like plankton). */
  foodKick: number;
  /** Food velocity multiplier per tick. */
  foodDamping: number;
  /** How fast food and dead matter sink: speed gained per tick, per tick. */
  foodSink: number;
  /** Random sideways step of sludge on the bottom per tick, so eaters there can reach it. */
  sludgeDrift: number;
  /** Share of the sludge that dissolves into nutrients per second, even without decomposers. */
  sludgeDissolve: number;
  /** Side length of a square in the nutrient grid. */
  nutrientCellSize: number;
  /** How fast nutrients spread between neighbouring squares, per tick (0–0.25). */
  nutrientDiffusion: number;
  /** Nutrients dissolved in the water of a fresh glass, per square. */
  initialNutrient: number;
  /** Largest share of its square's nutrients a light collector can take per tick. */
  nutrientUptake: number;
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
  /** Mass every cell burns per second. It is released as nutrients. */
  metabolism: number;
  /** Share of what an eater, grazer or hunter eats that becomes its own mass. The rest becomes nutrients. */
  digestEfficiency: number;
  /** Share of dead matter a decomposer keeps for itself. The rest becomes nutrients. */
  decomposerShare: number;
  /** Mass a grazer can bite off plant cells per second. */
  grazeRate: number;
  /** Mass a hunter can bite off animal cells per second. */
  huntRate: number;
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
export const CELL_TYPES = ["eater", "photo", "swim", "root", "grazer", "hunter", "decomposer"] as const;
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
  /** Which organism the cell belongs to. Daughters that stay attached keep it; buds get a new one. */
  organism: number;
  /** A root that has settled on the bottom and is fixed there for good. */
  anchored: boolean;
}

/** Plant cells: grazers eat these, hunters do not. */
export function isPlant(type: CellType): boolean {
  return type === "photo" || type === "root";
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
  /** Bite left this tick for each grazer and hunter, per cell index. */
  appetite: Float64Array;
  /** Next-step buffer for nutrient diffusion. */
  nutrientNext: Float64Array;
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
  /** Nutrients dissolved in the water, one value per grid square, row by row. */
  nutrients: Float64Array;
  /** Size of the nutrient grid. */
  readonly nutrientCols: number;
  readonly nutrientRows: number;
  nextId: number;
  nextOrganism: number;
  /** Species still to be released into the glass, sorted by tick. */
  arrivals: { tick: number; species: number }[];
  /** Starting orientation of founders, so late arrivals match early ones. */
  founderAngle: number;
  /** Fractional food carried over between ticks. */
  foodAccumulator: number;
  /** Reusable lookup structures. Not part of the simulation state. */
  readonly scratch: Scratch;
}

export function radiusOf(mass: number): number {
  return sqrt(mass);
}
