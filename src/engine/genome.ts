import { HALF_PI, TWO_PI } from "./fmath";
import { CELL_TYPES, type CellType } from "./model";

/**
 * The genome: a list of modes ("recipes"). Every cell follows one mode. When
 * it reaches the mode's split mass it divides, and each daughter gets the
 * mode the recipe names for it.
 *
 * Genomes are shared between players as JSON, so they must be treated as
 * untrusted: always run them through normalizeGenome() before use. Bump
 * GENOME_VERSION when the format changes.
 */
export const GENOME_VERSION = 1;

export const GENOME_LIMITS = {
  maxModes: 20,
  minSplitMass: 100,
  maxSplitMass: 400,
  maxNameLength: 40,
} as const;

export interface Mode {
  cellType: CellType;
  /** Whether cells in this mode divide at all. */
  canSplit: boolean;
  /** Mass at which the cell divides. */
  splitMass: number;
  /** Direction of division relative to the cell's orientation, in radians. */
  splitAngle: number;
  /** Modes the two daughters get: [+ side, - side]. */
  childModes: [number, number];
  /** How much each daughter is turned relative to the parent, in radians. */
  childTurns: [number, number];
  /** Whether the two daughters stay bonded to each other. */
  makeBond: boolean;
  /** Whether each daughter keeps the parent's bonds to its neighbours. */
  childKeepsBonds: [boolean, boolean];
  /** Display colour, "#rrggbb". Has no effect on the simulation. */
  color: string;
}

export interface Genome {
  version: number;
  name: string;
  /** Mode of the first cell. */
  startMode: number;
  modes: Mode[];
}

export const DEFAULT_MODE: Mode = {
  cellType: "eater",
  canSplit: true,
  splitMass: 200,
  splitAngle: 0,
  childModes: [0, 0],
  childTurns: [HALF_PI, -HALF_PI],
  makeBond: true,
  childKeepsBonds: [true, true],
  color: "#6ecdaa",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return v < min ? min : v > max ? max : v;
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  return Math.round(num(v, fallback, min, max));
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Wraps an angle into [-PI, PI]. */
function angle(v: unknown, fallback: number): number {
  const a = num(v, fallback, -1e6, 1e6);
  return a - Math.round(a / TWO_PI) * TWO_PI;
}

function pair<T>(v: unknown, read: (x: unknown, i: 0 | 1) => T): [T, T] {
  const arr = Array.isArray(v) ? v : [];
  return [read(arr[0], 0), read(arr[1], 1)];
}

function normalizeMode(raw: unknown, modeCount: number): Mode {
  const m = isRecord(raw) ? raw : {};
  const d = DEFAULT_MODE;
  const lastMode = modeCount - 1;
  return {
    cellType: CELL_TYPES.includes(m.cellType as CellType) ? (m.cellType as CellType) : d.cellType,
    canSplit: bool(m.canSplit, d.canSplit),
    splitMass: num(m.splitMass, d.splitMass, GENOME_LIMITS.minSplitMass, GENOME_LIMITS.maxSplitMass),
    splitAngle: angle(m.splitAngle, d.splitAngle),
    childModes: pair(m.childModes, (x) => int(x, 0, 0, lastMode)),
    childTurns: pair(m.childTurns, (x, i) => angle(x, d.childTurns[i])),
    makeBond: bool(m.makeBond, d.makeBond),
    childKeepsBonds: pair(m.childKeepsBonds, (x, i) => bool(x, d.childKeepsBonds[i])),
    color: typeof m.color === "string" && /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : d.color,
  };
}

/**
 * Turns any value (for example parsed JSON from another player) into a valid
 * genome. Missing or broken fields get defaults, numbers are clamped to the
 * allowed ranges and mode references are kept inside the mode list. The
 * result is deterministic, so every device builds the same genome.
 */
export function normalizeGenome(raw: unknown): Genome {
  const g = isRecord(raw) ? raw : {};
  const rawModes = Array.isArray(g.modes) ? g.modes.slice(0, GENOME_LIMITS.maxModes) : [];
  const count = Math.max(1, rawModes.length);
  const modes = rawModes.length > 0 ? rawModes.map((m) => normalizeMode(m, count)) : [normalizeMode({}, 1)];
  const name = typeof g.name === "string" ? g.name.slice(0, GENOME_LIMITS.maxNameLength) : "";
  return {
    version: GENOME_VERSION,
    name,
    startMode: int(g.startMode, 0, 0, modes.length - 1),
    modes,
  };
}

/** Builds a mode from the defaults plus the fields you want to change. */
export function mode(fields: Partial<Mode>): Mode {
  return { ...DEFAULT_MODE, ...fields };
}

/**
 * The standard organism: eaters that grow into a clump of 8 cells, after
 * which each cell keeps budding off single cells that start new clumps.
 */
export const DEFAULT_GENOME: Genome = {
  version: GENOME_VERSION,
  name: "Spiserklump",
  startMode: 0,
  modes: [
    mode({ childModes: [1, 1] }),
    mode({ childModes: [2, 2] }),
    mode({ childModes: [3, 3] }),
    mode({ childModes: [3, 0], makeBond: false, childKeepsBonds: [true, false] }),
  ],
};
