import type { SpatialGrid } from "./grid";
import { sqrt } from "./fmath";
import type { Rng } from "./rng";

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
  /** Whether the two daughters of a division stay bonded. Moves to the genome in phase 2. */
  daughtersStick: boolean;
  /**
   * Stand-in for the genome until phase 2: cells of generation budEvery - 1
   * divide into one daughter that stays in the organism and one that breaks
   * free and starts a new organism. Organisms then reach 2^(budEvery-1) cells.
   * 0 = never bud.
   */
  budEvery: number;
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
}

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
  /** Divisions since the organism was founded (0 for a founder cell). */
  generation: number;
}

export interface Food {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** A bond (adhesion) between two cells, by cell id. */
export interface Bond {
  a: number;
  b: number;
}

/** Record of one division this tick, used to hand bonds over to the daughters. */
export interface Division {
  parentId: number;
  /** Daughter on the +angle side. */
  first: number;
  /** Daughter on the -angle side. */
  second: number;
  /** Parent position just before it divided. */
  x: number;
  y: number;
  /** Unit vector of the division axis, pointing towards the first daughter. */
  dirX: number;
  dirY: number;
  /** The second daughter breaks free: it keeps no bonds and starts a new organism. */
  secondBuds: boolean;
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
}

export interface World {
  readonly env: Environment;
  readonly seed: number;
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
